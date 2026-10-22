# Stress test

Generated 2026-10-22T16:29:58.723Z by `node bin/stress.js` in 348 s: 886 cells, 271,600 simulated loans, plus every setting replayed on 31 real token histories.

## Design

Every path is played under every lending setting, so settings are compared on identical paths. Borrowers are adversarial: they never cure and walk away whenever the stream is worth less than the debt. Losses are a share of the loan principal, before any backstop unless stated.

- **Factorial**: every price-path family × stream shape × shock size (9 × 3 × 3), other factors at baseline (σ 100%, full borrow, position = 0.2 days of volume, buyers want 60%/yr, clean oracle, 15% APR).
- **Covering array**: 145 cells in which every combination of levels of any three of the nine factors appears at least once (family 9, shape 3, severity 3, sigma 3, borrowShare 2, advRatio 3, buyerReturn 3, oracle 3, rate 3; a full factorial would be 39,366 cells).
- **Timing**: one overnight gap of 30%, 50%, 80% or 95% on every week of the loan year, and on the cliff and maturity days, for every shape.
- **History**: every setting replayed on real Binance daily history, a loan every 7 days, grouped by calendar month of origination to see correlated crashes (all tokens falling together).

Families: `gbm` (nothing happens), `volBurst` (σ ×2.5 after origination), `jumps` (Poisson drops), `gap` (one overnight drop on a random day), `bleed` (slow decline over the year), `vShape` (crash and recovery), `pumpDump` (+150% then a crash), `regime` (σ ×3 and −100%/yr drift from a random day), `bootstrap` (30-day blocks of real returns from the 31 tokens). In every crash family volume falls to 30%.

## Acceptance criteria

- **Unbacked**: no project backstop. On realistic paths (bootstrap of real returns, and the real histories) mean loss ≤ 0.5% and worst 1% ≤ 10%; the worst real calendar month of originations (at least 5 tokens) loses ≤ 3% on average.
- **Backed**: the project commits first-loss B per loan = the worst 1% realistic loss. After B, the worst real month loses ≤ 3% on average.
- **Seniors never lose** (both regimes): even if every loan in the pool takes the worst real month AND one token at the 10% concentration cap takes the worst loss seen anywhere in the grid, at once, junior (15% of the pool) and insurance (2%) absorb it all.
- **Borrowers**: in both regimes, at most 25% of loans are force-liquidated on health on the real histories (walking away at maturity is the borrower's choice and is not counted).
- **Invariants**: every simulated loan satisfies the settlement invariants (checked inline; a breach aborts the run). The theorems themselves are in `test/proofs.test.js`.

Revised once after the first run, for these reasons:

- Added after the first run: a borrower check. On lender loss alone v1 passed, because it liquidates about 84% of borrowers and the auction recovers the money. That breaks the rule that the protocol must not extort holders, so a setting must also force-liquidate (on health, not a walk-away at maturity) at most 25% of loans on the real histories, with borrowers who never cure, so real rates would be lower. A borrower who lets an underwater stream go at maturity is making their own choice and is not counted.
- The first run sized the backstop at the worst 1% of ALL stress paths. Those include overnight 95% gaps, which wipe out any loan above about 5% LTV, so the backstop came out at roughly the whole loan and the senior test passed trivially. The backstop is now sized on realistic paths; the extreme families are charged to junior and insurance through the concentration cap instead.
- The first run counted any calendar month with 5 loans as a cohort. Months in 2019 held only one or two tokens, so they measured concentration in one token, not a correlated crash. A cohort now needs at least 5 distinct tokens.

## Verdict

| Setting | Shape | Avg LTV | Forced liquidations (history) | Realistic: mean / worst 1% | History: mean / worst 1% | Worst month (≥5 tokens) | Unbacked | Backstop B | Worst month after B | Backed | Pool loss for seniors (unbacked → backed) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 25.0% | 84.4% | 0.00% / 0.0% | 0.02% / 0.0% | 2024-06: 0.00% | FAIL | 0.0% | 0.00% | FAIL | 10.4% → 10.4% |
| v1 (testnet) | cliff-12m | 25.0% | 84.4% | 0.72% / 17.6% | 0.13% / 0.0% | 2022-04: 1.16% | FAIL | 11.6% | 0.11% | FAIL | 11.6% → 9.3% |
| v1 (testnet) | cliff6-linear24 | 23.8% | 84.4% | 0.05% / 0.0% | 0.10% / 0.0% | 2022-04: 0.50% | FAIL | 0.0% | 0.50% | FAIL | 10.7% → 10.7% |
| v2 hold α 0.5%/5% | linear-12m | 14.3% | 7.4% | 0.07% / 0.0% | 0.01% / 0.0% | 2025-04: 0.10% | **PASS** | 0.0% | 0.10% | **PASS** | 11.6% → 11.6% |
| v2 hold α 0.5%/5% | cliff-12m | 3.5% | 5.3% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | **PASS** | 0.0% | 0.00% | **PASS** | 10.9% → 10.9% |
| v2 hold α 0.5%/5% | cliff6-linear24 | 4.6% | 4.9% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | **PASS** | 0.0% | 0.00% | **PASS** | 10.6% → 10.6% |
| v2 hold α 2%/10% | linear-12m | 18.8% | 18.1% | 0.17% / 5.8% | 0.04% / 0.0% | 2022-04: 0.66% | **PASS** | 1.2% | 0.50% | **PASS** | 11.8% → 11.5% |
| v2 hold α 2%/10% | cliff-12m | 5.7% | 13.6% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | **PASS** | 0.0% | 0.00% | **PASS** | 10.7% → 10.7% |
| v2 hold α 2%/10% | cliff6-linear24 | 7.1% | 12.9% | 0.01% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | **PASS** | 0.0% | 0.00% | **PASS** | 10.7% → 10.7% |
| v2 hold α 5%/20% | linear-12m | 23.7% | 32.5% | 0.54% / 16.0% | 0.20% / 7.5% | 2022-01: 1.47% | FAIL | 10.7% | 0.30% | FAIL | 12.8% → 10.5% |
| v2 hold α 5%/20% | cliff-12m | 8.4% | 17.2% | 0.09% / 0.0% | 0.02% / 0.0% | 2022-01: 1.02% | **PASS** | 0.0% | 1.02% | **PASS** | 11.9% → 11.9% |
| v2 hold α 5%/20% | cliff6-linear24 | 10.1% | 20.0% | 0.09% / 0.0% | 0.03% / 0.0% | 2022-01: 1.49% | **PASS** | 0.0% | 1.49% | **PASS** | 12.3% → 12.3% |
| v2 blend k 200%/100% | linear-12m | 29.7% | 39.3% | 0.46% / 12.9% | 0.31% / 9.3% | 2022-01: 4.99% | FAIL | 11.3% | 0.64% | FAIL | 16.3% → 10.8% |
| v2 blend k 200%/100% | cliff-12m | 9.6% | 18.2% | 0.07% / 0.0% | 0.01% / 0.0% | 2025-02: 0.08% | **PASS** | 0.0% | 0.08% | **PASS** | 11.5% → 11.5% |
| v2 blend k 200%/100% | cliff6-linear24 | 12.6% | 25.2% | 0.04% / 0.0% | 0.02% / 0.0% | 2021-12: 0.52% | FAIL | 0.0% | 0.52% | FAIL | 11.1% → 11.1% |
| v2 blend k 100%/50% | linear-12m | 43.2% | 62.6% | 1.77% / 25.0% | 1.70% / 25.9% | 2022-04: 11.27% | FAIL | 25.3% | 0.27% | FAIL | 22.9% → 9.3% |
| v2 blend k 100%/50% | cliff-12m | 25.2% | 63.6% | 3.96% / 34.0% | 1.40% / 26.9% | 2022-01: 11.18% | FAIL | 30.6% | 0.06% | FAIL | 22.8% → 8.6% |
| v2 blend k 100%/50% | cliff6-linear24 | 26.5% | 60.9% | 1.07% / 19.5% | 1.45% / 25.8% | 2022-02: 10.23% | FAIL | 22.9% | 1.65% | FAIL | 21.0% → 10.1% |
| v2 blend k 150%/75% | linear-12m | 35.5% | 50.6% | 0.84% / 17.4% | 0.71% / 15.9% | 2022-01: 6.52% | FAIL | 16.3% | 0.34% | FAIL | 18.0% → 10.2% |
| v2 blend k 150%/75% | cliff-12m | 15.4% | 41.2% | 0.68% / 18.5% | 0.20% / 7.0% | 2022-02: 1.45% | FAIL | 11.3% | 0.32% | FAIL | 12.6% → 10.4% |
| v2 blend k 150%/75% | cliff6-linear24 | 17.8% | 41.7% | 0.19% / 6.6% | 0.22% / 8.1% | 2021-12: 5.15% | FAIL | 8.1% | 0.98% | FAIL | 15.9% → 10.9% |

Backstop B is first loss per loan the project commits (a buyback, or treasury tokens or stablecoins in escrow), as a share of principal. Pool loss is what junior (15%) and insurance (2%) must absorb in the combined worst case; seniors lose only above 17%.

## Every design, every setting

| Setting | Shape | Design | Loans | Avg LTV | Liquidated | Forced | Loans with a loss | Mean loss | Worst 5% | Worst 1% | Worst 0.1% | Worst |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | factorial | 4320 | 25.0% | 93.3% | 93.3% | 6.5% | 3.51% | 30.5% | 82.7% | 91.8% | 97.7% |
| v1 (testnet) | linear-12m | covering | 9280 | 22.4% | 85.5% | 85.4% | 7.4% | 3.80% | 34.9% | 85.1% | 96.6% | 104.1% |
| v1 (testnet) | linear-12m | timing | 880 | 25.0% | 96.3% | 96.1% | 25.1% | 15.48% | 87.2% | 92.9% | 98.0% | 98.0% |
| v1 (testnet) | linear-12m | history | 3822 | 25.0% | 84.4% | 84.4% | 0.3% | 0.02% | 0.0% | 0.0% | 10.7% | 21.5% |
| v1 (testnet) | cliff-12m | factorial | 4320 | 25.0% | 93.5% | 93.5% | 8.2% | 4.32% | 41.4% | 89.8% | 95.2% | 99.4% |
| v1 (testnet) | cliff-12m | covering | 7360 | 21.9% | 85.2% | 85.2% | 13.5% | 3.64% | 29.4% | 67.1% | 91.2% | 104.0% |
| v1 (testnet) | cliff-12m | timing | 880 | 25.0% | 95.5% | 94.9% | 28.5% | 18.84% | 91.2% | 95.6% | 99.1% | 99.1% |
| v1 (testnet) | cliff-12m | history | 3822 | 25.0% | 84.4% | 84.4% | 0.7% | 0.13% | 0.0% | 0.0% | 34.4% | 43.0% |
| v1 (testnet) | cliff6-linear24 | factorial | 4320 | 23.8% | 93.3% | 93.3% | 7.7% | 4.15% | 40.2% | 88.9% | 95.1% | 100.5% |
| v1 (testnet) | cliff6-linear24 | covering | 6560 | 22.1% | 88.2% | 88.2% | 5.8% | 2.28% | 3.6% | 84.4% | 95.5% | 101.8% |
| v1 (testnet) | cliff6-linear24 | timing | 880 | 23.8% | 95.6% | 95.5% | 26.8% | 17.39% | 89.7% | 95.6% | 99.5% | 99.5% |
| v1 (testnet) | cliff6-linear24 | history | 3822 | 23.8% | 84.4% | 84.4% | 0.6% | 0.10% | 0.0% | 0.0% | 30.2% | 39.6% |
| v2 hold α 0.5%/5% | linear-12m | factorial | 4320 | 16.4% | 49.7% | 49.0% | 18.3% | 6.18% | 52.9% | 90.2% | 101.8% | 106.7% |
| v2 hold α 0.5%/5% | linear-12m | covering | 9280 | 17.4% | 38.6% | 38.0% | 18.6% | 7.74% | 62.8% | 93.2% | 102.9% | 114.7% |
| v2 hold α 0.5%/5% | linear-12m | timing | 880 | 33.0% | 74.0% | 71.6% | 52.0% | 32.09% | 97.8% | 102.5% | 107.2% | 107.2% |
| v2 hold α 0.5%/5% | linear-12m | history | 3822 | 14.3% | 7.4% | 7.4% | 0.2% | 0.01% | 0.0% | 0.0% | 1.9% | 8.4% |
| v2 hold α 0.5%/5% | cliff-12m | factorial | 4320 | 3.9% | 42.4% | 42.4% | 4.3% | 1.66% | 0.0% | 59.8% | 89.7% | 99.1% |
| v2 hold α 0.5%/5% | cliff-12m | covering | 7360 | 6.2% | 29.4% | 29.4% | 5.9% | 1.77% | 6.3% | 51.5% | 86.7% | 108.9% |
| v2 hold α 0.5%/5% | cliff-12m | timing | 880 | 16.2% | 66.8% | 65.9% | 42.2% | 25.71% | 90.5% | 97.9% | 103.5% | 103.5% |
| v2 hold α 0.5%/5% | cliff-12m | history | 3822 | 3.5% | 5.3% | 5.3% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 0.5%/5% | cliff6-linear24 | factorial | 4320 | 5.3% | 40.4% | 40.3% | 6.3% | 2.62% | 13.6% | 71.5% | 90.6% | 98.5% |
| v2 hold α 0.5%/5% | cliff6-linear24 | covering | 6560 | 6.0% | 25.4% | 25.4% | 3.4% | 0.63% | 0.0% | 22.4% | 80.6% | 95.5% |
| v2 hold α 0.5%/5% | cliff6-linear24 | timing | 880 | 17.9% | 67.2% | 65.5% | 44.1% | 27.42% | 93.7% | 102.1% | 105.7% | 105.7% |
| v2 hold α 0.5%/5% | cliff6-linear24 | history | 3822 | 4.6% | 4.9% | 4.9% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 2%/10% | linear-12m | factorial | 4320 | 21.5% | 61.0% | 60.5% | 22.1% | 7.59% | 58.6% | 91.2% | 103.6% | 105.6% |
| v2 hold α 2%/10% | linear-12m | covering | 9280 | 21.7% | 48.3% | 47.6% | 23.1% | 8.86% | 67.1% | 94.8% | 106.0% | 111.5% |
| v2 hold α 2%/10% | linear-12m | timing | 880 | 39.9% | 81.7% | 79.3% | 56.9% | 32.88% | 98.3% | 103.0% | 108.4% | 108.4% |
| v2 hold α 2%/10% | linear-12m | history | 3822 | 18.8% | 18.1% | 18.1% | 0.7% | 0.04% | 0.0% | 0.0% | 9.6% | 15.2% |
| v2 hold α 2%/10% | cliff-12m | factorial | 4320 | 6.6% | 51.7% | 51.6% | 7.5% | 3.36% | 31.3% | 75.9% | 96.2% | 105.2% |
| v2 hold α 2%/10% | cliff-12m | covering | 7360 | 8.7% | 37.2% | 37.1% | 9.3% | 3.23% | 28.1% | 68.1% | 92.8% | 104.7% |
| v2 hold α 2%/10% | cliff-12m | timing | 880 | 22.4% | 75.9% | 74.5% | 47.0% | 30.07% | 94.7% | 101.2% | 106.5% | 106.5% |
| v2 hold α 2%/10% | cliff-12m | history | 3822 | 5.7% | 13.6% | 13.6% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 2%/10% | cliff6-linear24 | factorial | 4320 | 8.3% | 51.9% | 51.7% | 9.4% | 4.04% | 36.3% | 82.0% | 95.9% | 99.2% |
| v2 hold α 2%/10% | cliff6-linear24 | covering | 6560 | 8.4% | 34.4% | 34.4% | 6.6% | 1.40% | 7.7% | 36.3% | 91.5% | 94.2% |
| v2 hold α 2%/10% | cliff6-linear24 | timing | 880 | 24.0% | 75.6% | 74.0% | 48.1% | 30.62% | 96.2% | 102.8% | 107.5% | 107.5% |
| v2 hold α 2%/10% | cliff6-linear24 | history | 3822 | 7.1% | 12.9% | 12.9% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 5%/20% | linear-12m | factorial | 4320 | 27.0% | 69.8% | 69.2% | 30.8% | 9.69% | 66.3% | 93.7% | 104.1% | 106.8% |
| v2 hold α 5%/20% | linear-12m | covering | 9280 | 26.1% | 56.3% | 55.7% | 31.1% | 10.51% | 71.1% | 96.0% | 107.9% | 113.1% |
| v2 hold α 5%/20% | linear-12m | timing | 880 | 46.6% | 86.3% | 84.4% | 63.4% | 33.56% | 98.9% | 104.6% | 107.8% | 107.8% |
| v2 hold α 5%/20% | linear-12m | history | 3822 | 23.7% | 32.8% | 32.5% | 4.0% | 0.20% | 0.0% | 7.5% | 16.6% | 34.6% |
| v2 hold α 5%/20% | cliff-12m | factorial | 4320 | 10.1% | 56.9% | 56.7% | 11.8% | 5.34% | 55.1% | 86.6% | 100.0% | 102.6% |
| v2 hold α 5%/20% | cliff-12m | covering | 7360 | 11.5% | 41.8% | 41.7% | 14.5% | 5.10% | 43.9% | 79.2% | 99.7% | 109.1% |
| v2 hold α 5%/20% | cliff-12m | timing | 880 | 28.9% | 79.7% | 78.3% | 55.6% | 34.70% | 97.7% | 103.0% | 106.5% | 106.5% |
| v2 hold α 5%/20% | cliff-12m | history | 3822 | 8.4% | 17.2% | 17.2% | 0.3% | 0.02% | 0.0% | 0.0% | 9.6% | 11.5% |
| v2 hold α 5%/20% | cliff6-linear24 | factorial | 4320 | 11.9% | 59.0% | 58.7% | 13.9% | 6.01% | 55.0% | 90.4% | 101.7% | 103.8% |
| v2 hold α 5%/20% | cliff6-linear24 | covering | 6560 | 11.2% | 41.4% | 41.3% | 12.4% | 3.02% | 25.3% | 52.2% | 91.8% | 100.7% |
| v2 hold α 5%/20% | cliff6-linear24 | timing | 880 | 30.4% | 80.2% | 79.0% | 59.4% | 34.37% | 97.8% | 103.2% | 108.0% | 108.0% |
| v2 hold α 5%/20% | cliff6-linear24 | history | 3822 | 10.1% | 20.0% | 20.0% | 0.5% | 0.03% | 0.0% | 0.0% | 14.6% | 17.1% |
| v2 blend k 200%/100% | linear-12m | factorial | 4320 | 30.9% | 71.9% | 71.4% | 33.3% | 10.27% | 68.5% | 94.0% | 103.7% | 106.8% |
| v2 blend k 200%/100% | linear-12m | covering | 9280 | 28.4% | 59.7% | 59.2% | 29.5% | 10.86% | 71.9% | 95.5% | 107.9% | 113.1% |
| v2 blend k 200%/100% | linear-12m | timing | 880 | 37.0% | 78.5% | 75.8% | 57.0% | 33.94% | 98.8% | 103.4% | 107.5% | 107.5% |
| v2 blend k 200%/100% | linear-12m | history | 3822 | 29.7% | 39.3% | 39.3% | 4.8% | 0.31% | 0.0% | 9.3% | 35.3% | 46.5% |
| v2 blend k 200%/100% | cliff-12m | factorial | 4320 | 9.7% | 53.2% | 53.1% | 16.0% | 6.30% | 59.2% | 87.3% | 102.3% | 105.9% |
| v2 blend k 200%/100% | cliff-12m | covering | 7360 | 10.7% | 45.5% | 45.4% | 13.1% | 4.16% | 34.3% | 80.3% | 102.5% | 113.8% |
| v2 blend k 200%/100% | cliff-12m | timing | 880 | 16.2% | 59.4% | 58.5% | 43.5% | 26.47% | 91.3% | 98.6% | 103.5% | 103.5% |
| v2 blend k 200%/100% | cliff-12m | history | 3822 | 9.6% | 18.2% | 18.2% | 0.2% | 0.01% | 0.0% | 0.0% | 5.8% | 18.2% |
| v2 blend k 200%/100% | cliff6-linear24 | factorial | 4320 | 12.8% | 58.1% | 57.8% | 18.3% | 7.07% | 60.0% | 92.4% | 101.7% | 106.1% |
| v2 blend k 200%/100% | cliff6-linear24 | covering | 6560 | 12.7% | 50.9% | 50.7% | 13.7% | 4.26% | 35.0% | 81.7% | 99.5% | 104.2% |
| v2 blend k 200%/100% | cliff6-linear24 | timing | 880 | 18.7% | 64.3% | 62.3% | 46.9% | 29.64% | 95.5% | 103.3% | 106.3% | 106.3% |
| v2 blend k 200%/100% | cliff6-linear24 | history | 3822 | 12.6% | 25.2% | 25.2% | 0.3% | 0.02% | 0.0% | 0.0% | 8.1% | 17.2% |
| v2 blend k 100%/50% | linear-12m | factorial | 4320 | 45.2% | 83.4% | 83.0% | 51.3% | 13.37% | 72.9% | 94.4% | 102.7% | 107.0% |
| v2 blend k 100%/50% | linear-12m | covering | 9280 | 39.7% | 71.7% | 71.3% | 41.9% | 12.96% | 74.2% | 96.5% | 108.4% | 116.1% |
| v2 blend k 100%/50% | linear-12m | timing | 880 | 51.9% | 90.5% | 88.8% | 71.4% | 32.32% | 98.3% | 104.4% | 107.0% | 107.0% |
| v2 blend k 100%/50% | linear-12m | history | 3822 | 43.2% | 62.6% | 62.6% | 21.4% | 1.70% | 10.6% | 25.9% | 48.9% | 54.9% |
| v2 blend k 100%/50% | cliff-12m | factorial | 4320 | 26.3% | 78.8% | 78.6% | 40.1% | 11.94% | 75.2% | 96.0% | 104.2% | 106.7% |
| v2 blend k 100%/50% | cliff-12m | covering | 7360 | 22.3% | 66.6% | 66.4% | 34.2% | 10.26% | 55.0% | 90.6% | 108.4% | 116.4% |
| v2 blend k 100%/50% | cliff-12m | timing | 880 | 30.2% | 79.4% | 77.6% | 63.6% | 37.68% | 98.8% | 103.6% | 106.7% | 106.7% |
| v2 blend k 100%/50% | cliff-12m | history | 3822 | 25.2% | 63.6% | 63.6% | 14.5% | 1.40% | 10.8% | 26.9% | 53.2% | 57.6% |
| v2 blend k 100%/50% | cliff6-linear24 | factorial | 4320 | 27.6% | 79.2% | 79.1% | 43.5% | 12.13% | 71.0% | 96.1% | 103.0% | 105.2% |
| v2 blend k 100%/50% | cliff6-linear24 | covering | 6560 | 24.1% | 70.5% | 70.4% | 35.7% | 9.18% | 46.5% | 89.8% | 100.4% | 104.0% |
| v2 blend k 100%/50% | cliff6-linear24 | timing | 880 | 31.8% | 79.9% | 78.1% | 65.1% | 35.84% | 98.9% | 103.4% | 107.3% | 107.3% |
| v2 blend k 100%/50% | cliff6-linear24 | history | 3822 | 26.5% | 60.9% | 60.9% | 16.4% | 1.45% | 9.5% | 25.8% | 49.7% | 58.7% |
| v2 blend k 150%/75% | linear-12m | factorial | 4320 | 37.0% | 78.1% | 77.7% | 39.3% | 11.57% | 70.8% | 94.6% | 104.5% | 106.9% |
| v2 blend k 150%/75% | linear-12m | covering | 9280 | 32.7% | 64.9% | 64.3% | 34.3% | 11.80% | 73.8% | 96.5% | 109.1% | 114.7% |
| v2 blend k 150%/75% | linear-12m | timing | 880 | 42.6% | 83.0% | 80.8% | 61.6% | 34.56% | 99.1% | 104.7% | 108.0% | 108.0% |
| v2 blend k 150%/75% | linear-12m | history | 3822 | 35.5% | 50.6% | 50.6% | 11.1% | 0.71% | 4.4% | 15.9% | 39.9% | 48.7% |
| v2 blend k 150%/75% | cliff-12m | factorial | 4320 | 15.9% | 66.0% | 65.9% | 21.8% | 8.65% | 70.0% | 92.3% | 100.8% | 104.5% |
| v2 blend k 150%/75% | cliff-12m | covering | 7360 | 14.3% | 54.0% | 53.9% | 20.4% | 6.13% | 42.3% | 86.4% | 105.2% | 111.7% |
| v2 blend k 150%/75% | cliff-12m | timing | 880 | 18.7% | 61.6% | 60.3% | 48.1% | 30.12% | 93.7% | 100.7% | 104.0% | 104.0% |
| v2 blend k 150%/75% | cliff-12m | history | 3822 | 15.4% | 41.2% | 41.2% | 2.7% | 0.20% | 0.0% | 7.0% | 25.3% | 37.6% |
| v2 blend k 150%/75% | cliff6-linear24 | factorial | 4320 | 18.5% | 68.5% | 68.3% | 25.3% | 8.94% | 67.7% | 95.1% | 103.0% | 105.6% |
| v2 blend k 150%/75% | cliff6-linear24 | covering | 6560 | 16.8% | 59.4% | 59.3% | 21.3% | 5.62% | 39.2% | 85.6% | 98.3% | 102.3% |
| v2 blend k 150%/75% | cliff6-linear24 | timing | 880 | 22.3% | 68.9% | 66.6% | 50.1% | 32.48% | 96.8% | 103.8% | 107.4% | 107.4% |
| v2 blend k 150%/75% | cliff6-linear24 | history | 3822 | 17.8% | 41.7% | 41.7% | 3.3% | 0.22% | 0.0% | 8.1% | 27.9% | 36.3% |

## By price-path family (factorial and covering cells)

| Setting | Shape | gbm | volBurst | jumps | gap | bleed | vShape | pumpDump | regime | bootstrap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 0.00% / 1% | 0.19% / 41% | 0.08% / 25% | 15.74% / 95% | 0.00% / 0% | 2.86% / 72% | 12.37% / 104% | 0.00% / 0% | 0.00% / 0% |
| v1 (testnet) | cliff-12m | 0.00% / 0% | 3.87% / 69% | 0.54% / 56% | 15.27% / 104% | 0.07% / 19% | 1.95% / 79% | 16.24% / 99% | 0.29% / 39% | 0.72% / 27% |
| v1 (testnet) | cliff6-linear24 | 0.32% / 24% | 0.24% / 40% | 0.48% / 43% | 13.46% / 102% | 0.02% / 10% | 0.16% / 57% | 12.61% / 100% | 0.06% / 29% | 0.05% / 31% |
| v2 hold α 0.5%/5% | linear-12m | 0.06% / 24% | 2.57% / 63% | 1.85% / 53% | 28.76% / 103% | 0.24% / 22% | 14.19% / 92% | 11.11% / 115% | 2.02% / 66% | 0.07% / 23% |
| v2 hold α 0.5%/5% | cliff-12m | 0.00% / 0% | 0.52% / 41% | 1.08% / 58% | 9.70% / 109% | 0.03% / 22% | 0.75% / 70% | 5.44% / 87% | 0.07% / 26% | 0.00% / 0% |
| v2 hold α 0.5%/5% | cliff6-linear24 | 0.00% / 0% | 0.72% / 36% | 0.97% / 56% | 8.50% / 99% | 0.08% / 14% | 0.73% / 68% | 1.92% / 89% | 0.30% / 45% | 0.00% / 0% |
| v2 hold α 2%/10% | linear-12m | 0.11% / 25% | 4.50% / 69% | 2.53% / 56% | 30.36% / 105% | 0.46% / 24% | 16.33% / 96% | 14.56% / 111% | 2.82% / 67% | 0.17% / 27% |
| v2 hold α 2%/10% | cliff-12m | 0.00% / 0% | 1.33% / 49% | 2.44% / 68% | 17.33% / 105% | 0.08% / 25% | 1.78% / 93% | 9.74% / 95% | 0.36% / 49% | 0.00% / 2% |
| v2 hold α 2%/10% | cliff6-linear24 | 0.00% / 0% | 1.88% / 49% | 2.10% / 62% | 11.66% / 99% | 0.16% / 21% | 1.75% / 61% | 4.23% / 97% | 0.52% / 55% | 0.01% / 6% |
| v2 hold α 5%/20% | linear-12m | 0.50% / 29% | 8.52% / 73% | 4.43% / 61% | 32.07% / 105% | 1.18% / 30% | 19.06% / 89% | 17.71% / 113% | 4.35% / 78% | 0.54% / 57% |
| v2 hold α 5%/20% | cliff-12m | 0.15% / 20% | 3.15% / 59% | 4.47% / 75% | 24.00% / 109% | 0.48% / 26% | 3.84% / 95% | 13.84% / 102% | 1.42% / 47% | 0.09% / 28% |
| v2 hold α 5%/20% | cliff6-linear24 | 0.05% / 12% | 4.47% / 58% | 4.20% / 67% | 15.70% / 104% | 0.91% / 23% | 3.89% / 75% | 7.20% / 102% | 1.40% / 52% | 0.09% / 37% |
| v2 blend k 200%/100% | linear-12m | 0.42% / 35% | 10.38% / 85% | 3.94% / 54% | 34.03% / 107% | 0.81% / 38% | 18.34% / 93% | 19.26% / 113% | 4.35% / 78% | 0.46% / 50% |
| v2 blend k 200%/100% | cliff-12m | 0.00% / 4% | 4.28% / 64% | 1.77% / 58% | 23.90% / 114% | 0.33% / 22% | 7.23% / 99% | 9.87% / 98% | 1.22% / 68% | 0.07% / 28% |
| v2 blend k 200%/100% | cliff6-linear24 | 0.08% / 15% | 2.33% / 60% | 2.40% / 56% | 21.82% / 106% | 0.39% / 22% | 6.68% / 81% | 12.77% / 102% | 2.17% / 58% | 0.04% / 11% |
| v2 blend k 100%/50% | linear-12m | 1.94% / 60% | 16.91% / 88% | 7.85% / 61% | 33.67% / 107% | 2.71% / 48% | 20.09% / 89% | 23.27% / 116% | 6.70% / 67% | 1.77% / 54% |
| v2 blend k 100%/50% | cliff-12m | 0.64% / 30% | 16.76% / 77% | 7.21% / 68% | 32.13% / 116% | 2.81% / 39% | 13.28% / 95% | 21.93% / 107% | 4.33% / 69% | 3.96% / 43% |
| v2 blend k 100%/50% | cliff6-linear24 | 3.14% / 52% | 10.19% / 71% | 9.49% / 71% | 27.45% / 105% | 3.17% / 50% | 11.54% / 90% | 20.26% / 103% | 6.43% / 62% | 1.07% / 41% |
| v2 blend k 150%/75% | linear-12m | 0.79% / 51% | 12.90% / 86% | 5.21% / 57% | 34.60% / 107% | 1.35% / 54% | 19.19% / 94% | 21.70% / 115% | 5.26% / 76% | 0.84% / 53% |
| v2 blend k 150%/75% | cliff-12m | 0.10% / 18% | 8.43% / 73% | 3.39% / 58% | 28.48% / 112% | 0.80% / 37% | 10.78% / 98% | 13.51% / 104% | 2.09% / 61% | 0.68% / 39% |
| v2 blend k 150%/75% | cliff6-linear24 | 0.61% / 25% | 4.55% / 56% | 4.47% / 62% | 24.36% / 106% | 1.03% / 32% | 8.22% / 87% | 15.94% / 102% | 3.13% / 71% | 0.19% / 27% |

Each entry: mean loss / worst loss.

## Gap timing: worst loss from one overnight gap on any week of the loan

Each cell has ordinary σ 60% noise around the gap, and the LTV is what each setting lends at that calm σ (v2 lends up to about 40% here, far above its 14–19% on real histories), so a loss is the gap plus the noise at the LTV actually lent. Gaps are outside every setting's diffusion model: this table is what the backstop, insurance and junior tranche are for.

| Setting | Shape | −30% | −50% | −80% | −95% |
| --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 0.0% | 0.0% | 55.1% (day 64) | 98.0% (day 365) |
| v1 (testnet) | cliff-12m | 0.0% | 28.1% (day 36) | 68.1% (day 50) | 99.1% (day 309) |
| v1 (testnet) | cliff6-linear24 | 0.0% | 18.7% (day 8) | 67.9% (day 78) | 99.5% (day 364) |
| v2 hold α 0.5%/5% | linear-12m | 16.7% (day 295) | 43.5% (day 365) | 85.0% (day 281) | 107.2% (day 344) |
| v2 hold α 0.5%/5% | cliff-12m | 15.2% (day 50) | 24.6% (day 127) | 82.9% (day 274) | 103.5% (day 358) |
| v2 hold α 0.5%/5% | cliff6-linear24 | 0.0% | 26.2% (day 288) | 82.3% (day 330) | 105.7% (day 344) |
| v2 hold α 2%/10% | linear-12m | 24.9% (day 365) | 43.7% (day 351) | 82.5% (day 330) | 108.4% (day 344) |
| v2 hold α 2%/10% | cliff-12m | 32.2% (day 50) | 42.1% (day 99) | 85.8% (day 288) | 106.5% (day 358) |
| v2 hold α 2%/10% | cliff6-linear24 | 15.5% (day 169) | 38.6% (day 197) | 88.0% (day 358) | 107.5% (day 364) |
| v2 hold α 5%/20% | linear-12m | 28.8% (day 113) | 51.2% (day 365) | 86.2% (day 351) | 107.8% (day 364) |
| v2 hold α 5%/20% | cliff-12m | 43.2% (day 50) | 53.5% (day 99) | 84.6% (day 358) | 106.5% (day 316) |
| v2 hold α 5%/20% | cliff6-linear24 | 33.2% (day 169) | 46.4% (day 120) | 89.8% (day 337) | 108.0% (day 351) |
| v2 blend k 200%/100% | linear-12m | 29.4% (day 316) | 46.4% (day 365) | 81.9% (day 99) | 107.5% (day 344) |
| v2 blend k 200%/100% | cliff-12m | 15.2% (day 50) | 39.4% (day 351) | 82.6% (day 274) | 103.5% (day 358) |
| v2 blend k 200%/100% | cliff6-linear24 | 15.7% (day 351) | 33.7% (day 365) | 82.8% (day 330) | 106.3% (day 344) |
| v2 blend k 100%/50% | linear-12m | 29.2% (day 50) | 47.9% (day 15) | 83.3% (day 260) | 107.0% (day 365) |
| v2 blend k 100%/50% | cliff-12m | 29.4% (day 85) | 51.2% (day 99) | 90.0% (day 288) | 106.7% (day 316) |
| v2 blend k 100%/50% | cliff6-linear24 | 37.1% (day 169) | 50.7% (day 197) | 91.6% (day 358) | 107.3% (day 351) |
| v2 blend k 150%/75% | linear-12m | 30.8% (day 365) | 46.6% (day 239) | 83.8% (day 351) | 108.0% (day 344) |
| v2 blend k 150%/75% | cliff-12m | 18.2% (day 364) | 46.4% (day 113) | 84.0% (day 316) | 104.0% (day 358) |
| v2 blend k 150%/75% | cliff6-linear24 | 10.3% (day 344) | 44.8% (day 295) | 87.7% (day 330) | 107.4% (day 330) |

## Unlock calendars on the real histories

The 27 tokens with a documented unlock schedule (DefiLlama emissions dataset: ALT, APT, ARB, BLUR, DYDX, DYM, EIGEN, ENA, ETHFI, IMX, INJ, JTO, JUP, LDO, MANTA, ONDO, OP, PENDLE, PYTH, SEI, STRK, SUI, TIA, W, WLD, ZK, ZRO), replayed without and with the unlock drift (price expected to fall by half the share of circulating supply unlocking within 30 days of each delivery).

| Setting | Shape | Avg LTV | Forced liquidations | Mean loss | Worst 1% | Worst |
| --- | --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 25.0% → 25.0% | 90.7% → 90.7% | 0.00% → 0.00% | 0.0% → 0.0% | 0.0% → 0.0% |
| v1 (testnet) | cliff-12m | 25.0% → 25.0% | 90.7% → 90.7% | 0.01% → 0.01% | 0.0% → 0.0% | 8.0% → 8.0% |
| v1 (testnet) | cliff6-linear24 | 23.8% → 23.8% | 90.7% → 90.7% | 0.00% → 0.00% | 0.0% → 0.0% | 2.5% → 2.5% |
| v2 hold α 0.5%/5% | linear-12m | 13.7% → 13.0% | 6.3% → 5.2% | 0.01% → 0.00% | 0.0% → 0.0% | 8.4% → 6.2% |
| v2 hold α 0.5%/5% | cliff-12m | 2.9% → 2.8% | 5.5% → 5.2% | 0.00% → 0.00% | 0.0% → 0.0% | 0.0% → 0.0% |
| v2 hold α 0.5%/5% | cliff6-linear24 | 4.1% → 3.9% | 4.9% → 4.8% | 0.00% → 0.00% | 0.0% → 0.0% | 0.0% → 0.0% |
| v2 hold α 2%/10% | linear-12m | 18.2% → 17.3% | 18.0% → 15.4% | 0.02% → 0.02% | 0.0% → 0.0% | 14.8% → 12.7% |
| v2 hold α 2%/10% | cliff-12m | 5.0% → 4.8% | 14.2% → 13.8% | 0.00% → 0.00% | 0.0% → 0.0% | 0.0% → 0.0% |
| v2 hold α 2%/10% | cliff6-linear24 | 6.5% → 6.2% | 13.0% → 12.4% | 0.00% → 0.00% | 0.0% → 0.0% | 0.0% → 0.0% |
| v2 hold α 5%/20% | linear-12m | 23.1% → 21.9% | 34.0% → 28.6% | 0.11% → 0.06% | 4.1% → 1.9% | 14.4% → 14.0% |
| v2 hold α 5%/20% | cliff-12m | 7.7% → 7.3% | 18.3% → 18.0% | 0.00% → 0.00% | 0.0% → 0.0% | 0.0% → 0.0% |
| v2 hold α 5%/20% | cliff6-linear24 | 9.4% → 9.0% | 21.2% → 19.8% | 0.00% → 0.00% | 0.0% → 0.0% | 2.0% → 0.0% |
| v2 blend k 200%/100% | linear-12m | 29.6% → 27.9% | 41.9% → 37.2% | 0.11% → 0.04% | 3.3% → 0.8% | 20.8% → 15.5% |
| v2 blend k 200%/100% | cliff-12m | 9.4% → 8.8% | 20.4% → 19.2% | 0.00% → 0.00% | 0.0% → 0.0% | 5.8% → 0.0% |
| v2 blend k 200%/100% | cliff6-linear24 | 12.4% → 11.7% | 27.5% → 25.2% | 0.00% → 0.00% | 0.0% → 0.0% | 4.1% → 2.6% |
| v2 blend k 100%/50% | linear-12m | 43.2% → 40.7% | 67.8% → 62.4% | 1.40% → 0.91% | 17.4% → 14.6% | 28.8% → 24.4% |
| v2 blend k 100%/50% | cliff-12m | 25.1% → 23.8% | 70.3% → 69.0% | 0.95% → 0.63% | 16.6% → 13.8% | 29.9% → 27.5% |
| v2 blend k 100%/50% | cliff6-linear24 | 26.5% → 25.0% | 67.1% → 64.5% | 1.06% → 0.69% | 17.2% → 14.1% | 33.3% → 30.7% |
| v2 blend k 150%/75% | linear-12m | 35.4% → 33.4% | 54.4% → 49.5% | 0.46% → 0.24% | 10.1% → 7.2% | 24.0% → 19.7% |
| v2 blend k 150%/75% | cliff-12m | 15.3% → 14.4% | 45.1% → 43.6% | 0.12% → 0.09% | 5.7% → 4.4% | 18.5% → 15.4% |
| v2 blend k 150%/75% | cliff6-linear24 | 17.7% → 16.7% | 45.1% → 42.2% | 0.09% → 0.04% | 3.1% → 1.3% | 14.7% → 8.1% |

## What this does not cover

- Unlock drift in the synthetic families: they have no unlock calendar; the drift is tested on the real histories above.
- Intraday paths: daily closes stand in for the oracle's time-weighted price.
- Real borrower behaviour: borrowers here never cure, which overstates liquidations.
- Partner buyback at better than auction prices: the backstop is modelled as cash first loss only.
