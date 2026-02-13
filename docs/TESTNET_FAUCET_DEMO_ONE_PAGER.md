# Vestra Testnet Demo One-Pager

This guide is for external testers, partners, and investors who want to demo Vestra on testnet.

## Goal

Get a wallet funded on testnet, connect to Vestra, and run through Borrow/Repay safely with no real funds.

## Supported Demo Networks (Recommended)

- Base Sepolia (preferred for product demo)
- Sepolia (fallback for contract-level testing)

## What You Need

- A wallet (MetaMask or other EVM wallet)
- Testnet ETH for gas
- Optional test USDC for repayment testing
- Vestra frontend URL and backend URL from the team

## Step 1: Add Base Sepolia

Most wallets can add this from chain list automatically.  
Manual fields if needed:

- Network: Base Sepolia
- Chain ID: `84532`
- Currency: `ETH`

## Step 2: Get Test ETH (Gas)

Use any trusted faucet your team provides in onboarding.

Typical flow:
- connect wallet
- request Base Sepolia ETH
- wait for confirmation

If Base Sepolia faucet is rate-limited:
- request Sepolia ETH as backup
- bridge test assets to Base Sepolia (if required by your flow)

## Step 3: Get Test USDC (Optional but Recommended)

For repay demos, you need test USDC in the same wallet.

Options:
- use the in-app faucet/support card if enabled
- request from team-provided test token faucet
- ask team for a seeded test wallet transfer

## Step 4: Open Vestra and Connect Wallet

- Open the Vestra app URL
- Click `Connect`
- Ensure wallet network is Base Sepolia

## Step 5: Demo Borrow Flow

- Go to `Borrow`
- Use provided demo collateral details (or detected position)
- Review valuation and max borrow
- Create a loan transaction
- Confirm transaction on explorer

## Step 6: Demo Portfolio -> Repay

- Go to `Portfolio`
- Select active position and click `Repay`
- Approve USDC
- Submit repay transaction
- Confirm transaction on explorer

## Troubleshooting

- Wrong network: switch wallet to Base Sepolia
- No gas: request more test ETH
- No USDC: use faucet or request test transfer from team
- Transaction rejected: check wallet is the borrower wallet and allowance is approved
- Loan inactive: verify loan ID and correct chain

## Demo Safety

- Testnet only
- No real funds
- No financial advice

## Suggested Team Add-Ons

For smoother external demos, provide:

- a single `Demo Access` page with direct faucet links
- one click copy for contract addresses
- a pre-seeded sample vesting contract list
- a short video walkthrough (2-3 mins)

