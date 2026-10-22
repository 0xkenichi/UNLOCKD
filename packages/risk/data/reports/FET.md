# FET — risk calibration

Generated 2026-10-22T12:21:22.529Z. Data: CoinGecko daily price and volume, 2025-10-23 to 2026-10-22 (364 daily returns); rank 2 assumed; unlocks not modelled; **1 suspected bad print(s) kept (2026-02-10) — volatility, Ω and cap may reflect the source rather than the market**. Rank 2. Every figure is reproducible from the seed in the policy.

## Recommendation

| Lever | Value | Call |
|---|---|---|
| Ω | 87.5% | guardian `updateOmega(token, 8750)` |
| Per-loan value cap | $422,646,840 | governor `setTokenMaxBorrowUsd(token, 422646840e6)` |

Out-of-sample validation: **passed**.

Binding limit: jump-diffusion · 2y (Ω ≤ 87.5%).

Were σ per token on chain, this haircut corresponds to σ ≈ 69% (the global value is applied to every token today).

## Market (from the token’s own history)

| Measure | Value |
|---|---|
| Spot | 0.19513 |
| Volatility 30d / 90d / EWMA | 115% / 104% / 103% |
| Jump-diffusion fit | σ 99%, 6.0 jumps/yr, mean 5% |
| Total volatility | 128% |
| Worst 3-day move (1st percentile) | -21% |
| Max drawdown in history | 67% |
| Average daily volume (30d) | $143,063,383 |

## Lenders, at the recommended Ω (out-of-sample)

| Model | Horizon | Expected loss / yr | Worst-1% loss | Liquidated | Lender return / yr | Pass |
|---|---|---|---|---|---|---|
| jump-diffusion | 0.25y | 0.00% | 0.0% | 51% | 10.2% | yes |
| bootstrap | 0.25y | 0.00% | 0.0% | 50% | 10.6% | yes |
| jump-diffusion | 0.5y | 0.01% | 0.3% | 72% | 7.6% | yes |
| bootstrap | 0.5y | 0.00% | 0.0% | 73% | 7.9% | yes |
| jump-diffusion | 1y | 0.00% | 0.4% | 85% | 5.4% | yes |
| bootstrap | 1y | 0.00% | 0.0% | 87% | 5.4% | yes |
| jump-diffusion | 2y | 0.05% | 9.6% | 93% | 3.5% | yes |
| bootstrap | 2y | 0.00% | 0.0% | 96% | 3.3% | yes |

## Stress

Enforced stresses are scaled to this token’s own history; the uniform library applies the same shocks to every token, for comparison.

| Scenario | Expected loss | Worst-1% loss | Limit |
|---|---|---|---|
| Crash −40% over 3 days (2× own worst 1%) | 0.0% | 0.0% | ≤ 10% |
| Collapse −60% over 14 days (2× own worst 1%) | 0.0% | 1.2% | ≤ 10% |
| Bear market −75% over 180 days | 0.0% | 1.3% | ≤ 5% |
| Grind −40% over a year | 0.0% | 1.8% | ≤ 2% |
| Unlock dump −35% over the 5 days before unlock | 0.0% | 3.2% | ≤ 10% |
| Uniform: Overnight gap −80% | 33.1% | 63.8% | reported |
| Uniform: Crash −70% over 3 days | 5.2% | 41.6% | reported |
| Uniform: Collapse −95% over 14 days | 0.1% | 12.9% | reported |

An overnight gap is not stopped by any LTV a borrower would accept; the insurance reserve must hold about 33% of exposure to this token to absorb one.

## Borrowers

| Horizon | Liquidated at max borrow | Price drop that triggers it | Borrow ≤ this share of max for ≤ 10% / ≤ 25% liquidation risk |
|---|---|---|---|
| 0.25y | 54% | 39% | 49% / 68% |
| 0.5y | 72% | 39% | 26% / 42% |
| 1y | 85% | 39% | 9% / 19% |
| 2y | 94% | 39% | 2% / 5% |

A liquidation costs the borrower up to 39% of the stream’s market value (what the auction buyer’s discount and price impact take, net of the surplus returned).

## Assumptions

Floating APR held at the rate model’s kink (15%). Auction buyers require 30%/yr to hold locked tokens and price in the square-root impact of selling them. Borrowers repay at maturity only when the stream is worth more than the debt (loans are non-recourse). A keeper starts liquidations on the day they become possible. Price paths are martingales: no drift up or down is assumed.
