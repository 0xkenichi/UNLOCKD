# @vestra/risk — the risk engine

Off-chain maths for Vestra, in layers that check each other. Nothing here changes a contract:
it reproduces what the contracts compute, measures what that means for lenders and
borrowers on each token, and recommends the per-token parameters governance can set.

No dependencies. Node ≥ 20.

```bash
npm test                              # 40 tests, ~5 s, deterministic
npm run audit -- --out out            # calibrate every synthetic fixture token
node bin/vestra-risk.js calibrate --csv prices.csv --symbol ABC --rank 2 --json abc.json --out abc.md
node bin/vestra-risk.js monitor   --csv prices.csv --snapshot abc.json --token 0x…
```

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
