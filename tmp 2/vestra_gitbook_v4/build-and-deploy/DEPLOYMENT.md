# Deployment Guide: Internal & Testnet

Procedures for deploying the Vestra stack.

## Environment Setup
Required `.env` variables for deployment:
- `PRIVATE_KEY`: Deployment multi-sig key.
- `ETHERSCAN_API_KEY`: For contract verification.
- `VALUATION_ENGINE_ADDRESS`: If using an existing instance.

## Deploying to Sepolia
1.  **Contracts**: `npx hardhat run scripts/deploy_all.js --network sepolia`
2.  **Verification**: `npx hardhat verify --network sepolia <ADDRESS>`
3.  **Backend Initialization**: `node packages/backend/seedSepolia.js`

## Deploying the Relayer (Omega AI)
The Relayer is a Node.js service requiring access to:
- A private RPC endpoint for Sepolia.
- An AWS KMS or managed vault for the Relayer Private Key (for stealth address derivation).
- A Redis instance for price history caching.

> [!TIP]
> Use the `check_relayer.js` script to verify health after any major update.
