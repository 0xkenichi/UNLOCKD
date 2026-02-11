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
- `REPAY_TOKENS` (comma-separated token addresses for repayment priority)
- `TURNSTILE_SECRET_KEY` (Cloudflare Turnstile secret for backend)
- `TURNSTILE_BYPASS` (set `true` for local/dev without captcha)
- `SESSION_TTL_MINUTES` (wallet session expiry, default: 60)
- `NONCE_TTL_MINUTES` (nonce expiry, default: 10)
- `JSON_BODY_LIMIT` (default: 200kb)
- `RATE_LIMIT_MAX` (default: 120/min)
- `RATE_LIMIT_STRICT_MAX` (default: 8/min)
- `RATE_LIMIT_CHAT_MAX` (default: 6/min)
- `CORS_ORIGINS` (comma-separated allowed origins)
- `TRUST_PROXY` (set `true` or proxy hop count when behind a proxy)
- `SOLANA_REPAY_ENABLED` (true to allow server-side sweeps)
- `SOLANA_REPAY_AUTHORITY_KEYPAIR` (path or JSON array)
- `SOLANA_REPAY_TREASURY` (receiver for swept tokens)
- `SOLANA_USDC_MINT` (USDC mint for the cluster)
- `SOLANA_REPAY_MINTS` (priority list of token mints)
- `SOLANA_REPAY_MODE` (`usdc-only`, `transfer`, or `swap`)
- `SOLANA_JUPITER_BASE_URL` (default: https://quote-api.jup.ag)
- `SOLANA_JUPITER_SLIPPAGE_BPS` (default: 50)

## Notes
- Testnets default to mocks if addresses are not provided.
- Capture deployed addresses for frontend wiring.
- After deployment, set the repayment priority list:
  - `node scripts/configure-repay-priority.js --network <network>`

## Backend persistence (Supabase)
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env` (see `backend/.env.example`).
- Optional: `SUPABASE_ANON_KEY` if the frontend ever calls Supabase directly.
- The backend will fall back to local SQLite if Supabase is not configured, but Supabase is recommended for shared state and durability.
- Apply schema: run `supabase db push --env-file backend/.env` (Supabase CLI) or paste `backend/migrations/0001_supabase.sql` into the Supabase SQL editor.

## Turnstile setup
- Create a Turnstile site in Cloudflare and set the **Site Key** in the frontend (`VITE_TURNSTILE_SITE_KEY`) and the **Secret Key** in the backend (`TURNSTILE_SECRET_KEY`).
- For local development without captcha, set `TURNSTILE_BYPASS=true`.