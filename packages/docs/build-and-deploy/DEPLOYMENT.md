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
2. Check env:
   - `npm run check:deploy:baseSepolia`
3. Deploy:
   - `npx hardhat deploy --network baseSepolia --tags full`
4. Sync addresses into frontend defaults:
   - `npm run sync:contracts:baseSepolia`

## Base Mainnet
1. Ensure wallet has Base ETH.
2. Check env:
   - `npm run check:deploy:base`
3. Deploy:
   - `npx hardhat deploy --network base --tags full`
4. Capture addresses from `deployments/base/*` and wire:
   - Backend: `RPC_URL` + `DEPLOYMENTS_NETWORK=base`
   - Frontend: set `VITE_*_ADDRESS_8453` overrides (optional) or update `frontend/src/utils/contracts.js`.
5. Sync addresses into frontend defaults (optional):
   - `npm run sync:contracts:base`

## Fast command sequence
- Base Sepolia: `npm run check:deploy:baseSepolia && npm run deploy:baseSepolia:sync`
- Base Mainnet: `npm run check:deploy:base && npm run deploy:base:sync`

## Flow EVM Testnet
1. Ensure wallet has Flow testnet FLOW (gas) on Flow EVM Testnet.
2. Deploy:
   - `npx hardhat deploy --network flowEvmTestnet --tags full`
3. Sync addresses into frontend defaults:
   - `npm run sync:contracts:flowEvmTestnet`
4. Point backend at Flow EVM Testnet:
   - `RPC_URL=$FLOW_EVM_TESTNET_RPC DEPLOYMENTS_NETWORK=flowEvmTestnet EXPLORER_BASE_URL=https://evm-testnet.flowscan.io`

## Flow EVM Mainnet
1. Ensure wallet has FLOW (gas) on Flow EVM Mainnet.
2. Deploy:
   - `npx hardhat deploy --network flowEvm --tags full`
3. Capture addresses from `deployments/flowEvm/*` and wire:
   - Backend: `RPC_URL=$FLOW_EVM_MAINNET_RPC DEPLOYMENTS_NETWORK=flowEvm EXPLORER_BASE_URL=https://evm.flowscan.io`
   - Frontend: set `VITE_*_ADDRESS_747` overrides (optional) or update `frontend/src/utils/contracts.js`.
4. Sync addresses into frontend defaults (optional):
   - `npm run sync:contracts:flowEvm`

## Environment Variables
- `PRIVATE_KEY` (deployer)
- `ALCHEMY_SEPOLIA_URL` (optional)
- `FLOW_EVM_TESTNET_RPC` (optional; default: https://testnet.evm.nodes.onflow.org)
- `FLOW_EVM_MAINNET_RPC` (optional; default: https://mainnet.evm.nodes.onflow.org)
- `FLOWSCAN_API_KEY` (optional; only needed for contract verification)
- `USDC_ADDRESS` (optional)
- `PRICE_FEED_ADDRESS` (optional)
- `UNISWAP_ROUTER_ADDRESS` (optional)
- `UNISWAP_POOL_FEE` (default: 3000)
- `LIQUIDATION_SLIPPAGE_BPS` (default: 9000)
- `TERM_VAULT_MIN_APY_BPS` (default: 800; min APY for fixed-term tranches)
- `TERM_VAULT_EARLY_EXIT_FEE_BPS` (default: 100; early exit fee for fixed-term tranches)
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
- `EVM_KEEPER_ENABLED` (true to auto-call `settleAtUnlock` for unlocked loans)
- `EVM_KEEPER_PRIVATE_KEY` (EVM signer key used by the keeper; keep funded for gas)
- `EVM_KEEPER_INTERVAL_MS` (keeper tick interval; default 60000)
- `EVM_KEEPER_MAX_TX_PER_TICK` (throttle; default 4)
- `EVM_KEEPER_RECENT_SCAN` (scan last N loans each tick; default 200)
- `EVM_KEEPER_ROTATING_SCAN` (scan an additional rotating window each tick; default 200)
- `EVM_REPAY_KEEPER_ENABLED` (true to attempt auto-repayments for opted-in borrowers)
- `EVM_REPAY_KEEPER_INTERVAL_MS` (repay keeper tick interval; default 60000)
- `EVM_REPAY_KEEPER_MAX_TX_PER_TICK` (throttle; default 2)
- `EVM_REPAY_KEEPER_LOOKAHEAD_SECONDS` (only try repay when unlock is within this window; default 3 days)
- `EVM_REPAY_KEEPER_MAX_TOKENS_PER_LOAN` (max tokens to include per repayment attempt; default 5)
- `SOLANA_REPAY_JOBS_ENABLED` (true to process queued Solana sweep jobs)
- `SOLANA_REPAY_JOBS_INTERVAL_MS` (job worker tick interval; default 30000)
- `SOLANA_REPAY_JOBS_MAX_PER_TICK` (throttle; default 4)

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

## Frontend (Vercel)
- **Root Directory:** In the Vercel project settings, set **Root Directory** to `frontend` so the build uses `frontend/package.json` and `frontend/vercel.json`. If the root is the repo root, the deploy may serve the wrong output or fail.
- **Build:** Uses `npm run build` and `outputDirectory: dist`. The build needs enough memory; the repo uses `NODE_OPTIONS=--max-old-space-size=8192` in `package.json` scripts (Vercel usually has enough).
- **CSP:** `frontend/vercel.json` sets a Content-Security-Policy. It includes `'unsafe-inline'` and `'unsafe-eval'` for `script-src` so RainbowKit/WalletConnect can run; without these, the app can render a black screen in production.
- **Env (optional):** `VITE_WC_PROJECT_ID`, `VITE_ALCHEMY_ACCOUNT_KIT_API_KEY`, `VITE_ALCHEMY_ACCOUNT_KIT_POLICY_ID`, `VITE_ALCHEMY_ACCOUNT_KIT_CHAIN` as needed.

## Turnstile setup
- Create a Turnstile site in Cloudflare and set the **Site Key** in the frontend (`VITE_TURNSTILE_SITE_KEY`) and the **Secret Key** in the backend (`TURNSTILE_SECRET_KEY`).
- For local development without captcha, set `TURNSTILE_BYPASS=true`.