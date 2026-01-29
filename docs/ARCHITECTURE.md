# Architecture

This doc describes modules, responsibilities, and the core data flows.

## Core Modules
- **VestingAdapter**: verifies vesting schedules, escrows claim rights, and releases on settlement.
- **ValuationEngine**: computes DPV and LTV using on-chain oracles and risk params.
- **LendingPool**: holds liquidity and tracks total deposits/borrows.
- **LoanManager**: issues loans, accrues interest, and enforces settlement at unlock.
- **Identity (optional)**: boosts LTV for verified borrowers.

## Data Flow (Borrow)
1. Borrower escrows a vesting position.
2. Adapter exposes quantity + unlock time.
3. ValuationEngine returns PV + LTV.
4. LoanManager verifies max borrow and mints the loan.
5. LendingPool transfers stablecoins to borrower.

## Data Flow (Repay/Settle)
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
