# UNLOCKD / Vestra Investor Memo (One Pager)

## Thesis

UNLOCKD introduces a new DeFi credit primitive: borrowing against non-transferable locked/vesting token claims using deterministic valuation (DPV), conservative LTV policy, and settlement-at-unlock enforcement.

## Why This Matters

- Large pools of locked token value remain idle and discounted in OTC pathways.
- Existing DeFi lending markets primarily accept liquid collateral.
- UNLOCKD targets this inefficiency with non-custodial, vesting-preserving credit.

## Product Snapshot

- Core modules: `VestingAdapter`, `ValuationEngine`, `LendingPool`, `LoanManager`, auctions.
- Borrowers retain vesting exposure while unlocking liquidity.
- Lenders receive time-bound yield with parameterized risk controls.

## Current Execution Status

- End-to-end protocol flow is implemented and testable.
- CI quality gates are in place for contracts, frontend build, and backend health.
- Security and governance process docs now include:
  - risk committee charter
  - incident response runbook
  - security roadmap
  - finalized Phase 1 tokenomics
- KPI plumbing now persists analytics events and supports dashboard/export endpoints.

## Token and Governance

- Ticker: `CRDT`
- Fixed supply: 1,000,000,000 (Phase 1)
- Allocation:
  - Treasury 30%
  - Team 20%
  - Liquidity reserve 20%
  - Community sale 15%
  - Presale 7%
  - VC/investors 5%
  - Airdrop 3%

## Key Risks

- External audit evidence still pending.
- Early-stage market proof still needs named pilot partners and public KPI trendline history.
- Competitive fast-follow risk from adjacent claim-trading/lending protocols.

## 90-Day Milestones Required for Strong Investment Case

1. Secure 2+ named pilot LOIs and launch at least one live pilot.
2. Publish ongoing KPI dashboard movement (wallets, quote funnel, loan outcomes, defaults).
3. Complete static analysis + coverage gate maturation and start external audit process.
4. Demonstrate repeat borrower/lender behavior beyond one-off usage.

## Recommendation

Proceed as a high-upside, high-execution opportunity with milestone-based funding tranches tied to pilot traction, security posture, and measurable onchain/offchain KPI progress.
