# Sepolia Borrow Flow Test Guide

This is a step-by-step guide to test the full borrow flow on Sepolia testnet: connect wallet → escrow → borrow → repay → settle.

## Visual Flow

![Borrow Flow (Escrow to Loan Issuance)](../assets/diagrams/vestra-borrow-flow.png)

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
7. (Optional) Seed a Sablier v2 stream and wrapper only:
   - `SEED_SABLIER=1 npx hardhat run scripts/seed-sepolia-vesting.js --network sepolia`
   - Prints the wrapper address and a collateral ID; use **Import from Sablier v2** in the Borrow UI.

## Flow: Escrow → Borrow → Repay → Settle
1. Connect wallet in the frontend (RainbowKit).
2. Choose collateral source: **Manual** (paste any vesting contract) or **Import from Sablier v2** (paste lockup + stream ID + wrapper address).
3. Check borrow limit in the UI (or via console):
   - Verify the valuation address matches the deployed `ValuationEngine`.
4. Escrow the vesting position (frontend or `adapter.escrow`).
5. Create a loan: `loanManager.createLoan(collateralId, vestingAddress, borrowAmount)`.
6. Repay (partial or full): approve USDC → `repayLoan(loanId, amount)`.
7. Wait for unlock time, then settle: `loanManager.settleAtUnlock(loanId)`.

## Expected Outcomes
- Full repay → tokens released to borrower.
- Partial repay → seized amount swapped; excess returned.
- Default → seized and liquidated; pool repaid.

## Settlement Decision Path

![Repay and Settle Flow](../assets/diagrams/vestra-settle-flow.png)

## Troubleshooting
- “No funds”: add Sepolia ETH from a faucet.
- “Oracle error”: check the price feed address for Sepolia.
- “Insufficient approval”: increase USDC approval amount.
- “Next.js / RainbowKit Load Error”: Run `npm install @walletconnect/ethereum-provider --legacy-peer-deps` in `frontend-v2`.
- “Indexer Init Failure”: Check `IndexerService.js` for 10-block chunking (respects Alchemy free-tier limits).

