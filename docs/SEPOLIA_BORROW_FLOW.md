# Sepolia Borrow Flow Test Guide

This is a step-by-step guide to test the full borrow flow on Sepolia testnet: connect wallet → escrow → borrow → repay → settle.

## Prerequisites
- Contracts deployed to Sepolia:
  - `npx hardhat deploy --network sepolia --tags full`
- Sepolia ETH in MetaMask (for gas).
- Sepolia USDC (testnet faucet).
- Frontend running locally (`cd frontend && npm run dev`) or deployed.

## Preparation (5–10 min)
1. Switch MetaMask to Sepolia (Chain ID 11155111).
2. Get test USDC:
   - https://staging.aave.com/faucet → Sepolia → claim USDC.
3. Open the frontend:
   - Local: http://localhost:5173
4. (Optional) Deploy a short vesting mock for testing:
   - `npx hardhat console --network sepolia`
   - Deploy a mock vesting wallet with a short unlock (e.g., 1 hour).

## Flow: Escrow → Borrow → Repay → Settle
1. Connect wallet in the frontend (RainbowKit).
2. Check borrow limit in the UI (or via console):
   - Verify the valuation address matches the deployed `ValuationEngine`.
3. Escrow the vesting position:
   - Use the frontend if available, or call `adapter.escrow`.
4. Create a loan:
   - `loanManager.createLoan(collateralId, vestingAddress, borrowAmount)`
5. Repay (partial or full):
   - Approve USDC → call `repayLoan(loanId, amount)`.
6. Wait for unlock time, then settle:
   - `loanManager.settleAtUnlock(loanId)`

## Expected Outcomes
- Full repay → tokens released to borrower.
- Partial repay → seized amount swapped; excess returned.
- Default → seized and liquidated; pool repaid.

## Troubleshooting
- “No funds”: add Sepolia ETH from a faucet.
- “Oracle error”: check the price feed address for Sepolia.
- “Insufficient approval”: increase USDC approval amount.

