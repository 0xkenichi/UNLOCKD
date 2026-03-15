# Building on Vestra Protocol (`@vestra/sdk`)

Welcome to the Vestra Protocol Builder SDK. Vestra is a composable liquidity engine for token vesting streams. By integrating `@vestra/sdk`, you can build applications that allow your users to borrow against their unvested allocations directly within your own UI.

## Installation

```bash
npm install @vestra/sdk
```

## Quick Start

You will need an `ethers.js` Signer (to write transactions) or Provider (for read-only operations).

```javascript
const { ethers } = require('ethers');
const { VestraClient } = require('@vestra/sdk');

// Initialize Provider and Signer
const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL');
const signer = new ethers.Wallet('YOUR_PRIVATE_KEY', provider);

// Initialize Vestra Client
// Note: builderFeeAddress is where your application will collect referral fees.
const vestra = new VestraClient({
  providerOrSigner: signer,
  lendingPoolAddress: '0x...', // Contract Address from testnet/mainnet
  loanManagerAddress: '0x...', // Contract Address from testnet/mainnet
  builderFeeAddress: '0xYourAppTreasuryAddress',
  builderFeeBps: 15 // 0.15% origination fee routed to your app
});
```

## Features

### 1. View Protocol Liquidity
```javascript
// (Future implementations can hook into LendingPool reserves)
```

### 2. Supply Stablecoins
Allow your users to supply capital to Vestra's lending pools to earn yield.
```javascript
const tx = await vestra.supply("0xUSDC_ADDRESS", ethers.parseUnits("1000", 6));
await tx.wait();
```

### 3. Originate a Loan
Use a verified Vested Stream as collateral to take out a loan.
```javascript
const collateralStreamId = "123";
const loanAmount = ethers.parseUnits("500", 6);
const duration = 60 * 60 * 24 * 30; // 30 days

const tx = await vestra.createLoan(collateralStreamId, loanAmount, duration);
const receipt = await tx.wait();
console.log("Loan Created!", receipt);
```

### 4. Fetch Active Loans Count
```javascript
const count = await vestra.getLoanCount();
console.log(`Total loans originated via Vestra: ${count}`);
```

## Builder Revenue
The true power of integrating `@vestra/sdk` is the economic layer. Whenever a loan is originated through your integration calling `createLoan`, the Vestra Protocol checks the `builderFeeBps` configuration. The associated protocol origination fee is split directly with the `builderFeeAddress`. You earn yield simply by providing a frontend interface to the protocol logic.
