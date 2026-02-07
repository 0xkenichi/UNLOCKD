MVP DEMO (FRONTEND + BACKEND + CONTRACTS)

Goal
Provide a functional end-to-end demo on Sepolia with:
- Frontend UI (wallet + flows)
- Backend indexer APIs
- Live contract reads/writes

Quick start (Sepolia)
1) Start backend + frontend:
   ./scripts/run-mvp.sh

2) Open:
   http://localhost:5173

Required env (optional, but recommended)
- RPC_URL: Sepolia RPC endpoint (defaults to https://rpc.sepolia.org)
- DEPLOYMENTS_NETWORK: deployments folder (defaults to sepolia)
- VITE_WC_PROJECT_ID: WalletConnect project id for reliable wallet connects

Seed on-chain demo data (Sepolia)
Run one of the scripts below with a funded Sepolia wallet:
1) Full loan + repay path:
   npx hardhat run scripts/e2e-sepolia.js --network sepolia

2) Just a vesting escrow (to use in Borrow flow):
   npx hardhat run scripts/seed-sepolia-vesting.js --network sepolia

MVP flows to verify
1) Wallet + network
   - Connect wallet
   - Switch to Sepolia (contracts are deployed there)

2) Portfolio
   - Activity list loads from backend (/api/activity)
   - Export activity CSV works
   - Positions populated from LoanManager

3) Borrow
   - Enter collateral ID + vesting contract
   - Escrow transaction confirms
   - Create loan transaction confirms

4) Repay
   - Repay schedule loads from backend
   - CSV export works

5) Dashboard (Spotlight)
   - Vested contracts and snapshots load from backend
   - Liquidity data pulls from GeckoTerminal when on mainnet/Base

Local hardhat option (advanced)
If you want local chain instead of Sepolia:
1) Run hardhat node and deploy:
   npx hardhat node --no-deploy
   npx hardhat deploy --network localhost --tags full

2) Seed sample data:
   npx hardhat run scripts/vestra-realistic-setup.js --network localhost

3) Export frontend env with local contract addresses:
   VITE_LOANMANAGER_ADDRESS
   VITE_VALUATIONENGINE_ADDRESS
   VITE_VESTINGADAPTER_ADDRESS
   VITE_USDC_ADDRESS
   VITE_MOCKPRICEFEED_ADDRESS

4) Start MVP with:
   DEPLOYMENTS_NETWORK=localhost RPC_URL=http://localhost:8545 ./scripts/run-mvp.sh
