# Sepolia Borrow Flow

This guide outlines the standard internal testing procedure for a borrow operation on the Sepolia Testnet.

## Step-by-Step Flow

### 1. Collateral Preparation
- User deploys a "Mock Vesting Contract" containing 10,000 $MOCK tokens.
- User registers this contract with the Vestra `VestingAdapter`.

### 2. Loan Initiation
- User selects the vesting contract in the Vestra Command Center.
- The `ValuationEngine` computes the `dDPV`:
  $$dDPV = Q \times P_{oracle} \times e^{-r \cdot T}$$
- The UI displays the max LTV (e.g., 30%).

### 3. Stealth Payout (Opt-in)
- User toggles "Privacy Mode."
- Backend Relayer computes a one-time stealth address via `ERC-5564`.
- The `LoanManager` executes the loan, sending 3,000 $USDC to the stealth address.
- Relayer emits the `Announcer` event.

### 4. Settlement / Default
- **Repayment**: User returns 3,000 $USDC + interest; vesting contract ownership is released.
- **Default (Pre-Unlock)**: If the $MOCK price crashes, the protocol triggers a **Staged Auction** at `T-30`.
- **Default (Spot)**: At `T-0`, remaining tokens are liquidated via DEX TWAP.
