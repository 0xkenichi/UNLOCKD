# LDO — risk calibration

Generated 2026-10-22T12:21:12.439Z. Data: CoinGecko daily price and volume, 2025-10-23 to 2026-10-22 (364 daily returns); rank 2 assumed; unlocks not modelled; **5 suspected bad print(s) kept (2026-02-10, 2026-02-22, 2026-03-08, 2026-03-12, 2026-03-21) — volatility, Ω and cap may reflect the source rather than the market**. Rank 2. Every figure is reproducible from the seed in the policy.

## Recommendation

**No new credit.** No Ω above 5.0% meets the policy. Guardian: `updateOmega(token, 0)`.

## Market (from the token’s own history)

| Measure | Value |
|---|---|
| Spot | 0.40484 |
| Volatility 30d / 90d / EWMA | 118% / 96% / 98% |
| Jump-diffusion fit | σ 93%, 19.1 jumps/yr, mean -7% |
| Total volatility | 220% |
| Worst 3-day move (1st percentile) | -46% |
| Max drawdown in history | 75% |
| Average daily volume (30d) | $60,626,485 |

## Stress

Enforced stresses are scaled to this token’s own history; the uniform library applies the same shocks to every token, for comparison.

| Scenario | Expected loss | Worst-1% loss | Limit |
|---|---|---|---|
| Crash −71% over 3 days (2× own worst 1%) | 11.7% | 67.8% | ≤ 10% |
| Collapse −71% over 14 days (2× own worst 1%) | 0.6% | 34.4% | ≤ 10% |
| Bear market −75% over 180 days | 0.8% | 44.7% | ≤ 5% |
| Grind −40% over a year | 0.7% | 38.7% | ≤ 2% |
| Unlock dump −35% over the 5 days before unlock | 0.7% | 41.1% | ≤ 10% |
| Uniform: Overnight gap −80% | 38.3% | 77.8% | reported |
| Uniform: Crash −70% over 3 days | 9.8% | 66.2% | reported |
| Uniform: Collapse −95% over 14 days | 0.9% | 53.4% | reported |

An overnight gap is not stopped by any LTV a borrower would accept; the insurance reserve must hold about 38% of exposure to this token to absorb one.

## Borrowers

| Horizon | Liquidated at max borrow | Price drop that triggers it | Borrow ≤ this share of max for ≤ 10% / ≤ 25% liquidation risk |
|---|---|---|---|
| 0.25y | — | — | 0% / 0% |
| 0.5y | — | — | 0% / 0% |
| 1y | — | — | 0% / 0% |
| 2y | — | — | 0% / 0% |

## Assumptions

Floating APR held at the rate model’s kink (15%). Auction buyers require 30%/yr to hold locked tokens and price in the square-root impact of selling them. Borrowers repay at maturity only when the stream is worth more than the debt (loans are non-recourse). A keeper starts liquidations on the day they become possible. Price paths are martingales: no drift up or down is assumed.
