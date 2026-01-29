# Deployment Guide

## Local
1. `npm install`
2. `npx hardhat deploy --network hardhat --tags full`

## Sepolia
1. Set `PRIVATE_KEY` and `ALCHEMY_SEPOLIA_URL` (or use default RPC).
2. Deploy:
   - `npx hardhat deploy --network sepolia --tags full`
3. Run interaction script:
   - `node scripts/interact-sepolia.js --network sepolia`

## Base Sepolia
1. Ensure wallet has Base Sepolia ETH.
2. Deploy:
   - `npx hardhat deploy --network baseSepolia --tags full`

## Environment Variables
- `PRIVATE_KEY` (deployer)
- `ALCHEMY_SEPOLIA_URL` (optional)
- `USDC_ADDRESS` (optional)
- `PRICE_FEED_ADDRESS` (optional)
- `UNISWAP_ROUTER_ADDRESS` (optional)
- `UNISWAP_POOL_FEE` (default: 3000)
- `LIQUIDATION_SLIPPAGE_BPS` (default: 9000)

## Notes
- Testnets default to mocks if addresses are not provided.
- Capture deployed addresses for frontend wiring.
