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
4. (Optional) Seed a realistic vesting position:
   - `npx hardhat run scripts/vestra-realistic-setup.js --network sepolia`
   - Uses a mock VEST token, 24-month vesting, and real-ish price data.
5. (Optional) Seed multiple standards (OZ, Sablier v2, Superfluid, Timelock):
   - `npx hardhat run scripts/vestra-standards-setup.js --network sepolia`
   - Mocks mirror real interfaces but include release hooks for settlement.
6. (Optional) Seed claim-rights wrappers for real standards:
   - `npx hardhat run scripts/vestra-claim-rights-setup.js --network sepolia`
   - Uses wrapper contracts that expose `releaseTo` for settlement.

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

