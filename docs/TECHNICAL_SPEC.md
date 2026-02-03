# Technical Specification

This document defines the system architecture, module responsibilities, and core flows. It complements `ARCHITECTURE.md` and provides a stronger implementation standard.

## System Overview
The protocol enables borrowing or selling claim rights on time-locked tokens. The system enforces settlement at unlock and isolates credit risk with conservative valuation and LTV caps.

## Design Principles (Enterprise Standard)
- **Safety first**: settlement is deterministic and non-bypassable.
- **Modularity**: adapters, auctions, and privacy components can be swapped.
- **Verifiability**: core rules are on-chain and observable.
- **Least privilege**: minimal admin control; upgrade paths are explicit.
- **Policy control**: pools can select privacy and compliance constraints.

## On-Chain Components
- **VestingAdapter**: validates vesting schedules and escrows claim rights.
- **ValuationEngine**: computes discounted present value (DPV) and max LTV.
- **LoanManager**: issues loans, accrues interest, and enforces settlement at unlock.
- **LendingPool**: holds liquidity and tracks pool debt/repayments.
- **AuctionFactory + Auction types**: supports Dutch, English, and Sealed Bid auctions.
- **IdentityVerifier (optional)**: validates proofs and applies LTV boosts.

## Off-Chain / Auxiliary Components
- **Oracle feeds**: price and volatility feeds for valuation inputs.
- **Privacy relayer (optional)**: submits transactions on behalf of users to reduce linkability.
- **Indexers**: track loan state, auction state, and settlement events for UI/alerts.

## Core Data Structures (Conceptual)
- **ClaimRight**: { adapter, beneficiary, quantity, unlockTime, metadataHash }
- **Loan**: { principal, rate, startTime, unlockTime, state, borrower }
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

## Pre/Post Conditions (Interface Contracts)
- **VestingAdapter**
  - Pre: `claimData` is valid, `unlockTime` is in the future, quantity > 0, adapter is allowed.
  - Post: claim right is escrowed, non-transferable until settlement; `claimRightId` is persisted.
- **ValuationEngine**
  - Pre: claim right exists, oracle price is fresh, risk params are configured.
  - Post: `pv` is computed deterministically; `maxBorrow <= pv * ltvCap`.
- **LoanManager**
  - Pre: claim right is escrowed and not already pledged; amount <= `maxBorrow`; pool has liquidity.
  - Post: loan state is active; debt is recorded; claim right is bound to the loan.
- **LendingPool**
  - Pre: sufficient liquidity for borrow.
  - Post: borrow/repay updates pool accounting and emits events.
- **AuctionFactory and Auction**
  - Pre: claim right is escrowed and not pledged to a loan; auction ruleset is valid.
  - Post: auction is created with a fixed ruleset; settlement transfers claim rights to winner.

## State Machines
- **Loan**: `Created -> Active -> Repaid | Defaulted -> Settled`
- **Auction**: `Created -> Active -> Revealed -> Settled`

## Error Codes (Suggested, Non-Normative)
- `ERR_INVALID_CLAIM`: claim data invalid or malformed.
- `ERR_CLAIM_LOCKED`: claim already pledged or settled.
- `ERR_ORACLE_STALE`: price feed not fresh or unavailable.
- `ERR_LTV_EXCEEDED`: borrow amount exceeds max LTV.
- `ERR_POOL_LIQUIDITY`: insufficient pool liquidity.
- `ERR_UNAUTHORIZED`: caller lacks required permissions.
- `ERR_AUCTION_STATE`: invalid auction state transition.
- `ERR_SETTLEMENT_EARLY`: settlement attempted before unlock.

## Per-Function Invariants (Examples)
- `escrowClaim`: claim becomes non-transferable until settlement.
- `createLoan`: loan binds to claim right; claim cannot be re-escrowed.
- `repay`: debt never underflows; repayments reduce outstanding balance.
- `settleAtUnlock`: debt resolved before any release to borrower.
- `createAuction`: claim cannot be simultaneously pledged to a loan.

## Borrow Flow (Public or Private)
1. Borrower escrows claim rights via the adapter.
2. Adapter returns quantity and unlock time for valuation.
3. ValuationEngine returns PV and max LTV.
4. LoanManager issues a loan and records terms.
5. LendingPool transfers stablecoins to the borrower.
6. Optional relayer proxies steps 1-5.

## Repay and Settle
1. Borrower repays principal + interest any time pre-unlock.
2. At unlock, settlement enforces:
   - Full repay: release to borrower.
   - Partial repay: seize amount needed, return excess.
   - Default: seize all unlocked tokens and liquidate for pool.

## Auction Flow (Non-Loan Exit)
1. Seller escrows claim rights as an NFT.
2. Auction runs for 1-7 days with chosen auction type.
3. Winner pays stablecoins; seller receives proceeds minus fee.
4. Winner holds the claim and receives tokens at unlock.
5. Sealed-bid auctions use commit/reveal to reduce signaling.

## Privacy Model Integration
- **Selective disclosure**: proofs of eligibility without identity disclosure.
- **Relayed execution**: optional relayers submit transactions and can use private RPCs.
- **Policy gating**: pools can require verification or limit privacy modes.
- **Auditability**: settlement remains fully on-chain and verifiable.

## Risk and Safety Controls
- Conservative DPV discounts by time, volatility, liquidity, and unlock impact.
- LTV caps (20-40%) with governance-adjustable parameters.
- Slippage guards and liquidation routing for default recovery.
- Emergency pause per adapter or pool.

## Invariants (Must Always Hold)
- Claim rights cannot be released without settlement.
- Settlement at unlock always resolves outstanding debt first.
- Total debt to a pool never exceeds max borrow limits at issuance.
- Liquidation proceeds are routed to the pool before surplus is returned.

## Security Requirements
- Reentrancy protections on token transfers and settlement.
- Explicit access control with timelocks for governance updates.
- Oracle sanity checks and fallback behavior for outages.
- Adapter-level validation to prevent malformed vesting schedules.

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
