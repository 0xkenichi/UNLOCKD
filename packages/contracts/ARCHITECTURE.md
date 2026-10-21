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
