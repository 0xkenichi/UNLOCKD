# ARB — risk calibration

Generated 2026-10-22T12:11:38.644Z. Data: CoinGecko daily price and volume, 2025-10-23 to 2026-10-22 (364 daily returns); rank 2 assumed; unlocks not modelled. Rank 2. Every figure is reproducible from the seed in the policy.

## Recommendation

| Lever | Value | Call |
|---|---|---|
| Ω | 100.0% | guardian `updateOmega(token, 10000)` |
| Per-loan value cap | $932,465,071 | governor `setTokenMaxBorrowUsd(token, 932465071e6)` |

Out-of-sample validation: **passed**.

No limit binds at Ω = 100%: the token could carry more credit than its rank allows.

Were σ per token on chain, this haircut corresponds to σ ≈ 50% (the global value is applied to every token today).

## Market (from the token’s own history)

| Measure | Value |
|---|---|
| Spot | 0.18792 |
| Volatility 30d / 90d / EWMA | 99% / 136% / 116% |
| Jump-diffusion fit | σ 81%, 6.0 jumps/yr, mean 10% |
| Total volatility | 100% |
| Worst 3-day move (1st percentile) | -19% |
| Max drawdown in history | 78% |
| Average daily volume (30d) | $226,419,401 |

## Lenders, at the recommended Ω (out-of-sample)

| Model | Horizon | Expected loss / yr | Worst-1% loss | Liquidated | Lender return / yr | Pass |
|---|---|---|---|---|---|---|
| jump-diffusion | 0.25y | 0.00% | 0.0% | 53% | 9.8% | yes |
| bootstrap | 0.25y | 0.00% | 0.0% | 57% | 9.5% | yes |
| jump-diffusion | 0.5y | 0.00% | 0.0% | 72% | 7.4% | yes |
| bootstrap | 0.5y | 0.00% | 0.0% | 75% | 7.0% | yes |
| jump-diffusion | 1y | 0.00% | 0.0% | 84% | 5.4% | yes |
| bootstrap | 1y | 0.00% | 0.0% | 86% | 5.0% | yes |
| jump-diffusion | 2y | 0.00% | 0.4% | 93% | 3.6% | yes |
| bootstrap | 2y | 0.00% | 0.0% | 94% | 3.3% | yes |

## Stress

Enforced stresses are scaled to this token’s own history; the uniform library applies the same shocks to every token, for comparison.

| Scenario | Expected loss | Worst-1% loss | Limit |
|---|---|---|---|
| Crash −40% over 3 days (2× own worst 1%) | 0.0% | 0.0% | ≤ 10% |
| Collapse −60% over 14 days (2× own worst 1%) | 0.0% | 0.0% | ≤ 10% |
| Bear market −75% over 180 days | 0.0% | 0.0% | ≤ 5% |
| Grind −40% over a year | 0.0% | 0.0% | ≤ 2% |
| Unlock dump −35% over the 5 days before unlock | 0.0% | 0.0% | ≤ 10% |
| Uniform: Overnight gap −80% | 41.4% | 61.2% | reported |
| Uniform: Crash −70% over 3 days | 7.8% | 38.7% | reported |
| Uniform: Collapse −95% over 14 days | 0.0% | 3.6% | reported |

An overnight gap is not stopped by any LTV a borrower would accept; the insurance reserve must hold about 41% of exposure to this token to absorb one.

## Borrowers

| Horizon | Liquidated at max borrow | Price drop that triggers it | Borrow ≤ this share of max for ≤ 10% / ≤ 25% liquidation risk |
|---|---|---|---|
| 0.25y | 61% | 30% | 48% / 66% |
| 0.5y | 77% | 30% | 28% / 43% |
| 1y | 88% | 30% | 11% / 21% |
| 2y | 95% | 30% | 3% / 6% |

A liquidation costs the borrower up to 39% of the stream’s market value (what the auction buyer’s discount and price impact take, net of the surplus returned).

## Assumptions

Floating APR held at the rate model’s kink (15%). Auction buyers require 30%/yr to hold locked tokens and price in the square-root impact of selling them. Borrowers repay at maturity only when the stream is worth more than the debt (loans are non-recourse). A keeper starts liquidations on the day they become possible. Price paths are martingales: no drift up or down is assumed.
