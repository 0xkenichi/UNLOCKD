# Findings — what the engine says about the deployed parameters

Measured against the contracts at ef2e300 with the defaults in `src/params.js`.
Reproduce any figure with `npm test` or `npm run audit`; the synthetic tokens are stated
models, not market data.

## 1. Lenders are well protected — except against overnight gaps

With continuous price moves a loan is liquidated while the stream is still worth about
three times its debt, so the auction clears above the debt. Across all four fixture tokens,
expected lender loss is 0.00% a year and the worst-1% outcome is ≤ 0.1% of principal.

Losses come from gaps: a −80% overnight move costs lenders 41% of principal on a rank II
loan at max (60% on rank I, 5% on rank III); a uniform −70% crash over 3 days costs 7.7%.
No LTV a borrower would accept prevents this — it is what the insurance reserve is for, and
the reserve should be sized to the gap loss on outstanding exposure per token.

## 2. Borrowers at max LTV are usually liquidated

The price drop that triggers liquidation at max borrow is fixed by the rank, not by the token:

| Rank | Max LTV → threshold | Buffer | Liquidated within 1 year at σ = 40% / 60% / 90% / 120% |
|---|---|---|---|
| I | 50% → 65% | 23% | 67% / 78% / 87% / 92% |
| II | 35% → 50% | 30% | 51% / 68% / 81% / 88% |
| III | 20% → 35% | 43% | 24% / 47% / 68% / 80% |

(Closed form, confirmed by simulation within 2 pp.) A liquidation costs the borrower 20–39%
of the stream's market value: the auction buyer's discount for locked tokens and the price
impact, net of the surplus returned.

Two consequences:
- **Rank I, the "best" collateral, has the thinnest buffer.** Under a fast crash it is the
  first to lose lender money.
- **The haircut ignores the token and the time.** `(1 − σ/2)` uses one global σ (50%) for
  every token and does not grow with time to unlock; the buffer `1 − LTV/threshold` is the
  same for a stablecoin-like token and a memecoin, for one month or three years.

## 3. Interest alone can liquidate a loan

Debt grows at the floating APR; collateral value grows only at the rank's discount rate as
the time discount unwinds. With no price move at all, a loan at max is liquidated after:

| Borrow APR | Rank I | Rank II | Rank III |
|---|---|---|---|
| 15% (kink) | 2.0 years | 3.6 years | 11.2 years |
| 45% | 7.3 months | 10.7 months | 1.6 years |
| 75% (100% utilisation) | 4.4 months | 6.1 months | 10.3 months |

A spike in pool utilisation therefore pushes every open loan toward liquidation at once.

## 4. Documents and code disagree

`packages/docs/RISK_MODELS.md` describes a time-scaled volatility haircut `1 − σ·√t`,
per-token σ and a liquidity factor. The contracts implement `(1 − σ/2)` with one global σ.

## Suggestions for the contract rebuild (not made here)

1. **Per-token σ, scaled by time:** e.g. haircut `= 1 − min(cap, k·σ_token·√T)`, with σ_token
   set by governance from this engine's calibration (`sigmaEquivalentPct` in each report).
2. **Make the buffer depend on risk:** set the liquidation threshold per rank *and* token so
   that `1 − LTV/threshold` covers a k-day move of the token (e.g. 3× its daily σ × √3),
   instead of a fixed gap. Rank I in particular needs a wider gap.
3. **Bound the interest drift:** cap the borrow APR a loan can accrue relative to its
   collateral's discount rate, or accrue against a fixed rate per loan, so utilisation spikes
   cannot liquidate healthy loans en masse.
4. **Size insurance to gap risk:** target reserve ≥ Σ (exposure × gap loss) per token, using
   the reported gap figure.

Until then, the per-token levers that exist (Ω, hard LTV cap, per-loan value cap) are what
`calibrate` sets, and the Borrow page shows each borrower the price that would liquidate
them before they borrow.

## 5. Backtest on real history: how much can be lent safely (October 2026)

`node bin/fetch-binance.js && node bin/frontier.js` replays a loan every 14 days on 31 tokens'
full Binance daily history (ARB, OP, APT, SUI, TIA, STRK, JUP, LDO, FET, ENA, ZK, EIGEN, ETH and
others; 559 to 3,353 days each). Borrowers are adversarial: they take the maximum, never cure, and
walk away when underwater. Auction buyers require 60% a year. Losses are before any backstop.
Full tables: `data/FRONTIER.md`, `data/BACKTEST*.md`.

| Stream, 12 months | Setting | Avg LTV | Liquidated | Loans with a loss | Mean loss | Worst 1% |
|---|---|---|---|---|---|---|
| Linear | v1 testnet | 25.0% | 84.4% | 0.3% | 0.03% | 0.0% |
| Linear | v2 as written (hold, α 0.5% / 5%) | 14.3% | 7.3% | 0.1% | 0.00% | 0.0% |
| Linear | v2 hold, α 2% / 10% | 18.8% | 18.4% | 0.8% | 0.03% | 0.0% |
| Linear | v2 hold, α 5% / 20% | 23.7% | 31.8% | 3.8% | 0.20% | 6.9% |
| Cliff | v1 testnet | 25.0% | 84.4% | 0.6% | 0.14% | 0.0% |
| Cliff | v2 as written | 3.4% | 5.3% | 0.0% | 0.00% | 0.0% |
| Cliff | v2 blend, k 200% / 100% | 9.6% | 18.6% | 0.2% | 0.02% | 0.0% |
| Cliff | v2 blend, k 150% / 75% | 15.4% | 41.2% | 2.9% | 0.20% | 8.0% |
| Cliff | v2 blend, k 100% / 50% | 25.2% | 63.5% | 15.1% | 1.45% | 26.9% |

What it means:

- **v1 is safe for lenders only because it liquidates 84% of borrowers within a year.** Its fixed
  thresholds trigger early, so auctions clear above the debt — at the cost of almost every borrower
  and a locked claim sold into the market each time.
- **v2 as the yellow paper wrote it is safe but lends too little to be useful,** above all on
  cliffs (3.4%). It assumes the lender must hold every tranche to its unlock.
- **Valuing the claim as a sale to buyers (blend) lends more, but losses rise fast** once buyers
  demand crash-level returns; at 25% LTV on cliffs, 15% of loans lose money.
- **Without an issuer backstop, the safe ceiling on this sample is roughly 19–24% LTV for linear
  streams and 10–15% for 12-month cliffs.** The sample is harsh but representative: launched
  tokens with vesting, many of which fell 80–95% over the period.
- **Useful LTVs (30–50%) therefore need the partner backstop to carry first loss,** sized to the
  worst-1% loss at the offered LTV: roughly 8% of principal at 15% LTV on cliffs, 27% at 25%.

Not yet modelled: whole-token unlock calendars (the drift term), intraday gaps, partner vetting
(which would remove some of the worst tokens), and real borrower behaviour.

## 6. Proofs and the stress test: the calibrated operating point (October 2026)

**Proofs.** `docs/RISK_PROOFS.md` states twelve theorems: bounds, conservation, monotonicity in
confidence, volatility, time, size and price, never liquidatable at an unchanged price (with and
without unlock calendars), paydown accounting, settlement, and grid soundness.
`test/proofs.test.js` checks each one on thousands of seeded random draws, and it passes on 9
different seeds. Two of the checks found real holes, now fixed:
- Per-tranche liquidity cost made credit value fall as tranches merged into escrow. Square-root impact is superadditive, so the cost is now charged on the whole position.
- The interest-drift cap was checked only at grid points. A cliff loan at 67% APR became liquidatable between them. The cap is now a proven lower bound over every interval, or a daily check when unlock data is present.

**Stress.** `bin/stress.js` ran 886 cells, 271,600 simulated loans, plus every setting replayed on
31 real histories. The design:
- A full factorial of path family × shape × shock size.
- A 3-wise covering array over nine factors (family, shape, shock, σ, borrow share, liquidity, buyers' return, oracle, rate).
- One overnight gap of every size on every week of the loan.

Acceptance criteria are written into the script, including the two revisions made after the
first run and why. In full: `data/STRESS.md`.

| Stream | Highest LTV passing every criterion with no backstop | Setting |
|---|---|---|
| Linear, 12 months | **18.8%** | hold, α 2% / 10% |
| Cliff, 12 months | **9.6%** | blend, k 200% / 100% |
| 6-month cliff then linear | **10.1%** | hold, α 5% / 20% |

What it means:

- **The unbacked operating point holds:** about 19% LTV on linear streams and 10% on cliffs.
  - Lenders lose under 0.2% on average on realistic paths.
  - The worst real month lost at most 1.5%.
  - Under 25% of never-curing borrowers are force-liquidated.
  - Seniors are untouched even if the worst real month and a total wipeout of one token at the concentration cap hit together.
- **A backstop makes higher LTVs safe for lenders, but not for borrowers.** At 30–43% LTV:
  - A first-loss backstop of 11–31% of principal brings every lender criterion back within limits.
  - But 39–64% of borrowers who never cure would be force-liquidated within a year.
  - By the rule that the protocol must not extort holders, higher LTVs should be opt-in, sold as such, with alerts and a cure path, not the default.
- **Unlock calendars help slightly.** On the 27 tokens with a documented schedule, the drift lowers LTV by about 5% relative (18.2% → 17.3% on linear streams). It also lowers forced liquidations and worst-case losses at every setting.
- **No setting survives an overnight 80–95% gap without loss.** Gaps sit outside every diffusion model. They are what the backstop, insurance and junior tranche are sized for, and the concentration cap is what keeps one token's gap from reaching seniors.
- **v1 fails the borrower test outright:** it force-liquidates 84% of loans.
