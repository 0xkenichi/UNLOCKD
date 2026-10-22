# Stress test

Generated 2026-10-22T17:02:33.332Z by `node bin/stress.js` in 433 s: 905 cells, 251,040 simulated loans, plus every setting replayed on 31 real token histories.

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
| v1 (testnet) | linear-12m | 25.0% | 84.4% / 84.4% | 0.00% / 0.0% | 0.02% / 0.0% | 2024-06: 0.00% | 1.8% | FAIL | 0.0% | 0.00% | 1.8% | FAIL |
| v1 (testnet) | cliff-12m | 25.0% | 84.4% / 84.4% | 0.43% / 12.8% | 0.13% / 0.0% | 2022-04: 1.16% | 3.1% | FAIL | 6.8% | 0.36% | 2.5% | FAIL |
| v1 (testnet) | cliff6-linear24 | 23.8% | 84.4% / 84.4% | 0.01% / 0.0% | 0.10% / 0.0% | 2022-04: 0.50% | 3.4% | FAIL | 0.0% | 0.50% | 3.4% | FAIL |
| v2 hold α 0.5%/5% | linear-12m | 14.3% | 7.4% / 0.5% | 0.12% / 0.0% | 0.01% / 0.0% | 2025-04: 0.10% | 5.3% | **PASS** | 0.0% | 0.10% | 5.3% | **PASS** |
| v2 hold α 0.5%/5% | cliff-12m | 3.5% | 5.3% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 0.9% | **PASS** | 0.0% | 0.00% | 0.9% | **PASS** |
| v2 hold α 0.5%/5% | cliff6-linear24 | 4.6% | 4.9% / 0.0% | 0.01% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 4.1% | **PASS** | 0.0% | 0.00% | 4.1% | **PASS** |
| v2 hold α 2%/10% | linear-12m | 18.8% | 18.1% / 2.9% | 0.14% / 5.6% | 0.04% / 0.0% | 2022-04: 0.66% | 6.8% | **PASS** | 0.0% | 0.66% | 6.8% | **PASS** |
| v2 hold α 2%/10% | cliff-12m | 5.7% | 13.6% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 1.6% | **PASS** | 0.0% | 0.00% | 1.6% | **PASS** |
| v2 hold α 2%/10% | cliff6-linear24 | 7.1% | 12.9% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 5.1% | **PASS** | 0.0% | 0.00% | 5.1% | **PASS** |
| v2 hold α 3%/15% | linear-12m | 20.7% | 23.5% / 5.9% | 0.23% / 9.2% | 0.09% / 3.4% | 2022-04: 1.77% | 7.9% | **PASS** | 4.4% | 1.01% | 6.9% | **PASS** |
| v2 hold α 3%/15% | cliff-12m | 6.7% | 13.3% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2024-06: 0.00% | 2.3% | **PASS** | 0.0% | 0.00% | 2.3% | **PASS** |
| v2 hold α 3%/15% | cliff6-linear24 | 8.3% | 13.8% / 0.0% | 0.00% / 0.0% | 0.00% / 0.0% | 2022-01: 0.09% | 6.0% | **PASS** | 0.0% | 0.09% | 6.0% | **PASS** |
| v2 blend k 150%/75% | linear-12m | 35.5% | 50.6% / 12.0% | 0.50% / 12.5% | 0.71% / 15.9% | 2022-01: 6.52% | 10.7% | FAIL | 15.4% | 0.41% | 6.2% | **PASS** |
| v2 blend k 150%/75% | cliff-12m | 15.4% | 41.2% / 5.7% | 0.11% / 2.9% | 0.20% / 7.0% | 2022-02: 1.45% | 8.7% | FAIL | 6.8% | 0.77% | 7.2% | **PASS** |
| v2 blend k 150%/75% | cliff6-linear24 | 17.8% | 41.7% / 1.0% | 0.15% / 6.3% | 0.22% / 8.1% | 2021-12: 5.15% | 9.9% | FAIL | 7.6% | 1.22% | 8.0% | **PASS** |
| v2 blend k 100%/50% | linear-12m | 43.2% | 62.6% / 22.5% | 1.25% / 20.1% | 1.70% / 25.9% | 2022-04: 11.27% | 12.2% | FAIL | 23.9% | 0.51% | 5.0% | **PASS** |
| v2 blend k 100%/50% | cliff-12m | 25.2% | 63.6% / 18.3% | 0.88% / 19.2% | 1.40% / 26.9% | 2022-01: 11.18% | 11.0% | FAIL | 24.4% | 0.89% | 4.9% | **PASS** |
| v2 blend k 100%/50% | cliff6-linear24 | 26.5% | 60.9% / 3.2% | 0.80% / 17.5% | 1.45% / 25.8% | 2022-02: 10.23% | 13.7% | FAIL | 22.9% | 1.65% | 6.2% | **PASS** |

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
| v1 (testnet) | linear-12m | factorial | 4800 | 25.0% | 93.1% | 93.1% | 6.4% | 3.42% | 28.9% | 82.6% | 91.8% | 97.7% |
| v1 (testnet) | linear-12m | covering | 10400 | 24.0% | 88.5% | 88.4% | 5.5% | 2.25% | 8.7% | 77.0% | 89.0% | 93.7% |
| v1 (testnet) | linear-12m | timing | 880 | 25.0% | 95.9% | 95.7% | 25.3% | 15.32% | 87.2% | 91.9% | 96.1% | 96.1% |
| v1 (testnet) | linear-12m | history | 3822 | 25.0% | 84.4% | 84.4% | 0.3% | 0.02% | 0.0% | 0.0% | 10.7% | 21.5% |
| v1 (testnet) | cliff-12m | factorial | 4800 | 25.0% | 93.4% | 93.4% | 8.2% | 4.18% | 37.7% | 89.6% | 95.2% | 99.4% |
| v1 (testnet) | cliff-12m | covering | 7040 | 22.3% | 85.6% | 85.6% | 13.3% | 4.38% | 31.5% | 88.2% | 99.8% | 103.6% |
| v1 (testnet) | cliff-12m | timing | 880 | 25.0% | 94.3% | 94.2% | 28.9% | 18.85% | 90.6% | 93.8% | 99.7% | 99.7% |
| v1 (testnet) | cliff-12m | history | 3822 | 25.0% | 84.4% | 84.4% | 0.7% | 0.13% | 0.0% | 0.0% | 34.4% | 43.0% |
| v1 (testnet) | cliff6-linear24 | factorial | 4800 | 23.8% | 93.2% | 93.2% | 7.8% | 4.09% | 39.5% | 88.1% | 95.1% | 100.5% |
| v1 (testnet) | cliff6-linear24 | covering | 7360 | 20.7% | 86.6% | 86.6% | 10.4% | 5.17% | 60.4% | 87.0% | 94.6% | 97.6% |
| v1 (testnet) | cliff6-linear24 | timing | 880 | 23.8% | 95.9% | 95.6% | 27.2% | 17.46% | 90.7% | 95.6% | 98.4% | 98.4% |
| v1 (testnet) | cliff6-linear24 | history | 3822 | 23.8% | 84.4% | 84.4% | 0.6% | 0.10% | 0.0% | 0.0% | 30.2% | 39.6% |
| v2 hold α 0.5%/5% | linear-12m | factorial | 4800 | 16.3% | 49.2% | 48.6% | 18.3% | 6.18% | 52.6% | 88.8% | 101.8% | 106.7% |
| v2 hold α 0.5%/5% | linear-12m | covering | 10400 | 16.0% | 34.4% | 34.0% | 15.5% | 5.04% | 45.1% | 90.8% | 98.6% | 100.7% |
| v2 hold α 0.5%/5% | linear-12m | timing | 880 | 33.0% | 74.9% | 71.7% | 52.7% | 32.68% | 97.0% | 102.9% | 105.8% | 105.8% |
| v2 hold α 0.5%/5% | linear-12m | history | 3822 | 14.3% | 7.4% | 7.4% | 0.2% | 0.01% | 0.0% | 0.0% | 1.9% | 8.4% |
| v2 hold α 0.5%/5% | cliff-12m | factorial | 4800 | 3.9% | 42.1% | 42.0% | 4.3% | 1.68% | 0.0% | 59.9% | 89.7% | 99.1% |
| v2 hold α 0.5%/5% | cliff-12m | covering | 7040 | 6.5% | 22.1% | 22.0% | 5.7% | 1.58% | 4.9% | 50.0% | 85.0% | 99.7% |
| v2 hold α 0.5%/5% | cliff-12m | timing | 880 | 16.1% | 67.8% | 66.6% | 40.3% | 25.25% | 91.4% | 99.2% | 102.7% | 102.7% |
| v2 hold α 0.5%/5% | cliff-12m | history | 3822 | 3.5% | 5.3% | 5.3% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 0.5%/5% | cliff6-linear24 | factorial | 4800 | 5.3% | 40.3% | 40.2% | 6.2% | 2.59% | 12.8% | 71.8% | 94.8% | 99.7% |
| v2 hold α 0.5%/5% | cliff6-linear24 | covering | 7360 | 5.4% | 24.9% | 24.7% | 6.2% | 1.68% | 4.4% | 55.4% | 89.6% | 102.2% |
| v2 hold α 0.5%/5% | cliff6-linear24 | timing | 880 | 17.9% | 67.7% | 65.8% | 44.9% | 27.70% | 94.2% | 102.2% | 105.1% | 105.1% |
| v2 hold α 0.5%/5% | cliff6-linear24 | history | 3822 | 4.6% | 4.9% | 4.9% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 2%/10% | linear-12m | factorial | 4800 | 21.5% | 60.9% | 60.3% | 22.1% | 7.59% | 58.2% | 90.3% | 103.6% | 105.6% |
| v2 hold α 2%/10% | linear-12m | covering | 10400 | 20.2% | 43.3% | 42.9% | 20.3% | 6.30% | 53.5% | 91.7% | 99.9% | 102.9% |
| v2 hold α 2%/10% | linear-12m | timing | 880 | 39.9% | 82.8% | 80.5% | 53.9% | 32.30% | 97.8% | 104.4% | 107.4% | 107.4% |
| v2 hold α 2%/10% | linear-12m | history | 3822 | 18.8% | 18.1% | 18.1% | 0.7% | 0.04% | 0.0% | 0.0% | 9.6% | 15.2% |
| v2 hold α 2%/10% | cliff-12m | factorial | 4800 | 6.7% | 51.7% | 51.6% | 7.5% | 3.26% | 30.5% | 75.8% | 96.2% | 105.2% |
| v2 hold α 2%/10% | cliff-12m | covering | 7040 | 9.0% | 28.9% | 28.8% | 10.6% | 3.21% | 26.3% | 63.4% | 97.9% | 109.0% |
| v2 hold α 2%/10% | cliff-12m | timing | 880 | 22.3% | 77.4% | 76.0% | 44.2% | 28.53% | 95.3% | 99.9% | 105.0% | 105.0% |
| v2 hold α 2%/10% | cliff-12m | history | 3822 | 5.7% | 13.6% | 13.6% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 2%/10% | cliff6-linear24 | factorial | 4800 | 8.3% | 51.6% | 51.3% | 9.5% | 3.99% | 35.7% | 81.8% | 96.7% | 100.6% |
| v2 hold α 2%/10% | cliff6-linear24 | covering | 7360 | 7.7% | 31.2% | 31.0% | 10.6% | 2.94% | 22.1% | 67.3% | 95.8% | 105.5% |
| v2 hold α 2%/10% | cliff6-linear24 | timing | 880 | 24.0% | 77.7% | 75.6% | 49.8% | 30.88% | 96.3% | 100.9% | 105.3% | 105.3% |
| v2 hold α 2%/10% | cliff6-linear24 | history | 3822 | 7.1% | 12.9% | 12.9% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 3%/15% | linear-12m | factorial | 4800 | 23.6% | 64.8% | 64.2% | 26.7% | 8.66% | 62.1% | 92.3% | 104.3% | 106.3% |
| v2 hold α 3%/15% | linear-12m | covering | 10400 | 22.0% | 47.7% | 47.2% | 23.9% | 7.11% | 56.8% | 92.5% | 100.3% | 104.0% |
| v2 hold α 3%/15% | linear-12m | timing | 880 | 42.6% | 84.8% | 82.6% | 59.2% | 33.39% | 98.3% | 104.9% | 107.9% | 107.9% |
| v2 hold α 3%/15% | linear-12m | history | 3822 | 20.7% | 23.7% | 23.5% | 2.0% | 0.09% | 0.0% | 3.4% | 13.9% | 23.9% |
| v2 hold α 3%/15% | cliff-12m | factorial | 4800 | 8.0% | 52.7% | 52.5% | 9.2% | 4.22% | 43.9% | 82.0% | 99.3% | 106.6% |
| v2 hold α 3%/15% | cliff-12m | covering | 7040 | 10.1% | 30.5% | 30.4% | 13.5% | 4.41% | 37.2% | 69.8% | 100.2% | 111.1% |
| v2 hold α 3%/15% | cliff-12m | timing | 880 | 24.9% | 77.7% | 76.7% | 49.0% | 30.96% | 96.4% | 101.0% | 105.7% | 105.7% |
| v2 hold α 3%/15% | cliff-12m | history | 3822 | 6.7% | 13.3% | 13.3% | 0.0% | 0.00% | 0.0% | 0.0% | 0.0% | 0.0% |
| v2 hold α 3%/15% | cliff6-linear24 | factorial | 4800 | 9.7% | 54.0% | 53.7% | 11.6% | 4.91% | 45.7% | 86.2% | 98.6% | 101.3% |
| v2 hold α 3%/15% | cliff6-linear24 | covering | 7360 | 8.7% | 32.9% | 32.6% | 13.3% | 3.89% | 30.1% | 70.3% | 98.0% | 106.9% |
| v2 hold α 3%/15% | cliff6-linear24 | timing | 880 | 26.5% | 79.9% | 77.6% | 53.5% | 33.07% | 97.4% | 101.8% | 106.7% | 106.7% |
| v2 hold α 3%/15% | cliff6-linear24 | history | 3822 | 8.3% | 13.8% | 13.8% | 0.1% | 0.00% | 0.0% | 0.0% | 0.0% | 1.8% |
| v2 blend k 150%/75% | linear-12m | factorial | 4800 | 37.0% | 77.5% | 77.2% | 39.4% | 11.62% | 70.7% | 94.2% | 104.5% | 106.9% |
| v2 blend k 150%/75% | linear-12m | covering | 10400 | 34.0% | 62.1% | 61.6% | 32.9% | 9.37% | 63.2% | 92.6% | 99.5% | 101.6% |
| v2 blend k 150%/75% | linear-12m | timing | 880 | 42.6% | 84.7% | 82.0% | 61.1% | 34.62% | 98.6% | 104.5% | 108.3% | 108.3% |
| v2 blend k 150%/75% | linear-12m | history | 3822 | 35.5% | 50.6% | 50.6% | 11.1% | 0.71% | 4.4% | 15.9% | 39.9% | 48.7% |
| v2 blend k 150%/75% | cliff-12m | factorial | 4800 | 15.9% | 65.8% | 65.6% | 21.8% | 8.59% | 68.3% | 92.3% | 100.8% | 104.5% |
| v2 blend k 150%/75% | cliff-12m | covering | 7040 | 14.6% | 45.6% | 45.3% | 20.1% | 7.03% | 56.2% | 89.8% | 106.6% | 112.1% |
| v2 blend k 150%/75% | cliff-12m | timing | 880 | 18.7% | 62.5% | 60.9% | 47.2% | 29.59% | 94.5% | 100.8% | 103.2% | 103.2% |
| v2 blend k 150%/75% | cliff-12m | history | 3822 | 15.4% | 41.2% | 41.2% | 2.7% | 0.20% | 0.0% | 7.0% | 25.3% | 37.6% |
| v2 blend k 150%/75% | cliff6-linear24 | factorial | 4800 | 18.5% | 68.4% | 68.2% | 25.5% | 8.91% | 66.3% | 94.7% | 103.0% | 105.6% |
| v2 blend k 150%/75% | cliff6-linear24 | covering | 7360 | 15.7% | 47.4% | 47.2% | 23.5% | 7.98% | 65.6% | 88.6% | 102.0% | 106.7% |
| v2 blend k 150%/75% | cliff6-linear24 | timing | 880 | 22.3% | 70.6% | 68.1% | 54.0% | 33.07% | 97.1% | 103.4% | 107.0% | 107.0% |
| v2 blend k 150%/75% | cliff6-linear24 | history | 3822 | 17.8% | 41.7% | 41.7% | 3.3% | 0.22% | 0.0% | 8.1% | 27.9% | 36.3% |
| v2 blend k 100%/50% | linear-12m | factorial | 4800 | 45.1% | 83.1% | 82.8% | 50.7% | 13.32% | 72.1% | 94.1% | 102.7% | 107.0% |
| v2 blend k 100%/50% | linear-12m | covering | 10400 | 41.3% | 68.8% | 68.4% | 39.2% | 10.57% | 65.1% | 93.1% | 100.7% | 104.8% |
| v2 blend k 100%/50% | linear-12m | timing | 880 | 51.9% | 90.0% | 88.3% | 70.6% | 32.53% | 98.8% | 103.1% | 106.5% | 106.5% |
| v2 blend k 100%/50% | linear-12m | history | 3822 | 43.2% | 62.6% | 62.6% | 21.4% | 1.70% | 10.6% | 25.9% | 48.9% | 54.9% |
| v2 blend k 100%/50% | cliff-12m | factorial | 4800 | 26.3% | 78.9% | 78.6% | 40.1% | 11.83% | 74.6% | 96.0% | 104.2% | 106.7% |
| v2 blend k 100%/50% | cliff-12m | covering | 7040 | 22.5% | 55.7% | 55.4% | 31.8% | 11.01% | 68.1% | 94.8% | 107.8% | 116.9% |
| v2 blend k 100%/50% | cliff-12m | timing | 880 | 30.2% | 79.3% | 78.0% | 64.1% | 37.15% | 98.5% | 103.5% | 106.0% | 106.0% |
| v2 blend k 100%/50% | cliff-12m | history | 3822 | 25.2% | 63.6% | 63.6% | 14.5% | 1.40% | 10.8% | 26.9% | 53.2% | 57.6% |
| v2 blend k 100%/50% | cliff6-linear24 | factorial | 4800 | 27.7% | 79.3% | 79.1% | 43.4% | 12.10% | 70.4% | 95.9% | 103.0% | 105.2% |
| v2 blend k 100%/50% | cliff6-linear24 | covering | 7360 | 22.8% | 56.2% | 55.8% | 32.4% | 11.05% | 75.3% | 92.7% | 101.2% | 105.0% |
| v2 blend k 100%/50% | cliff6-linear24 | timing | 880 | 31.8% | 82.4% | 80.0% | 67.5% | 37.06% | 99.3% | 103.8% | 105.8% | 105.8% |
| v2 blend k 100%/50% | cliff6-linear24 | history | 3822 | 26.5% | 60.9% | 60.9% | 16.4% | 1.45% | 9.5% | 25.8% | 49.7% | 58.7% |

## By price-path family (factorial and covering cells)

| Setting | Shape | gbm | volBurst | jumps | gap | bleed | vShape | pumpDump | regime | chaos | bootstrap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 0.00% / 0% | 0.20% / 46% | 0.03% / 25% | 13.90% / 94% | 0.00% / 0% | 1.33% / 80% | 8.53% / 98% | 0.00% / 8% | 1.77% / 90% | 0.00% / 0% |
| v1 (testnet) | cliff-12m | 0.43% / 20% | 3.73% / 75% | 0.91% / 47% | 14.30% / 104% | 0.25% / 19% | 2.27% / 65% | 17.45% / 99% | 0.05% / 44% | 3.08% / 91% | 0.43% / 25% |
| v1 (testnet) | cliff6-linear24 | 0.01% / 7% | 0.55% / 48% | 1.01% / 49% | 16.82% / 95% | 0.00% / 0% | 1.87% / 71% | 24.37% / 100% | 0.06% / 17% | 3.42% / 93% | 0.01% / 3% |
| v2 hold α 0.5%/5% | linear-12m | 0.03% / 22% | 1.92% / 58% | 0.72% / 35% | 28.52% / 103% | 0.92% / 43% | 6.15% / 83% | 9.39% / 107% | 1.41% / 44% | 5.35% / 94% | 0.12% / 55% |
| v2 hold α 0.5%/5% | cliff-12m | 0.00% / 0% | 0.10% / 35% | 1.26% / 71% | 5.82% / 100% | 0.01% / 10% | 5.47% / 79% | 1.49% / 91% | 0.28% / 62% | 0.88% / 80% | 0.00% / 0% |
| v2 hold α 0.5%/5% | cliff6-linear24 | 0.00% / 0% | 0.70% / 35% | 0.44% / 47% | 8.29% / 100% | 0.41% / 33% | 1.19% / 71% | 4.72% / 100% | 0.24% / 31% | 4.06% / 102% | 0.01% / 7% |
| v2 hold α 2%/10% | linear-12m | 0.11% / 31% | 3.40% / 71% | 1.19% / 42% | 31.80% / 105% | 1.27% / 34% | 8.56% / 89% | 11.94% / 106% | 2.30% / 46% | 6.79% / 94% | 0.14% / 28% |
| v2 hold α 2%/10% | cliff-12m | 0.00% / 0% | 0.16% / 48% | 3.09% / 57% | 11.92% / 109% | 0.06% / 25% | 9.04% / 100% | 3.89% / 95% | 0.79% / 49% | 1.63% / 83% | 0.00% / 1% |
| v2 hold α 2%/10% | cliff6-linear24 | 0.00% / 2% | 1.74% / 45% | 0.93% / 46% | 11.49% / 99% | 1.43% / 29% | 2.42% / 82% | 9.46% / 97% | 0.70% / 37% | 5.15% / 106% | 0.00% / 0% |
| v2 hold α 3%/15% | linear-12m | 0.19% / 35% | 5.01% / 75% | 1.81% / 48% | 33.38% / 106% | 1.61% / 41% | 10.30% / 92% | 12.98% / 106% | 3.02% / 52% | 7.89% / 96% | 0.23% / 34% |
| v2 hold α 3%/15% | cliff-12m | 0.00% / 3% | 0.29% / 52% | 4.49% / 79% | 14.96% / 111% | 0.15% / 26% | 12.28% / 97% | 5.19% / 98% | 1.44% / 55% | 2.28% / 87% | 0.00% / 0% |
| v2 hold α 3%/15% | cliff6-linear24 | 0.00% / 0% | 2.55% / 51% | 1.57% / 51% | 13.91% / 101% | 2.49% / 35% | 3.43% / 85% | 11.58% / 99% | 1.12% / 43% | 6.00% / 107% | 0.00% / 0% |
| v2 blend k 150%/75% | linear-12m | 0.36% / 40% | 10.97% / 76% | 4.16% / 52% | 36.73% / 107% | 1.49% / 39% | 13.39% / 95% | 18.32% / 106% | 4.24% / 65% | 10.72% / 95% | 0.50% / 41% |
| v2 blend k 150%/75% | cliff-12m | 0.08% / 18% | 6.64% / 75% | 3.74% / 71% | 23.32% / 112% | 1.05% / 37% | 12.33% / 93% | 17.07% / 104% | 2.06% / 60% | 8.65% / 105% | 0.11% / 30% |
| v2 blend k 150%/75% | cliff6-linear24 | 0.28% / 31% | 4.30% / 68% | 2.93% / 60% | 28.18% / 107% | 1.85% / 37% | 8.54% / 88% | 24.34% / 102% | 2.39% / 53% | 9.94% / 103% | 0.15% / 12% |
| v2 blend k 100%/50% | linear-12m | 0.74% / 41% | 15.11% / 80% | 6.13% / 64% | 34.49% / 107% | 2.43% / 33% | 14.23% / 100% | 21.75% / 105% | 5.55% / 66% | 12.18% / 98% | 1.25% / 52% |
| v2 blend k 100%/50% | cliff-12m | 1.51% / 38% | 12.57% / 86% | 9.07% / 75% | 26.95% / 117% | 2.99% / 52% | 18.44% / 100% | 23.49% / 107% | 4.59% / 77% | 10.96% / 104% | 0.88% / 41% |
| v2 blend k 100%/50% | cliff6-linear24 | 1.39% / 46% | 9.33% / 63% | 7.51% / 59% | 29.27% / 105% | 4.47% / 34% | 11.40% / 90% | 31.48% / 103% | 4.83% / 71% | 13.65% / 105% | 0.80% / 41% |

Each entry: mean loss / worst loss.

## Gap timing: worst loss from one overnight gap on any week of the loan

Each cell has ordinary σ 60% noise around the gap, and the LTV is what each setting lends at that calm σ (v2 lends up to about 40% here, far above its 14–19% on real histories), so a loss is the gap plus the noise at the LTV actually lent. Gaps are outside every setting's diffusion model: this table is what the backstop, insurance and junior tranche are for.

| Setting | Shape | −30% | −50% | −80% | −95% |
| --- | --- | --- | --- | --- | --- |
| v1 (testnet) | linear-12m | 0.0% | 0.0% | 57.3% (day 29) | 96.1% (day 337) |
| v1 (testnet) | cliff-12m | 0.0% | 21.2% (day 78) | 67.0% (day 36) | 99.7% (day 351) |
| v1 (testnet) | cliff6-linear24 | 0.0% | 6.4% (day 15) | 70.2% (day 36) | 98.4% (day 316) |
| v2 hold α 0.5%/5% | linear-12m | 23.9% (day 316) | 35.4% (day 190) | 85.4% (day 351) | 105.8% (day 323) |
| v2 hold α 0.5%/5% | cliff-12m | 0.0% | 30.5% (day 330) | 72.6% (day 183) | 102.7% (day 344) |
| v2 hold α 0.5%/5% | cliff6-linear24 | 9.8% (day 239) | 30.4% (day 182) | 83.3% (day 323) | 105.1% (day 364) |
| v2 hold α 2%/10% | linear-12m | 25.1% (day 337) | 48.3% (day 309) | 84.7% (day 281) | 107.4% (day 351) |
| v2 hold α 2%/10% | cliff-12m | 5.9% (day 36) | 39.6% (day 344) | 80.4% (day 364) | 105.0% (day 330) |
| v2 hold α 2%/10% | cliff6-linear24 | 12.8% (day 239) | 42.2% (day 281) | 83.2% (day 182) | 105.3% (day 309) |
| v2 hold α 3%/15% | linear-12m | 20.0% (day 225) | 51.3% (day 337) | 84.0% (day 281) | 107.9% (day 351) |
| v2 hold α 3%/15% | cliff-12m | 14.2% (day 36) | 46.2% (day 344) | 81.6% (day 127) | 105.7% (day 330) |
| v2 hold α 3%/15% | cliff6-linear24 | 12.3% (day 274) | 49.2% (day 281) | 85.1% (day 182) | 106.7% (day 323) |
| v2 blend k 150%/75% | linear-12m | 17.3% (day 364) | 51.1% (day 246) | 83.9% (day 148) | 108.3% (day 351) |
| v2 blend k 150%/75% | cliff-12m | 2.6% (day 295) | 38.4% (day 295) | 86.6% (day 288) | 103.2% (day 365) |
| v2 blend k 150%/75% | cliff6-linear24 | 22.6% (day 239) | 44.9% (day 281) | 86.8% (day 316) | 107.0% (day 364) |
| v2 blend k 100%/50% | linear-12m | 31.4% (day 232) | 56.9% (day 78) | 86.6% (day 330) | 106.5% (day 364) |
| v2 blend k 100%/50% | cliff-12m | 31.1% (day 232) | 58.9% (day 246) | 86.0% (day 232) | 106.0% (day 302) |
| v2 blend k 100%/50% | cliff6-linear24 | 32.5% (day 106) | 53.3% (day 127) | 87.8% (day 182) | 105.8% (day 358) |

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
