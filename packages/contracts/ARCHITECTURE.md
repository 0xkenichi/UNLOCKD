# Vestra Core Contracts — Architecture (v1 core)

This document describes the contracts that are compiled, tested and intended for
deployment. Everything else that used to live in `src/` has been moved to
`legacy/` (see `legacy/README.md`) and is **not** part of the build.

## Contracts

| Contract | Role |
|---|---|
| `LendingPool` | ERC-4626 USDC vault. Holds all idle lender funds itself. Lends to and is repaid by `LoanManager` only. `totalAssets = idle + LoanManager.lenderClaim()`, so interest raises the share price as it accrues and expected losses lower it as soon as a liquidation starts, for every lender equally. |
| `LoanManager` | The only loan lifecycle contract: borrow → accrue → repay, or default → Dutch auction → settle. The auction is built in; the NFT never leaves escrow until a buyer has paid. |
| `VestingAdapter` | Escrows vesting-stream NFTs (Sablier v2 Lockup, Streamflow EVM wrapper, whitelisted generic ERC-721 claims). Pulls the NFT from the borrower and records the real borrower. |
| `ValuationEngine` | Prices locked collateral (dDPV) and returns the per-rank LTV. |
| `VestingRegistry` | Governor-vetted risk rank (1–3) per vesting contract. |
| `InsuranceVault` | Receives the reserve-factor share of interest. Can only pay out to `LendingPool` to cover a liquidation shortfall. |
| `PreTGEOracle` | Synthetic prices for pre-TGE tokens: set by the governor; a data signer may move them by at most ±20% per update, at most hourly. ValuationEngine adds a mandatory haircut, staleness bound and per-loan borrow cap. |

## Money flow

```
lenders ──deposit USDC──▶ LendingPool (holds funds, ERC-4626 shares)
                              │ lend()            ▲ repay(principal, interest - reserve)
                              ▼                   │
borrower ◀── USDC (minus fee) ── LoanManager ─────┘
                                   │  fee ──▶ feeRecipient (treasury)
                                   │  reserve share of interest ──▶ InsuranceVault
                                   │
               default ──▶ Dutch auction in LoanManager ──buyer pays──▶ NFT + vested tokens to buyer
                                   ├─ debt ──▶ LendingPool
                                   ├─ surplus ──▶ borrower (claimable)
                                   └─ shortfall ──▶ InsuranceVault.cover() ──▶ LendingPool,
                                                    remainder is a loss for all lenders (share price)
```

## Valuation (what the code computes)

```
P      = min(Chainlink spot, TWAP, EWMA)            (stale/invalid → revert)
base   = Q · P                                      (USDC, 6 decimals)
pv     = base · e^(−r_rank · T) · (1 − σ/2) · Ω · (1 − drawdown)
ltv    = rankBaseLtv (5000 / 3500 / 2000 bps), capped by per-token hard cap
maxBorrow = pv · ltv
```

* `σ` is governor-set volatility, clamped to [0, 100%], so the volatility factor is in [0.5, 1].
* `Ω ∈ [0, 1]` is set by the guardian. **Ω = 0 means "no new credit"** (pv = 0). Unset means 1.
* Pre-TGE tokens use the `PreTGEOracle` price times a mandatory `D_uncertainty` haircut (default 90%).
* Freezes, Ω and the EWMA apply to **origination only**. Liquidation health checks use
  `liquidationValue()`, which ignores freezes, Ω and the EWMA and uses the loan's stored rank, so a risk control
  can never make an existing loan liquidatable or block its liquidation.
* Pre-TGE tokens require a per-loan borrow cap (`tokenMaxBorrowUsd`).

## Loans

* **Origination**: the borrower approves the NFT to `VestingAdapter` and calls
  `LoanManager.borrow(nftContract, streamId, protocol, amount, maturity)`. Quantity, token and unlock time are read
  from the stream, never from the caller.
* **Interest**: floating. Every loan's debt is `scaledDebt × borrowIndex`; the index grows at the pool's
  utilization-based APR (kink model). The index is accrued before every change in utilization (borrow, repay,
  and every pool deposit/withdraw), so a flash deposit cannot lower anyone's rate.
* **Lender accounting**: `lenderClaim()` = principal + accrued interest net of the reserve factor + the marked
  value of loans in liquidation. Interest therefore reaches lenders continuously (no just-in-time capture).
* **Fees**: 0.5% origination fee to the treasury; 10% of interest to `InsuranceVault`.
* **Maturity**: chosen by the borrower, at most the stream's unlock time.
* **Liquidation** is open to anyone when either:
  1. `block.timestamp > maturity + gracePeriod` (default 3 days), or
  2. `debt > liquidationValue · liqThreshold[rank]` (default 6500 / 5000 / 3500 bps).
* **Auction**: linear Dutch auction of the escrowed NFT from 120% of the collateral's spot value down to 0
  over `auctionDuration` (default 3 days). The buyer pays the current price at the time of their transaction (with
  a max-price guard) and receives the stream NFT plus any vested tokens already withdrawn into escrow. Interest
  stops accruing when the auction starts. Each round ends at a floor of 10% of its start price; after a round
  ends, anyone can restart from that floor. The price never jumps to zero.
* **Mark-down**: when the auction starts the loan is carried at min(lenders' claim, liquidation value) (0 if no
  price is available), so lenders exiting during the auction take their share of the expected loss. Recoveries
  above the mark raise the share price at settlement. *Known limitation*: between a loan becoming liquidatable
  and someone calling `startLiquidation`, the loss is not yet booked; run a keeper.
* **Ranks** are fixed per loan at origination; registry changes only affect new loans.
* **Rescue**: the borrower (or anyone) can repay the full debt during the auction, which cancels it.
* **Verification**: `test/VestraV2.t.sol` (reference vectors, fuzzed theorems, the lifecycle, and regressions
  from an internal adversarial review) and `test/VestraV2Invariants.t.sol` (stateful fuzzing: random sequences of
  every action with six invariants re-checked after each). `docs/RISK_REGISTER.md` maps each risk to its test.
* **Settlement**: proceeds repay the debt, any surplus is credited to the borrower (`claim()`), and any shortfall is
  covered by `InsuranceVault` up to its balance; any remaining gap is a loss for all lenders. If recovery exceeds
  the lenders' net claim, the reserve factor's share of interest goes to `InsuranceVault`.
* **Vested tokens**: while escrowed, the adapter is the stream recipient, so anything withdrawn from the stream is
  held by the adapter and attributed to that escrow. It always leaves together with the NFT.

## Governance

* One `GOVERNOR_ROLE` (deploy behind an OpenZeppelin `TimelockController` + multisig in production) and one
  `GUARDIAN_ROLE` (pause, Ω, freeze).
* `LendingPool.loanManager` and `VestingAdapter.loanManager` can be set **once**. No role can redirect lender funds
  or escrowed NFTs.
* `InsuranceVault` has no governor withdrawal.

## Not implemented (whitepaper roadmap)

AI/ZK-driven Ω, T−30 staged tranche auctions, time-released liquidation with stop-losses, consented seizure of
other wallet assets, veCRDT revenue distribution, community pools, staking.

---

# v2 loan book (`src/v2/`)

v2 is the yellow paper's model, calibrated by the stress test (`packages/risk/bin/stress.js`). It is a
separate deployment: its own pool, adapter, insurance vault, credit engine, risk oracle, backstop vault and
loan manager. v1 stays as it is. Deploy with `script/DeployV2.s.sol` (Foundry) or, without Foundry,
`node scripts/deploy-v2.mjs` (solc + ethers; `--dry-run` replays the whole deployment on a local in-process
chain first, `DEPLOY_MOCKS=1` also sets up a demo token, feed and stream). The daily risk inputs come from
`packages/risk/bin/post-risk.js`.

| Contract | Role |
|---|---|
| `CreditEngineV2` | Stateless. Values a Lockup Linear schedule as a cliff lump plus linear vesting. Uses two 8-point Gauss–Legendre panels, a confidence quantile that widens with σ√τ, an optional sale value (blend mode), and a position-level liquidity cost. Also computes the borrowing limit with the 4-interval drift cap. |
| `RiskOracle` | Measures prices on-chain (Chainlink spot and a TWAP over its rounds). Stores bounded risk inputs (σ, median volume, unlock drag) posted by `RISK_POSTER_ROLE`, which expire after 2 days. Ω cuts apply at once; raises are capped at +5 points and wait 24 h. |
| `BackstopVault` | Partner first-loss capital per token. Opt-in loans lock 16% of their principal here, and a shortfall draws only that loan's lock; standard loans are unbacked and never touch it. The partner can withdraw unlocked funds at any time, so its exposure is exactly the sum of its locks. |
| `LoanManagerV2` | Runs both tiers, fixed-rate simple interest and the resolution ladder. Splits each loss across the backstop, insurance and lenders. Holds the per-token exposure cap. |
| `LoanLensV2` | Read-only helpers for apps and keepers: `quoteMaxBorrow` for a stream not yet escrowed, and `status` (debt, credit value, liquidatable). Kept out of the loan manager, which sits at 24.3 KB against the 24,576-byte limit; `scripts/deploy-v2.mjs` refuses to deploy anything over it. |
| `VestingAdapter` (shared code, new functions) | `schedule()` and `previewSchedule()` read start, cliff and end. `transferVested()` hands vested escrow tokens to a paydown buyer. Streams that are not Lockup Linear are recorded as one cliff at the end, which values them conservatively. |

## Tiers (`CreditEngineV2`, `packages/risk/src/tiers.js`)

| Tier | Valuation | α origination / liquidation | k (sale discount, a year) | Backstop | Avg LTV on real history (linear / cliff) |
|---|---|---|---|---|---|
| Standard (default) | hold | 2% / 10% | — | none | 18.8% / 5.7% |
| Opt-in (borrower chooses) | blend | 0.5% / 5% | 150% / 75% | 16% of principal, locked before the loan opens | 35.5% / 15.4% |

Each tier's curve is a set of constants, so a loan's terms can never change after it opens. Governance can
raise the opt-in backstop, but never below 16%.

## The borrowing limit

```
B = Ω · (1 − 0.25%) · min( CV_αo(t0),  CV_αℓ(T)/(1 + r(T − t0)),  min_j CV_αℓ(g_j)/(1 + r(g_{j+1} − t0)) )
```

`g_0 … g_4` split the term into four intervals. At an unchanged price CV_αℓ never falls as time passes, so each
interval's term bounds every day inside it. A loan at B is therefore never liquidatable on any day if the price
does not move. This is theorem T7 in `docs/RISK_PROOFS.md`; it is checked day by day for this exact formula in
`packages/risk/test/onchainV2.test.js` and fuzzed against the Solidity in `test/VestraV2.t.sol`.

The 0.25% buffer covers the quadrature's small upside error at blend mode's kink. With it, the contract never
lends more than the proven model (`packages/risk/src/v2.js`) across 3,000 random streams.

## Loan lifecycle

* **Interest** is simple interest on outstanding principal. Its rate is fixed at origination as the highest of
  the pool rate at the 7-day time-weighted utilisation, at utilisation now, and at utilisation after the loan,
  plus the tier premium (opt-in +2%). The borrower sets a maximum rate. The time-weighted utilisation and pool
  assets are advanced by `accrue()`, which the pool calls before every deposit and withdrawal, so a deposit in
  the same block can neither lower a fixed rate nor lift the per-token exposure cap (measured against the
  smaller of time-weighted and current assets).
* **Health** is `debt > CV_αℓ(now)`. σ, volume and drag are frozen at origination. Only the TWAP price is live,
  so no posted input, Ω cut or pause can make an open loan liquidatable. Without a fresh price, only maturity can
  liquidate a loan; a missing price is never taken as evidence of health, so a breach cannot be cleared on a stale
  feed, and the partner's right of first refusal needs a price to be priced from.
* **Collateral already withdrawn** before escrow, and tokens sold in paydowns, are consumed from the
  earliest-vesting part of the schedule first; only `total − consumed` tokens are ever valued.
* **Ladder**:
  1. Anyone calls `flagBreach`.
  2. A 2-day cure window gives the borrower time to repay. A repayment that restores health clears the breach.
  3. A 5-day paydown window lets `PAYDOWN_BUYER_ROLE` buyers buy vested escrow tokens. They pay the health price
     less 3%, at most 2% of the frozen daily volume per day. Proceeds pay interest, then principal.
  4. `startLiquidation` follows. The partner has a 72 h right of first refusal at max(debt, θ · fair value),
     where fair value is CV at z = 0.
  5. Next comes a Dutch auction from max(fair value, debt) down to a floor of CV_αℓ. Unsold rounds restart from
     the floor with a floor 10% lower.
* **Verification**: `test/VestraV2.t.sol` (reference vectors, fuzzed theorems, the lifecycle, and regressions
  from an internal adversarial review) and `test/VestraV2Invariants.t.sol` (stateful fuzzing: random sequences of
  every action with six invariants re-checked after each). `docs/RISK_REGISTER.md` maps each risk to its test.
* **Settlement**:
  * A surplus goes to the borrower (`claim`).
  * A shortfall is drawn from the loan's backstop lock first (opt-in loans only), then the insurance fund, then
    lenders through the share price.
  * Defaulted streams go to the partner or a bidder as a locked stream, never as tokens on an exchange.
* **Lender accounting**: `lenderClaim()` is computed in O(1) from Σ P, Σ unpaid interest, Σ P·r and Σ P·r·t.
  It covers principal plus interest net of the 10% reserve factor, plus the marked value of loans in auction.

## Not yet in v2

* Term and Coupon notes, and the senior and junior classes. The pool is one ERC-4626 class, so losses fall on
  all lenders equally after the backstop and insurance.
* The T−30 staged sale and Sablier Lockup Tranched/Dynamic shapes. Tranched and Dynamic streams are valued as
  one cliff at the end.
* A quorum (2-of-3 median) for risk posts and Ω, and pre-TGE tokens. Pre-TGE stays on v1's `PreTGEOracle`.
