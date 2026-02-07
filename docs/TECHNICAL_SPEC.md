# Technical Specification

This document defines the system architecture, module responsibilities, and core flows for VESTRA. It complements `ARCHITECTURE.md` and the litepaper and is intended to be implementable without ambiguity.

## Scope
- On-chain escrow and settlement of claim rights.
- Conservative valuation, issuance, and repayment of loans.
- Optional auction path for debt-free exits.
- Privacy and identity hooks (optional, policy-driven).

Out of scope: legal agreements, custody frameworks, or off-chain lending.

## System Overview
The protocol enables borrowing or selling claim rights on time-locked tokens. Settlement is enforced at unlock, and credit risk is isolated through conservative DPV and LTV caps.

## Design Principles
- **Safety first**: settlement is deterministic and non-bypassable.
- **Modularity**: adapters, auctions, and privacy components can be swapped.
- **Verifiability**: core rules are on-chain and observable.
- **Least privilege**: minimal admin control; upgrades are explicit.
- **Policy control**: pools can select privacy and compliance constraints.

## On-Chain Components
- **VestingAdapter**: validates vesting schedules and escrows claim rights.
- **ValuationEngine**: computes discounted present value (DPV) and max LTV.
- **LoanManager**: issues loans, accrues interest, enforces settlement at unlock.
- **LendingPool**: holds liquidity and tracks pool debt/repayments.
- **AuctionFactory + Auction types**: Dutch, English, Sealed Bid.
- **IdentityVerifier (optional)**: validates proofs and applies LTV adjustments.
- **Governance/RiskModule**: updates risk params, whitelists adapters, and pauses.

## Off-Chain / Auxiliary Components
- **Oracle feeds**: price, volatility, and liquidity signals.
- **Privacy relayer (optional)**: submits transactions on behalf of users.
- **Indexers**: track loan state, auction state, and settlement events.
- **Risk analytics**: Monte Carlo and stress testing for parameter tuning.

## Core Data Structures (Conceptual)
- **ClaimRight**: { adapter, beneficiary, quantity, unlockTime, metadataHash, vestingSource }
- **Loan**: { principal, rate, startTime, unlockTime, debt, state, borrower, poolId }
- **PoolRiskParams**: { ltvCap, discountCurve, maxDuration, oracleConfig }
- **Auction**: { claimRightId, auctionType, startTime, endTime, ruleset }

## Contract Interfaces (Key Functions)
- **VestingAdapter**
  - `escrowClaim(claimData) -> claimRightId`
  - `getClaim(claimRightId) -> ClaimRight`
  - `release(claimRightId, recipient, amount)`
- **ValuationEngine**
  - `computePV(claimRightId) -> pv`
  - `maxBorrow(pv, poolRiskParams) -> max`
- **LoanManager**
  - `createLoan(claimRightId, amount, recipient) -> loanId`
  - `repay(loanId, amount)`
  - `settleAtUnlock(loanId)`
- **LendingPool**
  - `borrow(amount, recipient)`
  - `repay(amount)`
- **AuctionFactory**
  - `createAuction(claimRightId, auctionType, ruleset) -> auctionId`

## Adapter Requirements
Adapters must:
- Prove the vesting schedule is valid and locked.
- Provide deterministic `unlockTime` and `quantity`.
- Support `release` to route unlocked tokens to the settlement recipient.
- Prevent transfer of claim rights outside VESTRA while pledged.

## Valuation Model (DPV)
PV = Q * P * D

Where D is a composite discount factor based on:
- Time to unlock (duration risk).
- Token volatility and liquidity.
- Unlock impact and protocol risk.

Constraints:
- `maxBorrow <= PV * ltvCap`.
- LTV caps are time-aware and governance-controlled.

## Pre/Post Conditions (Interface Contracts)
- **VestingAdapter**
  - Pre: `claimData` is valid, `unlockTime` is in the future, quantity > 0.
  - Post: claim right is escrowed, non-transferable until settlement.
- **ValuationEngine**
  - Pre: claim exists, oracle price is fresh, risk params are configured.
  - Post: `pv` is computed deterministically; `maxBorrow` respects LTV cap.
- **LoanManager**
  - Pre: claim is escrowed and unpledged; amount <= `maxBorrow`; pool has liquidity.
  - Post: loan state is active; debt is recorded; claim binds to loan.
- **LendingPool**
  - Pre: sufficient liquidity for borrow.
  - Post: pool accounting updates and emits events.
- **AuctionFactory**
  - Pre: claim is escrowed and unpledged; ruleset is valid.
  - Post: auction is created with a fixed ruleset.

## State Machines
- **Loan**: `Created -> Active -> Repaid | Defaulted -> Settled`
- **Auction**: `Created -> Active -> Revealed -> Settled`

## Error Codes (Suggested)
- `ERR_INVALID_CLAIM`
- `ERR_CLAIM_LOCKED`
- `ERR_ORACLE_STALE`
- `ERR_LTV_EXCEEDED`
- `ERR_POOL_LIQUIDITY`
- `ERR_UNAUTHORIZED`
- `ERR_AUCTION_STATE`
- `ERR_SETTLEMENT_EARLY`

## Per-Function Invariants (Examples)
- `escrowClaim`: claim becomes non-transferable until settlement.
- `createLoan`: loan binds to claim right; claim cannot be re-escrowed.
- `repay`: debt never underflows; repayments reduce outstanding balance.
- `settleAtUnlock`: debt resolved before any release to borrower.
- `createAuction`: claim cannot be simultaneously pledged to a loan.

## Borrow Flow (Public or Private)
1. Borrower escrows claim rights via adapter.
2. Adapter returns quantity and unlock time for valuation.
3. ValuationEngine returns PV and max LTV.
4. LoanManager issues a loan and records terms.
5. LendingPool transfers stablecoins to borrower.
6. Optional relayer proxies steps 1-5.

## Repay and Settle
1. Borrower repays principal + interest any time pre-unlock.
2. At unlock, settlement enforces:
   - Full repay: release to borrower.
   - Partial repay: seize amount needed, return excess.
   - Default: seize all unlocked tokens and liquidate for pool.
3. Optional auto-repay after maturity can use wallet balances with a priority
   order (stables -> major tokens -> native token -> long-tail), disclosed in the
   loan agreement.
4. Auto-repay on EVM uses `repayWithSwap` / `repayWithSwapBatch`:
   - Tokens must be whitelisted and ordered via `setRepayTokenPriority`.
   - Swaps execute through the configured Uniswap v3 router into USDC.
   - Borrower must pre-approve the loan manager for each token used.
5. Solana auto-repay (optional) uses a server-side sweep:
   - The borrower delegates token accounts to the repay authority.
   - The server transfers balances in the configured priority order.
   - In `usdc-only` mode, only USDC is pulled; other mints are skipped.
   - In `transfer` mode, non-USDC balances move to treasury for manual swap.
   - In `swap` mode, non-USDC balances are swapped to USDC via Jupiter.

## Liquidation (Default Recovery)
Defaults resolve at unlock, not before:
- Unlocked tokens are seized and routed through configured liquidity paths.
- Slippage limits and routing rules are pool-controlled.
- Surplus after debt repayment is returned to borrower.

## Auction Flow (Non-Loan Exit)
1. Seller escrows claim rights as a non-transferable NFT.
2. Auction runs for 1-7 days with chosen auction type.
3. Winner pays stablecoins; seller receives proceeds minus fee.
4. Winner receives tokens at unlock.
5. Sealed-bid auctions use commit/reveal to reduce signaling.

## Privacy Model Integration
- **Selective disclosure**: proofs of eligibility without identity disclosure.
- **Relayed execution**: optional relayers submit transactions and can use private RPCs.
- **Policy gating**: pools can require verification or limit privacy modes.
- **Auditability**: settlement remains fully on-chain and verifiable.

## Governance and Access Control
- Risk params are set per pool and per asset class.
- Adapters are whitelisted via governance.
- Emergency pause can disable new loans and auctions per pool or adapter.
- Upgrade paths are explicit and timelocked.

## Oracle Requirements
- Freshness checks on price feeds.
- Volatility inputs must be bounded and sanity-checked.
- Fallback policy for outages (pause or conservative pricing).

## Events (Minimum)
- `ClaimEscrowed`, `LoanCreated`, `LoanRepaid`, `LoanSettled`, `AuctionCreated`,
  `AuctionSettled`, `PoolBorrow`, `PoolRepay`, `RiskParamsUpdated`, `Paused`.

## Security Requirements
- Reentrancy protections on token transfers and settlement.
- Explicit access control with timelocks for governance updates.
- Adapter validation to prevent malformed vesting schedules.
- Slippage guards for default recovery swaps.

## Operational Requirements
- Monitoring for oracle failures, liquidation slippage, and settlement errors.
- Indexers for loan/auction state and alerts for unlock events.
- Incident response playbook with pause and recovery steps.

## Test Plan (Minimum Standard)
- Unit tests for valuation, settlement, and auction logic.
- Property tests for edge cases (partial repay, price shocks).
- Integration tests for borrow/repay/settle flows.
- Security review checklist per `SECURITY.md`.

## Non-Functional Requirements
- Deterministic settlement within target gas limits.
- Backward-compatible adapter upgrades.
- End-to-end latency suitable for auction windows.

## Open Questions
- Final proof system choice for selective disclosure.
- Privacy relayer trust and incentive model.
- Pool-level compliance requirements per jurisdiction.
