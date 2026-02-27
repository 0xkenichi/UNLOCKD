# Vestra Testnet Readiness

This checklist is for staging Vestra for public testnet usage and scaling from ~1,000 to 100,000 concurrent active users.

## Capacity Targets

- **Tier 1 (1k active):** 99th percentile API latency < 1200ms for read endpoints, < 2% error rate.
- **Tier 2 (10k active):** horizontal backend replicas with shared persistence (Supabase/Postgres), strict per-route rate limits.
- **Tier 3 (100k active):** API gateway + edge caching + queue-based async jobs + dedicated RPC tier.

## Backend Requirements

- Run with Supabase enabled (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
- Keep indexer enabled with bounded memory caches.
- Enforce `TRUST_PROXY=true` behind your ingress.
- Set route limits:
  - `RATE_LIMIT_MAX`
  - `RATE_LIMIT_STRICT_MAX`
  - `RATE_LIMIT_CHAT_MAX`
  - `RATE_LIMIT_EXPENSIVE_MAX`
- Tune performance knobs:
  - `REPAY_CACHE_TTL_MS`
  - `VESTED_CACHE_TTL_MS`
  - `RPC_CONCURRENCY_LIMIT`
  - `BLOCK_CACHE_MAX_ITEMS`
  - `GEO_CACHE_MAX_ITEMS`

## Frontend Requirements

- Use production build (`npm run build --prefix frontend`) and CDN hosting.
- Set `VITE_BACKEND_URL` to the load-balanced API origin.
- Keep polling low-frequency and visibility-aware (already implemented for key heavy views).
- Configure client timeout/retry:
  - `VITE_API_TIMEOUT_MS`
  - `VITE_API_GET_RETRIES`

## Load Test Gates

Run baseline:

`npm run test:load`

Run stronger profile (example):

`LOAD_SCALE=4 LOAD_DURATION=20 LOAD_ENFORCE=true npm run test:load`

Minimum pass criteria before opening testnet:

- No profile exceeds configured max error rate.
- `health`, `activity`, `geo-pings` pass RPS and p99 thresholds.
- `vested-contracts`, `repay-schedule` pass p99 thresholds under scaled load.

## Launch-Day Operations

- Enable central logs and alerts for:
  - API 5xx rate
  - latency p95/p99
  - RPC 429 / timeout spikes
  - DB error rate
- Keep a rollback plan:
  - frontend deploy rollback
  - backend image rollback
  - emergency rate-limit tightening
- Prepare incident runbook with owners and response SLAs.
