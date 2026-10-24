# @vestra/risk — the risk engine

Off-chain maths for Vestra, in layers that check each other. Nothing here changes a contract:
it reproduces what the contracts compute, measures what that means for lenders and
borrowers on each token, and recommends the per-token parameters governance can set.

No dependencies. Node ≥ 20.

```bash
npm test                              # 50 tests, ~6 s, deterministic, no network
npm run audit -- --out out            # calibrate every synthetic fixture token
node bin/vestra-risk.js calibrate --csv prices.csv --symbol ABC --rank 2 --json abc.json --out abc.md
node bin/vestra-risk.js monitor   --csv prices.csv --snapshot abc.json --token 0x…
```

## Real data: the daily refresh

```bash
npm run refresh                       # every token in data/tokens.json (~1 min: public API pauses)
npm run refresh -- --only arbitrum --recalibrate
```

`bin/refresh.js` fetches each token's daily price and volume from CoinGecko's public API (no
key; the same source `packages/backend` uses; set `COINGECKO_API_KEY` for a demo key), writes
`data/history/<id>.csv` (date,price,volume_usd — what `calibrate` reads; not committed), keeps
each token's calibration while `monitor` says it holds (recalibrating when it does not, after
30 days, or when the rank changes), and writes:

- `data/snapshots.json` — spot, volatility, ADV, Ω, per-loan cap, monitor alerts and data-quality
  flags per token, with the source and data date. The backend serves it at
  `GET /api/risk/tokens/:address` (every contract address CoinGecko lists for the coin), and the
  Borrow page's liquidation outlook reads it.
- `data/REPORT.md` — each token's calibration with its source and date; `data/reports/<SYM>.md`
  — the full calibration report, rewritten when a token is recalibrated.

Not covered: unlock schedules (no keyless source — DefiLlama emissions needs a paid key; add dated
unlocks to `tokens.json` by hand), and ranks (`rankBasis: "assumed"` until governance assigns
them). Days that look like bad prints (a ≥ 0.25 log move undone within 2 days) are flagged and
kept, so a flagged token's volatility may be overstated. Parsing and the refresh step are tested
on a recorded response (`test/ingest.test.js`, `test/fixtures/`); tests never touch the network.

## Backtest on real history

```bash
node bin/fetch-binance.js             # full daily history since listing, 31 tokens, Binance public API (no key)
node bin/backtest.js [--mode hold|blend] [--buyer 0.6] [--tag name]   # v1 vs v2, every loan replayed
node bin/frontier.js [--buyer 0.6]    # how much v2 lends vs liquidations vs lender loss, over a grid of settings
```

`src/v2.js` is the yellow paper's model (schedule tranches, credit value at two confidence levels,
interest-drift cap); `src/backtest.js` plays loans forward on real prices under v1 or v2 rules,
including v2's cure window, capped paydown from vested tokens and the sale. Results and what they
mean: `FINDINGS.md` §5, `data/FRONTIER.md`, `data/BACKTEST*.md`. Raw history is not committed.

## Proofs and the stress test

```bash
node --test test/proofs.test.js       # the theorems, on thousands of random draws (PROOF_SEED=n for fresh ones)
node bin/fetch-unlocks.js             # documented unlock calendars, DefiLlama emissions dataset (no key)
node bin/stress.js [--paths 160]      # the whole stress grid on every core; writes data/STRESS.md
node bin/post-risk.js ARB [--send --token 0x…]   # the RiskOracle inputs (σ, volume, unlock drag) for a token
```

`bin/post-risk.js` is the measurement layer the yellow paper describes: σ = max(30-day, 90-day,
EWMA) from the Binance history, the median 30-day volume, and the unlock drag from the worst
30-day unlock window anywhere inside the maximum loan term, so a loan opened today is priced for
the heaviest unlock it can live through. With `--send` it calls `RiskOracle.postRisk` (needs
`RPC_URL`, `PRIVATE_KEY`, `RISK_ORACLE`); run it daily from a keeper.

`docs/RISK_PROOFS.md` (repo root) states each theorem the papers rely on and how it is proved.
The theorems cover interest, time, vesting, accounting and settlement when the price does not
move. `src/scenarios.js` and `src/stress.js` cover what no theorem can: price-path families
(GBM, volatility bursts, jumps, overnight gaps on every week of the loan, bleeds, V-shapes,
pump-and-dumps, regime switches, and a block bootstrap of real returns), crossed with
stream shape, shock size, σ, borrow share, liquidity, buyers' required return, oracle staleness
or manipulation and rate. The crossing is a full factorial on the core factors plus a 3-wise
covering array over all nine. Every setting is also replayed on the real histories, with and
without unlock calendars, and judged against acceptance criteria written into `bin/stress.js`.

## Layers

| Layer | File | What it does | How it is proved |
|---|---|---|---|
| 1. On-chain mirror | `src/onchain.js`, `src/params.js` | `ValuationEngine`, `LoanManager` and `LendingPool` maths, line for line, with the contracts' integer steps | Hand-worked values from the Solidity; seeded fuzzing of the invariants (`test/onchain`, `test/properties`) |
| 2. Market | `src/market.js`, `src/profile.js` | Each token's volatility (30d, 90d, EWMA, downside), jump-diffusion fit, tails, drawdown, liquidity and supply overhang — from its own history | Recovers the parameters of histories generated from known models (`test/market`) |
| 3. Simulation | `src/paths.js`, `src/simulate.js` | Plays loans forward on thousands of price paths under the exact contract rules: interest, daily health checks, the borrower's choice at maturity, the Dutch auction hour by hour, settlement | Exact where the answer is known (zero volatility, interest-only liquidation day); agrees with the first-passage closed form within 2 pp; two independent price models agree (`test/simulate`) |
| 3b. Closed forms | `src/analytic.js` | Liquidation trigger price, liquidation probability, safe borrow amount — fast enough for the browser | Must match layer 1 exactly and layer 3 statistically |
| 4. Calibration | `src/calibrate.js` | Largest Ω (and a per-loan cap) that meets the policy under every price model and every enforced stress, then re-checked on unseen paths | Out-of-sample validation in every run; direction checks (gappier ⇒ less credit, stricter ⇒ less credit, thinner ⇒ smaller cap) (`test/calibrate`) |
| 5. Monitoring | `src/monitor.js` | Compares today's market with the calibration's: volatility spike ⇒ act now (lower Ω), drift ⇒ recalibrate; builds the `updateRiskParams` telemetry call | `test/calibrate` |

Because every parameter is re-derived from the token's own data, the maths moves with the
token: run `monitor` on each new day of prices, and `calibrate` whenever it says so.

## Policy (governance's numbers, in `DEFAULT_POLICY`)

- Expected lender loss ≤ 0.5% of principal per year; the worst 1% of outcomes average ≤ 10%.
- Enforced stresses, scaled to the token's own history: a crash over 3 days and a collapse over 14 days of twice the token's worst-1% move (never milder than −40% / −60%); a −75% bear market over 180 days; a −40% grind over a year; a −35% dump into the unlock.
- Reported, not enforced: an overnight −80% gap (no LTV a borrower would accept stops it; it sizes the insurance reserve), and the same uniform shocks for every token, for comparison.
- A forced sale may move the price at most 15% (per-loan cap).

## Assumptions (change them in `DEFAULT_ASSUMPTIONS`; every report states them)

- Floating APR held at the kink, 15%.
- Auction buyers require 30% a year to hold locked tokens, and price in the square-root impact of selling them (impact ≈ daily σ × √(size / daily volume)).
- Borrowers repay at maturity only if the stream is worth more than the debt: loans are non-recourse.
- Keepers start a liquidation on the day it becomes possible.
- Price paths are martingales: no drift up or down. An unlock drops the price by 0.5 × the share of supply unlocking (an assumption, not a fit — replace it with measured post-unlock returns when there are enough).
- Fixture tokens are synthetic, generated from stated parameters. They make no claim about any real token.

## What it has found so far

See `FINDINGS.md`.
