# Per-token risk snapshots

Generated 2026-10-22T12:21:22.531Z by `npm run refresh`. Price and volume: CoinGecko public API (`https://api.coingecko.com/api/v3`), daily closes at 00:00 UTC; the partial current day is dropped.

| Token | Data | Daily returns | Spot | σ total / EWMA | ADV (30d) | Rank | Ω | Per-loan cap | Validated | Calibrated | Monitor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ARB (`arbitrum`) | 2025-10-23 → 2026-10-22 | 364 | $0.18792 | 100% / 116% | $226,419,401 | 2 (assumed) | 100.0% | $932,465,071 | yes | 2026-10-22 on data to 2026-10-22 | ok |
| OP (`optimism`) | 2025-10-23 → 2026-10-22 | 364 | $0.128741 | 98% / 128% | $98,332,960 | 2 (assumed) | 100.0% | $336,646,951 | yes | 2026-10-22 on data to 2026-10-22 | ok |
| LDO (`lido-dao`) | 2025-10-23 → 2026-10-22 | 364 | $0.404837 | 220% / 98% | $60,626,485 | 2 (assumed) | 0 — no new credit | — | — | 2026-10-22 on data to 2026-10-22 | ok |
| FET (`fetch-ai`) | 2025-10-23 → 2026-10-22 | 364 | $0.195132 | 129% / 103% | $143,063,383 | 2 (assumed) | 87.5% | $422,646,840 | yes | 2026-10-22 on data to 2026-10-22 | ok |
| STRK (`starknet`) | 2025-10-23 → 2026-10-22 | 364 | $0.0573442 | 138% / 262% | $162,792,204 | 2 (assumed) | 100.0% | $132,111,157 | yes | 2026-10-22 on data to 2026-10-22 | ok |
| JUP (`jupiter-exchange-solana`) | 2025-10-23 → 2026-10-22 | 364 | $0.326617 | 104% / 100% | $90,919,926 | 2 (assumed) | 100.0% | $471,891,598 | yes | 2026-10-22 on data to 2026-10-22 | ok |

- **ARB**: arbitrum-one `0x912ce59144191c1204e64559fe8253a0e49e6548`, arbitrum-nova `0xf823c3cd3cebe0a1fa952ba88dc9eef8e0bf46ad`, ethereum `0xb50721bcf8d664c30412cfbc6cf7a15145234ad1`. Unlocks: not modelled.
- **OP**: optimistic-ethereum `0x4200000000000000000000000000000000000042`. Unlocks: not modelled.
- **LDO — data quality**: 5 suspected bad print(s) kept in the data (2026-02-10 -36%, 2026-02-22 -36%, 2026-03-08 -47%, 2026-03-12 -38%, 2026-03-21 -47%). Its volatility, and so its Ω and cap, may reflect the source rather than the market; check a second source before acting.
- **LDO**: ethereum `0x5a98fcbea516cf06857215779fd812ca3bef1b32`, polygon-pos `0xc3c7d422809852031b44ab29eec9f1eff2a58756`, arbitrum-one `0x13ad51ed4f1b7e9dc168d8a00cb3f4ddd85efa60`, optimistic-ethereum `0xfdb794692724153d1488ccdbe0c56c252596735f`. Unlocks: not modelled. Binding: jump-diffusion · 0.25y; jump-diffusion · 0.5y; jump-diffusion · 1y; jump-diffusion · 2y.
- **FET — data quality**: 1 suspected bad print(s) kept in the data (2026-02-10 -28%). Its volatility, and so its Ω and cap, may reflect the source rather than the market; check a second source before acting.
- **FET**: ethereum `0xaea46a60368a7bd060eec7df8cba43b7ef41ad85`, cardano `e824c0011176f0926ad51f492bcc63ac6a03a589653520839dc7e3d9464554`, osmosis `ibc/5D1F516200EE8C6B2354102143B78A2DEDA25EDE771AC0F8DC3C1837C8FD4447`, binance-smart-chain `0x031b41e504677879370e9dbcf937283a8691fa7f`. Unlocks: not modelled. Binding: jump-diffusion · 2y.
- **STRK**: ethereum `0xca14007eff0db1f8135f4c25b34de49ab0d42766`, starknet `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`, solana `HsRpHQn6VbyMs5b5j5SV6xQ2VvpvvCCzu19GjytVSCoz`. Unlocks: not modelled.
- **JUP**: solana `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`, unichain `0xbe51a5e8fa434f09663e8fb4cce79d0b2381afad`. Unlocks: not modelled.

## What is measured and what is assumed

- Measured, from each token’s own history: spot, volatility (30d, 90d, EWMA, jump-diffusion total), drawdown, 30-day average daily volume. σ total is the jump-diffusion fit’s total volatility; the Borrow page uses the larger of total and EWMA.
- Computed by the engine under `DEFAULT_POLICY` and `DEFAULT_ASSUMPTIONS` (see README): Ω, the per-loan cap, validation, monitor alerts. Per-token reports with stresses and borrower outcomes are in `reports/`.
- Assumed: rank, where the column says “assumed” — the protocol has not assigned these tokens a rank, so rank II is used. Ω and the cap depend on it.
- Data quality: a move of at least 0.25 in log terms (+28% or −22%) that is three-quarters undone within 2 days is flagged as a suspected bad print. Flagged days are kept, never smoothed: the engine errs toward more volatility, not less.
- Not modelled: unlock schedules (no keyless source; DefiLlama’s emissions endpoint returns HTTP 402 without a paid key). Add dated unlocks to `tokens.json` to include them.
- Contract addresses are those CoinGecko lists for the coin. Testnet mock tokens are not mapped to these; the Borrow page shows a measured figure only when the stream’s token address is one listed here.
