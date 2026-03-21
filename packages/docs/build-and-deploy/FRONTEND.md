# Frontend Notes

This document outlines the minimal frontend requirements to demo the MVP.

## Core Views
- Borrow simulator (PV + LTV).
- Create loan (escrow + borrow).
- Repay loan (partial/full).
- Settlement status (active/settled/default).

## Wallet Integrations
- RainbowKit for connect/disconnect.
- Wagmi hooks for read/write.

## Suggested Reads/Writes
- Read: `computeDPV`, `loans`, `identityLinked`.
- Write: `createLoan`, `repayLoan`, `settleAtUnlock`.

## Frontend Deployment & Integration Guide

## Tech Stack
- Next.js 14+ (App Router)
- Wagmi v2 / Viem / RainbowKit
- TanStack Query
- Tailwind CSS

## Multi-Chain Architecture
Vestra v2 uses a "Sovereign Command Center" model, detecting assets across all supported nodes (Sepolia, Base Sepolia, Solana Devnet).

### Core Hooks
#### `useMultiChainBalances`
Centralized hook to fetch USDC balances across all EVM nodes. Used to resolve zero-balance issues on Supply/Lend pages.
```ts
const { balances, isLoading } = useMultiChainBalances();
const sepoliaBalance = balances.get(11155111)?.formattedUsdc;
```

#### `useMultiChainPortfolio`
Primary asset discovery hook. Uses Zerion API to scan for tokens, NFTs, and DeFi positions.
- **Liquid**: Standard ERC-20 and native assets.
- **Illiquid**: Locked/Vesting positions (Sablier, Vestra Wrappers).

## Zerion API Setup
To enable instant asset detection, you must provide a Zerion API Key.
1. Obtain a free key at [Zerion Developer Portal](https://developers.zerion.io/).
2. Add to `.env.local`:
   `NEXT_PUBLIC_ZERION_API_KEY=your_api_key_here`

## Vercel Deployment
Ensure all `NEXT_PUBLIC_` variables are mirrored in the Vercel Dashboard.
- `NEXT_PUBLIC_WC_PROJECT_ID`
- `NEXT_PUBLIC_ZERION_API_KEY`
- `NEXT_PUBLIC_API_URL` (Backend endpoint)

## Post-Install Resolution (Frontend Stabilization)
To resolve `WalletConnect` dependency evaluation failures in Next.js 16.1.6 (Turbopack), ensure `@walletconnect/ethereum-provider` is installed:
```bash
cd frontend-v2 && npm install @walletconnect/ethereum-provider --legacy-peer-deps
```
This enables proper workspace root inference and hoisting, resolving module load errors for `getDefaultConfig`.

## UX Hints
- Display borrow limit and worst-case PV.
- Show unlock time countdown.
- Surface repayment progress and remaining debt.
