# UNLOCKD (Vestra Protocol)

UNLOCKD is a DeFi credit primitive for borrowing against locked or vesting token claims.
It enables non-custodial loans on assets that are valuable but not yet transferable.

## Why It Matters

- Activates otherwise idle locked/vested token value.
- Preserves vesting alignment while improving borrower liquidity.
- Uses deterministic risk controls (DPV/LTV) and enforcement at unlock.

## Core Components

- `contracts/`: Solidity protocol contracts (valuation, lending, loan management, adapters, auctions).
- `backend/`: API, indexing, persistence, matching/underwriting helpers.
- `frontend/`: React/Vite application with wallet integrations.
- `docs/`: whitepaper, technical specs, deployment, security, and roadmap.
- `scripts/`: local demo, seeding, setup, and e2e helper scripts.

## Quick Start

1. Install dependencies:
   - `npm ci`
   - `npm ci --prefix backend`
   - `npm ci --prefix frontend`
2. Run local demo:
   - `npm run demo:local`
3. Or run dev stack:
   - `npm run dev`

## Testing

- Contracts: `npm test`
- Local e2e helper scripts:
  - `npm run test:e2e`
  - `npm run test:e2e:default`
- Frontend Playwright:
  - `npm run test:e2e --prefix frontend`

## Docs Map

Start with `docs/README.md` for the full documentation index, then:

- `docs/OVERVIEW.md`
- `docs/LITEPAPER.md`
- `docs/WHITEPAPER.md`
- `docs/ARCHITECTURE.md`
- `docs/DEPLOYMENT.md`
- `docs/SECURITY.md`
- `docs/CRDT.md`

## Current Stage

The protocol is in pre-mainnet validation with active testnet workflows.
Security hardening and audit preparation are tracked in `docs/SECURITY.md`.
