# Stress test

Generated 2026-10-22T17:09:13.245Z by `STRESS_SEED=2 node bin/stress.js` in 399 s: 905 cells, 251,040 simulated loans, plus every setting replayed on 31 real token histories.

## Design

Every path is played under every lending setting, so settings are compared on identical paths. Borrowers are adversarial (never cure, walk away whenever the stream is worth less than the debt) unless a cell says `rational` (on the breach alert they repay enough to restore health, if the stream is still worth at least 1.25× the debt). Losses are a share of the loan principal, before any backstop unless stated.

- **Factorial**: every price-path family × stream shape × shock size (10 × 3 × 3), other factors at baseline (σ 100%, full borrow, position = 0.2 days of volume, buyers want 60%/yr, clean oracle, 15% APR, adversarial borrowers).
- **Covering array**: 155 cells in which every combination of levels of any three of the 10 factors appears at least once (family 10, shape 3, severity 3, sigma 3, borrowShare 2, advRatio 3, buyerReturn 3, oracle 3, rate 3, borrower 2; a full factorial would be 87,480 cells).
- **Timing**: one overnight gap of 30%, 50%, 80% or 95% on every week of the loan year, and on the cliff and maturity days, for every shape.
- **History**: every setting replayed on real Binance daily history, a loan every 7 days, grouped by calendar month of origination to see correlated crashes (all tokens falling together); with adversarial and with rational borrowers, and with unlock calendars.

Families: `gbm` (nothing happens), `volBurst` (σ ×2.5 after origination), `jumps` (Poisson drops), `gap` (one overnight drop on a random day), `bleed` (slow decline over the year), `vShape` (crash and recovery), `pumpDump` (+150% then a crash), `regime` (σ ×3 and −100%/yr drift from a random day), `chaos` (1–5 stacked random bad events: gaps of 20–95%, volatility bursts, liquidity droughts, price-feed freezes of 2–10 days, pump-and-dumps; half the time one lands on the unlock day), `bootstrap` (30-day blocks of real returns from the 31 tokens). In every crash family volume falls to 30%.

## Acceptance criteria

Two tiers. **Standard** is the default loan: no project backstop. **Opt-in** is a higher-LTV loan the borrower chooses knowingly, with breach alerts and a cure window, and a project first-loss backstop behind it.

- **Standard, lenders**: on realistic paths (bootstrap of real returns, and the real histories) mean loss ≤ 0.5% and worst 1% ≤ 10%; the worst real calendar month of originations (at least 5 tokens) loses ≤ 3% on average.
- **Opt-in, lenders**: the project commits first-loss B per loan = the worst 1% realistic loss. After B, the worst real month loses ≤ 3% on average.
- **Seniors never lose** (both tiers): even if every loan in the pool takes the worst real month AND one token at the 10% concentration cap takes the worst loss seen anywhere in the grid, at once, junior (15% of the pool) and insurance (2%) absorb it all.
- **Random bad events** (both tiers): even if EVERY token in the pool is hit by its own stacked bad events (the chaos family) at the same time, the pool's loss after the backstop fits within junior and insurance (17%).
- **Borrowers**: at most 25% of loans force-liquidated on health on the real histories — adversarial borrowers for Standard, rational borrowers for Opt-in (who get the alert and cure path; the never-cure rate is disclosed to them). Walking away at maturity is the borrower's choice and is not counted.
- **Invariants**: every simulated loan satisfies the settlement invariants (checked inline; a breach aborts the run). The theorems themselves are in `test/proofs.test.js`.

Revised after the first run, for these reasons:

- Added before the third run, at the owner's request to check uncertain moments and random bad events: the chaos family and the every-token-at-once test, rational borrowers as a factor, and the opt-in tier's borrower test on rational borrowers.
- Added after the first run: a borrower check. On lender loss alone v1 passed, because it liquidates about 84% of borrowers and the auction recovers the money. That breaks the rule that the protocol must not extort holders, so a setting must also force-liquidate (on health, not a walk-away at maturity) at most 25% of loans on the real histories, with borrowers who never cure, so real rates would be lower. A borrower who lets an underwater stream go at maturity is making their own choice and is not counted.
- The first run sized the backstop at the worst 1% of ALL stress paths. Those include overnight 95% gaps, which wipe out any loan above about 5% LTV, so the backstop came out at roughly the whole loan and the senior test passed trivially. The backstop is now sized on realistic paths; the extreme families are charged to junior and insurance through the concentration cap instead.
- The first run counted any calendar month with 5 loans as a cohort. Months in 2019 held only one or two tokens, so they measured concentration in one token, not a correlated crash. A cohort now needs at least 5 distinct tokens.

## Verdict

| Setting | Shape | Avg LTV | Forced: never cure / cure | Realistic: mean / worst 1% | History: mean / worst 1% | Worst month | Every token hit by chaos at once | **Standard** | Backstop B | Worst month after B | Chaos pool after B | **Opt-in** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 25.0% | 84.4% / 84.4% | 0.00% / 0.0% | 0.02% / 0.0% | 2024-06: 0.00% | 1.6% | FAIL | 0.0% | 0.00% | 1.6% | FAIL |
| v1 (testnet) | cliff-12m | 25.0% | 84.4% / 84.4% | 0.59% / 16.3% | 0.13% / 0.0% | 2022-04: 1.16% | 3.1% | FAIL | 9.4% | 0.20% | 2.3% | FAIL |
| v1 (testnet) | cliff6-linear24 | 23.8% | 84.4% / 84.4% | 0.12% / 0.0% | 0.10% / 0.0% | 2022-04: 0.50% | 3.8% | FAIL | 0.0% | 0.50% | 3.8% | FAIL |
| v2 hold α 0.5%/5% | linear-12m | 14.3% | 7.4% / 0.5% | 0.10% / 0.0% | 0.01% / 0.0% | 2025-04: 0.10% | 4.8% | **PASS** | 0.0% | 0.10% | 4.8% | **PASS** |
| v2 hold α 0.5%/5% | cliff-12m | 3.5% | 5.3% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 1.4% | **PASS** | 0.0% | 0.00% | 1.4% | **PASS** |
| v2 hold α 0.5%/5% | cliff6-linear24 | 4.6% | 4.9% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 4.1% | **PASS** | 0.0% | 0.00% | 4.1% | **PASS** |
| v2 hold α 2%/10% | linear-12m | 18.8% | 18.1% / 2.9% | 0.08% / 0.0% | 0.04% / 0.0% | 2022-04: 0.66% | 6.2% | **PASS** | 0.0% | 0.66% | 6.2% | **PASS** |
| v2 hold α 2%/10% | cliff-12m | 5.7% | 13.6% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 2.1% | **PASS** | 0.0% | 0.00% | 2.1% | **PASS** |
| v2 hold α 2%/10% | cliff6-linear24 | 7.1% | 12.9% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 6.0% | **PASS** | 0.0% | 0.00% | 6.0% | **PASS** |
| v2 hold α 3%/15% | linear-12m | 20.7% | 23.5% / 5.9% | 0.16% / 6.3% | 0.09% / 3.4% | 2022-04: 1.77% | 7.1% | **PASS** | 4.5% | 0.99% | 6.1% | **PASS** |
| v2 hold α 3%/15% | cliff-12m | 6.7% | 13.3% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 2.8% | **PASS** | 0.0% | 0.00% | 2.8% | **PASS** |
| v2 hold α 3%/15% | cliff6-linear24 | 8.3% | 13.8% / 0.0% | 0.01% / 0.0% | 0.00% / 0.0% | 2022-01: 0.09% | 7.1% | **PASS** | 0.0% | 0.09% | 7.1% | **PASS** |
| v2 blend k 150%/75% | linear-12m | 35.5% | 50.6% / 12.0% | 0.45% / 11.7% | 0.71% / 15.9% | 2022-01: 6.52% | 9.5% | FAIL | 14.6% | 0.48% | 5.6% | **PASS** |
| v2 blend k 150%/75% | cliff-12m | 15.4% | 41.2% / 5.7% | 0.16% / 3.1% | 0.20% / 7.0% | 2022-02: 1.45% | 7.9% | FAIL | 7.0% | 0.75% | 6.5% | **PASS** |
| v2 blend k 150%/75% | cliff6-linear24 | 17.8% | 41.7% / 1.0% | 0.18% / 8.3% | 0.22% / 8.1% | 2021-12: 5.15% | 10.4% | FAIL | 8.3% | 0.91% | 8.3% | **PASS** |
| v2 blend k 100%/50% | linear-12m | 43.2% | 62.6% / 22.5% | 1.27% / 21.4% | 1.70% / 25.9% | 2022-04: 11.27% | 11.2% | FAIL | 24.0% | 0.51% | 4.3% | **PASS** |
| v2 blend k 100%/50% | cliff-12m | 25.2% | 63.6% / 18.3% | 0.64% / 14.5% | 1.40% / 26.9% | 2022-01: 11.18% | 10.9% | FAIL | 24.7% | 0.85% | 4.7% | **PASS** |
| v2 blend k 100%/50% | cliff6-linear24 | 26.5% | 60.9% / 3.2% | 1.01% / 21.8% | 1.45% / 25.8% | 2022-02: 10.23% | 14.4% | FAIL | 22.8% | 1.67% | 7.0% | **PASS** |

Backstop B is first loss per loan the project commits (a buyback, or treasury tokens or stablecoins in escrow), as a share of principal. Junior (15%) and insurance (2%) stand between any loss and senior lenders.

### Why each setting fails

- v1 (testnet), linear-12m: Standard — borrowers; Opt-in — borrowers.
- v1 (testnet), cliff-12m: Standard — realistic, borrowers; Opt-in — borrowers.
- v1 (testnet), cliff6-linear24: Standard — borrowers; Opt-in — borrowers.
- v2 hold α 0.5%/5%, linear-12m: Standard — passes; Opt-in — passes.
- v2 hold α 0.5%/5%, cliff-12m: Standard — passes; Opt-in — passes.
- v2 hold α 0.5%/5%, cliff6-linear24: Standard — passes; Opt-in — passes.
- v2 hold α 2%/10%, linear-12m: Standard — passes; Opt-in — passes.
- v2 hold α 2%/10%, cliff-12m: Standard — passes; Opt-in — passes.
- v2 hold α 2%/10%, cliff6-linear24: Standard — passes; Opt-in — passes.
- v2 hold α 3%/15%, linear-12m: Standard — passes; Opt-in — passes.
- v2 hold α 3%/15%, cliff-12m: Standard — passes; Opt-in — passes.
- v2 hold α 3%/15%, cliff6-linear24: Standard — passes; Opt-in — passes.
- v2 blend k 150%/75%, linear-12m: Standard — realistic, history, cohorts, seniors, borrowers; Opt-in — passes.
- v2 blend k 150%/75%, cliff-12m: Standard — borrowers; Opt-in — passes.
- v2 blend k 150%/75%, cliff6-linear24: Standard — cohorts, borrowers; Opt-in — passes.
- v2 blend k 100%/50%, linear-12m: Standard — realistic, history, cohorts, seniors, borrowers; Opt-in — passes.
- v2 blend k 100%/50%, cliff-12m: Standard — realistic, history, cohorts, seniors, borrowers; Opt-in — passes.
- v2 blend k 100%/50%, cliff6-linear24: Standard — realistic, history, cohorts, seniors, borrowers; Opt-in — passes.

## Every design, every setting

| Setting | Shape | Design | Loans | Avg LTV | Liquidated | Forced | Loans with a loss | Mean loss | Worst 5% | Worst 1% | Worst 0.1% | Worst |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | factorial | 4800 | 25.0% | 93.0% | 93.0% | 5.9% | 3.15% | 22.5% | 82.0% | 93.2% | 95.5% |
| v1 (testnet) | linear-12m | covering | 10400 | 24.0% | 88.2% | 88.2% | 5.7% | 2.27% | 10.4% | 75.6% | 89.6% | 92.3% |
| v1 (testnet) | linear-12m | timing | 880 | 25.0% | 96.1% | 95.9% | 26.5% | 16.08% | 88.2% | 92.5% | 96.0% | 96.0% |
| v1 (testnet) | linear-12m | history | 3822 | 25.0% | 84.4% | 84.4% | 0.3% | 0.02% | 0.0% | 0.0% | 10.7% | 21.5% |
| v1 (testnet) | cliff-12m | factorial | 4800 | 25.0% | 93.4% | 93.4% | 8.5% | 4.33% | 44.6% | 88.9% | 95.3% | 99.6% |
| v1 (testnet) | cliff-12m | covering | 7040 | 22.3% | 85.6% | 85.6% | 13.8% | 4.51% | 34.2% | 88.9% | 100.8% | 107.5% |
| v1 (testnet) | cliff-12m | timing | 880 | 25.0% | 95.7% | 95.3% | 28.9% | 18.98% | 91.0% | 95.0% | 96.4% | 96.4% |
| v1 (testnet) | cliff-12m | history | 3822 | 25.0% | 84.4% | 84.4% | 0.7% | 0.13% | 0.0% | 0.0% | 34.4% | 43.0% |
| v1 (testnet) | cliff6-linear24 | factorial | 4800 | 23.8% | 93.1% | 93.1% | 7.5% | 3.99% | 39.6% | 88.0% | 94.8% | 95.9% |
| v1 (testnet) | cliff6-linear24 | covering | 7360 | 20.7% | 86.6% | 86.6% | 10.7% | 5.26% | 61.7% | 87.2% | 93.8% | 96.7% |
| v1 (testnet) | cliff6-linear24 | timing | 880 | 23.8% | 94.9% | 94.4% | 26.6% | 17.48% | 90.1% | 95.2% | 98.3% | 98.3% |
| v1 (testnet) | cliff6-linear24 | history | 3822 | 23.8% | 84.4% | 84.4% | 0.6% | 0.10% | 0.0% | 0.0% | 30.2% | 39.6% |
| v2 hold α 0.5%/5% | linear-12m | factorial | 4800 | 16.4% | 49.4% | 49.0% | 18.6% | 6.32% | 53.3% | 89.7% | 100.6% | 104.4% |
| v2 hold α 0.5%/5% | linear-12m | covering | 10400 | 15.9% | 33.6% | 33.0% | 15.3% | 5.00% | 43.0% | 90.3% | 98.6% | 103.8% |
| v2 hold α 0.5%/5% | linear-12m | timing | 880 | 33.0% | 76.0% | 73.0% | 54.1% | 32.92% | 97.7% | 104.3% | 107.6% | 107.6% |
| v2 hold α 0.5%/5% | linear-12m | history | 3822 | 14.3% | 7.4% | 7.4% | 0.2% | 0.01% | 0.0% | 0.0% | 1.9% | 8.4% |
| v2 hold α 0.5%/5% | cliff-12m | factorial | 4800 | 3.9% | 40.9% | 40.7% | 4.3% | 1.58% | 0.0% | 58.4% | 86.2% | 101.1% |
| v2 hold α 0.5%/5% | cliff-12m | covering | 7040 | 6.5% | 22.4% | 22.3% | 5.9% | 1.65% | 6.2% | 48.8% | 77.7% | 103.6% |
| v2 hold α 0.5%/5% | cliff-12m | timing | 880 | 16.4% | 67.6% | 66.1% | 42.0% | 25.42% | 90.9% | 99.5% | 105.9% | 105.9% |
| v2 hold α 0.5%/5% | cliff-12m | history | 3822 | 3.5% | 5.3% | 5.3% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 0.5%/5% | cliff6-linear24 | factorial | 4800 | 5.3% | 39.8% | 39.7% | 6.5% | 2.63% | 15.8% | 68.9% | 94.7% | 102.4% |
| v2 hold α 0.5%/5% | cliff6-linear24 | covering | 7360 | 5.4% | 25.0% | 24.9% | 6.3% | 1.71% | 5.6% | 57.5% | 90.5% | 107.9% |
| v2 hold α 0.5%/5% | cliff6-linear24 | timing | 880 | 18.0% | 66.6% | 64.7% | 43.6% | 28.11% | 94.1% | 101.2% | 104.8% | 104.8% |
| v2 hold α 0.5%/5% | cliff6-linear24 | history | 3822 | 4.6% | 4.9% | 4.9% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 2%/10% | linear-12m | factorial | 4800 | 21.5% | 60.8% | 60.2% | 22.3% | 7.71% | 60.7% | 91.7% | 101.9% | 106.3% |
| v2 hold α 2%/10% | linear-12m | covering | 10400 | 20.2% | 42.2% | 41.6% | 19.6% | 6.14% | 51.8% | 91.6% | 99.6% | 103.9% |
| v2 hold α 2%/10% | linear-12m | timing | 880 | 39.9% | 82.5% | 80.1% | 56.7% | 33.32% | 97.8% | 103.5% | 107.2% | 107.2% |
| v2 hold α 2%/10% | linear-12m | history | 3822 | 18.8% | 18.1% | 18.1% | 0.7% | 0.04% | 0.0% | 0.0% | 9.6% | 15.2% |
| v2 hold α 2%/10% | cliff-12m | factorial | 4800 | 6.7% | 50.4% | 50.2% | 7.1% | 3.12% | 24.1% | 75.6% | 93.8% | 99.3% |
| v2 hold α 2%/10% | cliff-12m | covering | 7040 | 9.0% | 29.2% | 29.1% | 10.6% | 3.18% | 26.5% | 65.6% | 91.2% | 111.3% |
| v2 hold α 2%/10% | cliff-12m | timing | 880 | 22.6% | 75.9% | 74.8% | 46.3% | 29.68% | 94.8% | 101.3% | 107.2% | 107.2% |
| v2 hold α 2%/10% | cliff-12m | history | 3822 | 5.7% | 13.6% | 13.6% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 2%/10% | cliff6-linear24 | factorial | 4800 | 8.3% | 51.7% | 51.5% | 9.5% | 4.08% | 37.1% | 80.7% | 101.0% | 106.5% |
| v2 hold α 2%/10% | cliff6-linear24 | covering | 7360 | 7.6% | 31.2% | 31.1% | 10.6% | 3.13% | 24.3% | 70.1% | 95.0% | 110.2% |
| v2 hold α 2%/10% | cliff6-linear24 | timing | 880 | 24.1% | 76.6% | 74.3% | 49.3% | 31.86% | 96.7% | 102.9% | 105.1% | 105.1% |
| v2 hold α 2%/10% | cliff6-linear24 | history | 3822 | 7.1% | 12.9% | 12.9% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 3%/15% | linear-12m | factorial | 4800 | 23.7% | 64.3% | 63.7% | 26.1% | 8.76% | 63.7% | 93.0% | 102.8% | 105.6% |
| v2 hold α 3%/15% | linear-12m | covering | 10400 | 21.9% | 46.3% | 45.6% | 23.5% | 6.97% | 55.4% | 92.2% | 100.1% | 104.6% |
| v2 hold α 3%/15% | linear-12m | timing | 880 | 42.6% | 84.4% | 82.5% | 60.6% | 34.01% | 98.3% | 103.0% | 107.4% | 107.4% |
| v2 hold α 3%/15% | linear-12m | history | 3822 | 20.7% | 23.7% | 23.5% | 2.0% | 0.09% | 0.0% | 3.4% | 13.9% | 23.9% |
| v2 hold α 3%/15% | cliff-12m | factorial | 4800 | 8.0% | 51.4% | 51.1% | 8.9% | 3.97% | 37.0% | 82.0% | 96.6% | 102.1% |
| v2 hold α 3%/15% | cliff-12m | covering | 7040 | 10.1% | 31.0% | 30.8% | 13.6% | 4.45% | 37.6% | 73.0% | 95.7% | 113.1% |
| v2 hold α 3%/15% | cliff-12m | timing | 880 | 25.2% | 76.3% | 75.0% | 49.2% | 32.10% | 96.4% | 102.7% | 108.0% | 108.0% |
| v2 hold α 3%/15% | cliff-12m | history | 3822 | 6.7% | 13.3% | 13.3% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 3%/15% | cliff6-linear24 | factorial | 4800 | 9.7% | 54.0% | 53.8% | 12.3% | 5.05% | 46.7% | 84.4% | 102.5% | 107.1% |
| v2 hold α 3%/15% | cliff6-linear24 | covering | 7360 | 8.6% | 33.2% | 33.0% | 13.2% | 4.16% | 32.7% | 75.5% | 97.1% | 110.8% |
| v2 hold α 3%/15% | cliff6-linear24 | timing | 880 | 26.6% | 78.5% | 75.9% | 54.3% | 33.86% | 97.7% | 103.6% | 106.0% | 106.0% |
| v2 hold α 3%/15% | cliff6-linear24 | history | 3822 | 8.3% | 13.8% | 13.8% | 0.1% | 0.00% | 0.0% | 0.0% | 0.0% | 1.8% |
| v2 blend k 150%/75% | linear-12m | factorial | 4800 | 37.0% | 77.7% | 77.3% | 38.8% | 11.35% | 69.6% | 94.6% | 104.2% | 107.8% |
| v2 blend k 150%/75% | linear-12m | covering | 10400 | 34.0% | 61.7% | 61.2% | 32.4% | 9.14% | 62.1% | 91.4% | 99.5% | 104.8% |
| v2 blend k 150%/75% | linear-12m | timing | 880 | 42.5% | 84.1% | 81.8% | 63.0% | 34.66% | 98.7% | 103.8% | 107.4% | 107.4% |
| v2 blend k 150%/75% | linear-12m | history | 3822 | 35.5% | 50.6% | 50.6% | 11.1% | 0.71% | 4.4% | 15.9% | 39.9% | 48.7% |
| v2 blend k 150%/75% | cliff-12m | factorial | 4800 | 15.9% | 64.8% | 64.5% | 22.3% | 8.59% | 67.0% | 93.0% | 102.6% | 105.0% |
| v2 blend k 150%/75% | cliff-12m | covering | 7040 | 14.6% | 45.6% | 45.3% | 21.3% | 7.17% | 56.2% | 90.1% | 106.5% | 113.1% |
| v2 blend k 150%/75% | cliff-12m | timing | 880 | 18.7% | 62.5% | 60.9% | 48.4% | 30.02% | 94.6% | 102.0% | 107.3% | 107.3% |
| v2 blend k 150%/75% | cliff-12m | history | 3822 | 15.4% | 41.2% | 41.2% | 2.7% | 0.20% | 0.0% | 7.0% | 25.3% | 37.6% |
| v2 blend k 150%/75% | cliff6-linear24 | factorial | 4800 | 18.5% | 67.2% | 67.0% | 25.9% | 9.05% | 66.4% | 93.8% | 102.9% | 106.8% |
| v2 blend k 150%/75% | cliff6-linear24 | covering | 7360 | 15.7% | 48.1% | 47.9% | 22.8% | 8.01% | 66.2% | 88.6% | 99.9% | 108.1% |
| v2 blend k 150%/75% | cliff6-linear24 | timing | 880 | 22.3% | 68.3% | 65.9% | 53.0% | 33.28% | 96.4% | 103.4% | 106.5% | 106.5% |
| v2 blend k 150%/75% | cliff6-linear24 | history | 3822 | 17.8% | 41.7% | 41.7% | 3.3% | 0.22% | 0.0% | 8.1% | 27.9% | 36.3% |
| v2 blend k 100%/50% | linear-12m | factorial | 4800 | 45.2% | 83.4% | 83.1% | 50.8% | 12.84% | 69.1% | 94.4% | 102.9% | 105.8% |
| v2 blend k 100%/50% | linear-12m | covering | 10400 | 41.2% | 68.3% | 67.9% | 38.0% | 10.20% | 64.2% | 92.9% | 100.1% | 105.5% |
| v2 blend k 100%/50% | linear-12m | timing | 880 | 51.9% | 90.1% | 88.5% | 68.9% | 32.79% | 99.1% | 103.2% | 106.1% | 106.1% |
| v2 blend k 100%/50% | linear-12m | history | 3822 | 43.2% | 62.6% | 62.6% | 21.4% | 1.70% | 10.6% | 25.9% | 48.9% | 54.9% |
| v2 blend k 100%/50% | cliff-12m | factorial | 4800 | 26.3% | 78.2% | 78.0% | 39.1% | 11.80% | 74.0% | 95.1% | 102.6% | 106.0% |
| v2 blend k 100%/50% | cliff-12m | covering | 7040 | 22.5% | 56.0% | 55.7% | 32.7% | 11.32% | 68.3% | 96.0% | 107.3% | 115.0% |
| v2 blend k 100%/50% | cliff-12m | timing | 880 | 30.2% | 78.6% | 77.2% | 63.7% | 36.43% | 98.2% | 103.9% | 107.4% | 107.4% |
| v2 blend k 100%/50% | cliff-12m | history | 3822 | 25.2% | 63.6% | 63.6% | 14.5% | 1.40% | 10.8% | 26.9% | 53.2% | 57.6% |
| v2 blend k 100%/50% | cliff6-linear24 | factorial | 4800 | 27.7% | 78.3% | 78.1% | 42.3% | 11.95% | 71.4% | 95.7% | 104.5% | 106.8% |
| v2 blend k 100%/50% | cliff6-linear24 | covering | 7360 | 22.8% | 56.1% | 55.8% | 32.2% | 11.15% | 76.5% | 93.1% | 103.2% | 112.9% |
| v2 blend k 100%/50% | cliff6-linear24 | timing | 880 | 31.9% | 81.6% | 79.0% | 68.8% | 38.00% | 99.8% | 105.6% | 108.5% | 108.5% |
| v2 blend k 100%/50% | cliff6-linear24 | history | 3822 | 26.5% | 60.9% | 60.9% | 16.4% | 1.45% | 9.5% | 25.8% | 49.7% | 58.7% |

## By price-path family (factorial and covering cells)

| Setting | Shape | gbm | volBurst | jumps | gap | bleed | vShape | pumpDump | regime | chaos | bootstrap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 0.00% / 0% | 0.22% / 57% | 0.02% / 9% | 13.77% / 94% | 0.00% / 0% | 1.19% / 71% | 8.25% / 95% | 0.00% / 0% | 1.61% / 83% | 0.00% / 0% |
| v1 (testnet) | cliff-12m | 0.38% / 21% | 3.70% / 81% | 0.77% / 46% | 15.94% / 107% | 0.30% / 19% | 1.91% / 64% | 17.44% / 96% | 0.11% / 39% | 3.08% / 91% | 0.59% / 41% |
| v1 (testnet) | cliff6-linear24 | 0.02% / 11% | 0.44% / 33% | 0.87% / 43% | 17.26% / 95% | 0.00% / 5% | 1.90% / 72% | 23.67% / 97% | 0.08% / 24% | 3.81% / 94% | 0.12% / 26% |
| v2 hold α 0.5%/5% | linear-12m | 0.04% / 13% | 2.04% / 76% | 0.78% / 50% | 29.02% / 104% | 0.92% / 35% | 6.12% / 94% | 9.65% / 102% | 1.20% / 49% | 4.83% / 97% | 0.10% / 41% |
| v2 hold α 0.5%/5% | cliff-12m | 0.00% / 0% | 0.08% / 34% | 1.20% / 47% | 5.75% / 104% | 0.01% / 13% | 5.70% / 83% | 0.89% / 74% | 0.26% / 33% | 1.37% / 90% | 0.00% / 0% |
| v2 hold α 0.5%/5% | cliff6-linear24 | 0.00% / 0% | 0.80% / 32% | 0.69% / 61% | 8.27% / 102% | 0.33% / 19% | 1.32% / 70% | 4.66% / 98% | 0.20% / 24% | 4.09% / 108% | 0.00% / 0% |
| v2 hold α 2%/10% | linear-12m | 0.14% / 30% | 3.60% / 76% | 1.14% / 42% | 32.20% / 106% | 1.19% / 37% | 7.99% / 86% | 12.17% / 104% | 2.01% / 47% | 6.19% / 100% | 0.08% / 25% |
| v2 hold α 2%/10% | cliff-12m | 0.00% / 0% | 0.23% / 62% | 2.79% / 61% | 11.56% / 111% | 0.10% / 26% | 9.33% / 99% | 2.94% / 89% | 0.78% / 48% | 2.12% / 93% | 0.00% / 0% |
| v2 hold α 2%/10% | cliff6-linear24 | 0.00% / 0% | 1.61% / 42% | 1.03% / 60% | 12.37% / 107% | 1.30% / 27% | 2.37% / 77% | 9.35% / 101% | 0.65% / 36% | 6.03% / 110% | 0.00% / 0% |
| v2 hold α 3%/15% | linear-12m | 0.22% / 35% | 5.30% / 75% | 1.88% / 45% | 33.76% / 106% | 1.64% / 40% | 9.64% / 90% | 13.18% / 105% | 2.87% / 53% | 7.11% / 101% | 0.16% / 25% |
| v2 hold α 3%/15% | cliff-12m | 0.00% / 6% | 0.34% / 60% | 4.43% / 64% | 14.45% / 113% | 0.26% / 39% | 12.64% / 102% | 4.19% / 92% | 1.21% / 52% | 2.77% / 97% | 0.00% / 0% |
| v2 hold α 3%/15% | cliff6-linear24 | 0.01% / 7% | 2.47% / 48% | 1.72% / 66% | 14.82% / 107% | 2.35% / 36% | 3.35% / 80% | 11.62% / 103% | 1.33% / 43% | 7.06% / 111% | 0.01% / 8% |
| v2 blend k 150%/75% | linear-12m | 0.37% / 28% | 11.20% / 87% | 4.03% / 47% | 36.64% / 107% | 1.43% / 47% | 12.63% / 97% | 18.22% / 108% | 3.87% / 62% | 9.53% / 105% | 0.45% / 37% |
| v2 blend k 150%/75% | cliff-12m | 0.17% / 19% | 7.34% / 80% | 4.23% / 65% | 23.16% / 113% | 0.89% / 31% | 12.85% / 95% | 16.45% / 106% | 2.65% / 93% | 7.86% / 105% | 0.16% / 36% |
| v2 blend k 150%/75% | cliff6-linear24 | 0.25% / 27% | 4.85% / 57% | 3.00% / 63% | 27.64% / 107% | 1.84% / 27% | 8.15% / 88% | 24.97% / 104% | 2.42% / 57% | 10.41% / 108% | 0.18% / 21% |
| v2 blend k 100%/50% | linear-12m | 0.89% / 38% | 14.82% / 90% | 6.18% / 61% | 33.39% / 106% | 2.40% / 56% | 13.42% / 102% | 21.19% / 105% | 5.11% / 70% | 11.19% / 96% | 1.27% / 49% |
| v2 blend k 100%/50% | cliff-12m | 1.69% / 37% | 13.30% / 86% | 8.93% / 71% | 28.05% / 115% | 2.72% / 50% | 18.86% / 93% | 23.60% / 106% | 4.43% / 72% | 10.89% / 113% | 0.64% / 57% |
| v2 blend k 100%/50% | cliff6-linear24 | 1.29% / 44% | 9.12% / 68% | 7.41% / 70% | 29.44% / 107% | 4.37% / 41% | 10.76% / 87% | 31.43% / 105% | 4.97% / 64% | 14.36% / 113% | 1.01% / 36% |

Each entry: mean loss / worst loss.

## Gap timing: worst loss from one overnight gap on any week of the loan

Each cell has ordinary σ 60% noise around the gap, and the LTV is what each setting lends at that calm σ (v2 lends up to about 40% here, far above its 14–19% on real histories), so a loss is the gap plus the noise at the LTV actually lent. Gaps are outside every setting's diffusion model: this table is what the backstop, insurance and junior tranche are for.

| Setting | Shape | −30% | −50% | −80% | −95% |
| --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 0.0% | 0.0% | 59.0% (day 64) | 96.0% (day 316) |
| v1 (testnet) | cliff-12m | 0.0% | 12.4% (day 50) | 66.8% (day 99) | 96.4% (day 302) |
| v1 (testnet) | cliff6-linear24 | 0.0% | 13.8% (day 50) | 65.9% (day 50) | 98.3% (day 330) |
| v2 hold α 0.5%/5% | linear-12m | 14.1% (day 260) | 40.9% (day 225) | 85.4% (day 358) | 107.6% (day 365) |
| v2 hold α 0.5%/5% | cliff-12m | 0.1% (day 323) | 23.5% (day 57) | 83.1% (day 295) | 105.9% (day 364) |
| v2 hold α 0.5%/5% | cliff6-linear24 | 9.7% (day 92) | 34.7% (day 302) | 77.2% (day 225) | 104.8% (day 330) |
| v2 hold α 2%/10% | linear-12m | 23.9% (day 364) | 50.7% (day 351) | 91.2% (day 358) | 107.2% (day 330) |
| v2 hold α 2%/10% | cliff-12m | 18.9% (day 182) | 41.8% (day 57) | 80.0% (day 364) | 107.2% (day 364) |
| v2 hold α 2%/10% | cliff6-linear24 | 14.6% (day 197) | 49.1% (day 365) | 80.1% (day 344) | 105.1% (day 358) |
| v2 hold α 3%/15% | linear-12m | 29.2% (day 364) | 54.9% (day 351) | 88.0% (day 337) | 107.4% (day 337) |
| v2 hold α 3%/15% | cliff-12m | 26.7% (day 182) | 46.8% (day 57) | 83.4% (day 364) | 108.0% (day 364) |
| v2 hold α 3%/15% | cliff6-linear24 | 27.3% (day 64) | 53.7% (day 364) | 83.1% (day 344) | 106.0% (day 358) |
| v2 blend k 150%/75% | linear-12m | 24.2% (day 190) | 51.0% (day 267) | 89.2% (day 337) | 107.4% (day 364) |
| v2 blend k 150%/75% | cliff-12m | 4.1% (day 57) | 35.4% (day 351) | 83.1% (day 295) | 107.3% (day 364) |
| v2 blend k 150%/75% | cliff6-linear24 | 16.7% (day 232) | 46.7% (day 127) | 81.6% (day 288) | 106.5% (day 330) |
| v2 blend k 100%/50% | linear-12m | 28.9% (day 141) | 52.2% (day 295) | 86.6% (day 316) | 106.1% (day 316) |
| v2 blend k 100%/50% | cliff-12m | 35.3% (day 337) | 50.4% (day 141) | 86.1% (day 364) | 107.4% (day 358) |
| v2 blend k 100%/50% | cliff6-linear24 | 36.4% (day 92) | 55.4% (day 106) | 88.4% (day 274) | 108.5% (day 358) |

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
| v2 hold α 3%/15% | linear-12m | 20.1% → 19.0% | 24.0% → 20.7% | 0.05% → 0.02% | 1.3% → 0.0% | 17.7% → 15.6% |
| v2 hold α 3%/15% | cliff-12m | 6.0% → 5.7% | 14.5% → 13.8% | 0.00% → 0.00% | 0.0% → 0.0% | 0.0% → 0.0% |
| v2 hold α 3%/15% | cliff6-linear24 | 7.6% → 7.2% | 14.5% → 13.6% | 0.00% → 0.00% | 0.0% → 0.0% | 0.0% → 0.0% |
| v2 blend k 150%/75% | linear-12m | 35.4% → 33.4% | 54.4% → 49.5% | 0.46% → 0.24% | 10.1% → 7.2% | 24.0% → 19.7% |
| v2 blend k 150%/75% | cliff-12m | 15.3% → 14.4% | 45.1% → 43.6% | 0.12% → 0.09% | 5.7% → 4.4% | 18.5% → 15.4% |
| v2 blend k 150%/75% | cliff6-linear24 | 17.7% → 16.7% | 45.1% → 42.2% | 0.09% → 0.04% | 3.1% → 1.3% | 14.7% → 8.1% |
| v2 blend k 100%/50% | linear-12m | 43.2% → 40.7% | 67.8% → 62.4% | 1.40% → 0.91% | 17.4% → 14.6% | 28.8% → 24.4% |
| v2 blend k 100%/50% | cliff-12m | 25.1% → 23.8% | 70.3% → 69.0% | 0.95% → 0.63% | 16.6% → 13.8% | 29.9% → 27.5% |
| v2 blend k 100%/50% | cliff6-linear24 | 26.5% → 25.0% | 67.1% → 64.5% | 1.06% → 0.69% | 17.2% → 14.1% | 33.3% → 30.7% |

## What this does not cover

- Unlock drift in the synthetic families: they have no unlock calendar; the drift is tested on the real histories above.
- Intraday paths: daily closes stand in for the oracle's time-weighted price.
- Real borrower behaviour: borrowers here never cure, which overstates liquidations.
- Partner buyback at better than auction prices: the backstop is modelled as cash first loss only.
