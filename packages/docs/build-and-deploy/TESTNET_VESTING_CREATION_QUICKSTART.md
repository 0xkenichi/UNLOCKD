# Testnet Vesting Creation Quickstart

Use this guide when demo users do not already have a vesting contract and need a testnet position to borrow against.

## Purpose

Create a test vesting contract on testnet, then use it in Vestra Borrow flow.

## Networks

- Preferred: Base Sepolia
- Alternative: Sepolia

## Prerequisites

- Testnet wallet with ETH for gas
- Project dependencies installed
- Access to deploy scripts

## Fast Path (Scripted)

1. Configure env for target testnet.
2. Deploy protocol contracts on target testnet.
3. Run vesting seed script for a sample vesting wallet.
4. Copy output:
   - vesting contract address
   - collateral ID (if generated)
   - token details and unlock time
5. Open Vestra Borrow page and paste values.

## Example Commands

```bash
# Deploy protocol contracts (example)
npx hardhat deploy --network baseSepolia --tags full

# Seed a sample vesting contract (example script used in repo)
npx hardhat run scripts/seed-sepolia-vesting.js --network sepolia
```

If your team standardizes on Base Sepolia only, update scripts to target `baseSepolia` and keep one blessed path.

## Manual Path (No Seed Script)

1. Deploy a mock project token on testnet.
2. Deploy vesting wallet contract with:
   - beneficiary (demo wallet)
   - token address
   - start and duration
3. Transfer test tokens into vesting wallet.
4. Verify vesting reads:
   - token
   - total allocation
   - start
   - duration
5. Use this vesting contract in Vestra Borrow flow.

## Demo Defaults (Recommended)

- Duration: 1-7 days for quick demos
- Allocation: moderate amount (avoid huge unrealistic values)
- Unlock profile: simple linear vesting

## Validation Checklist

- wallet on correct testnet
- vesting contract address valid
- contract readable by Vestra backend
- token + unlock time detected in Borrow view
- Borrow action enabled after terms and funding checks

## Troubleshooting

- Contract unreadable: wrong network or wrong vesting ABI
- Borrow disabled: missing gas, missing agreement checkbox, invalid collateral ID, unsupported network
- Valuation unavailable: switch to supported testnet in app

## Team Recommendation

Build a small "Create Demo Vesting" helper in-app (testnet only) to remove script dependency for external testers.

