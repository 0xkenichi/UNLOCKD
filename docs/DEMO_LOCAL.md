# Local Demo (Hardhat Node)

End-to-end local demo with the sample vest (1h cliff, 3h total), mock USDC pool, and full borrow flow.

## Prerequisites

```bash
npm install
npm install --prefix backend
npm install --prefix frontend --legacy-peer-deps
```

## Quick Start

```bash
npm run demo:local
```

This will:
1. Start a Hardhat node (localhost:8545)
2. Deploy all contracts
3. Seed a sample vest and fund the lending pool (100k USDC)
4. Start backend (port 4000) and frontend (port 5173)

## Connect & Borrow

1. Open http://localhost:5173
2. Add the Localhost network to your wallet:
   - **Network name:** Localhost
   - **RPC URL:** http://127.0.0.1:8545
   - **Chain ID:** 31337
3. Connect your wallet and switch to Localhost
4. Go to **Borrow** and enter:
   - **Collateral ID** (printed after seed step)
   - **Vesting contract** (printed after seed step)
5. Click **Escrow** → **Borrow**

## Manual Steps (Alternative)

If you prefer to run steps separately, or if `demo:local` exits early:

```bash
# Terminal 1: Start node
npx hardhat node --no-deploy

# Terminal 2: Deploy + seed
npx hardhat deploy --network localhost --tags full
npx hardhat run scripts/seed-sample-vest.js --network localhost

# Terminal 2: Start backend + frontend (use dev:local to point at localhost)
npm run dev:local
```

## Sample Vest Details

- **Cliff:** 1 hour
- **Total duration:** 3 hours
- **Token:** MockVestraToken (VEST)
- **Allocation:** 10,000 VEST
- **Pool liquidity:** 100,000 mock USDC

## Troubleshooting

- **"Cannot connect to network"** – Ensure the Hardhat node is running before deploy/seed
- **"Missing deployments"** – Run deploy before seed: `npx hardhat deploy --network localhost --tags full`
- **"Contract calls fail"** – Confirm your wallet is on Localhost (chain 31337)
- **Backend Alchemy 429 / indexer errors** – If running manually (not via `demo:local`), use `npm run dev:local` so the backend points at localhost. For Sepolia, set `INDEXER_ENABLED=false` in `.env` to silence indexer.
- **Solana streamflow fetch failed** – Harmless for local demo; Solana vesting is only needed for mainnet.
