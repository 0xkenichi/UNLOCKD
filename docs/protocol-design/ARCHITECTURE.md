# Architecture

This doc describes modules, responsibilities, and the core data flows.

## System Architecture Diagram

![UNLOCKD Protocol Architecture](../assets/diagrams/unlockd-architecture.png)

## Core Modules
- **VestingAdapter**: verifies vesting schedules, escrows claim rights, and releases on settlement.
- **ValuationEngine**: computes DPV and LTV using on-chain oracles and risk params.
- **LendingPool**: holds liquidity and tracks total deposits/borrows.
- **LoanManager**: issues loans, accrues interest, and enforces settlement at unlock.
- **Identity (optional)**: boosts LTV for verified borrowers.
- **Privacy Relay (optional)**: relays escrow, borrow, and settlement actions to reduce linkability while preserving on-chain enforcement.

## Data Flow (Borrow)

![Borrow Flow (Escrow to Loan Issuance)](../assets/diagrams/unlockd-borrow-flow.png)

1. Borrower escrows a vesting position.
2. Adapter exposes quantity and unlock time.
3. ValuationEngine returns PV + LTV.
4. LoanManager verifies max borrow and mints the loan.
5. LendingPool transfers stablecoins to borrower.
6. (Optional) Privacy Relay can proxy steps 1-5 on behalf of the borrower.

## Data Flow (Repay/Settle)

![Repay and Settle Flow](../assets/diagrams/unlockd-settle-flow.png)

1. Borrower repays principal + interest over time.
2. At unlock:
   - Full repay → release to borrower.
   - Partial/default → seize amount needed, liquidate to USDC, repay pool.
   - Excess collateral returned to borrower.

## Risk Controls
- Conservative DPV discounts (time, volatility, liquidity, shock).
- LTV caps that decay with time.
- Slippage guards on liquidation.
- Governance updates to sigma/LTV per asset class.
