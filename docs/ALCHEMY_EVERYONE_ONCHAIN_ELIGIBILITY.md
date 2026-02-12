# Alchemy Everyone Onchain Fund - Eligibility Proof

This branch adds a lender onboarding path designed for the `Everyone Onchain Fund` criteria:

- Smart wallet-first lender onboarding intent
- USD -> USDC funding path for new lenders
- Direct liquidity deployment into lending pools
- Instrumentation for pilot onboarding evidence

## What is implemented in this branch

- New `Lender Smart Wallet Onboarding` card on the lender page.
- Pilot intent submission through `/api/contact` with context:
  - `alchemy_everyone_onchain_fund_lender_smart_wallet`
- Checklist UX that captures:
  - Account Kit config readiness
  - wallet connection status
  - starter capital target
- Guided continuation into funding + onchain deposit flow.

## Why this helps eligibility

Alchemy's app track emphasizes smart wallets and seamless onboarding. This implementation demonstrates:

1. Web2 lender onboarding intent and user flow.
2. Fiat funding path into onchain activity.
3. Direct liquidity participation in protocol pools.
4. Internal telemetry and lead capture for measurable rollout.

Reference: https://www.alchemy.com/blog/everyone-onchain-fund

## Final step to fully complete smart wallet integration

The machine hit `ENOSPC` while installing Account Kit SDK dependencies. After freeing disk space, run:

```bash
cd frontend
npm install @account-kit/react @account-kit/infra --no-audit --no-fund
```

Then wire Account Kit provider + auth in `frontend/src/main.jsx` and wallet UI components.

Environment variables are prepared in `frontend/.env.example`:

- `VITE_ALCHEMY_ACCOUNT_KIT_APP_ID`
- `VITE_ALCHEMY_ACCOUNT_KIT_POLICY_ID`
- `VITE_ALCHEMY_ACCOUNT_KIT_API_KEY`
