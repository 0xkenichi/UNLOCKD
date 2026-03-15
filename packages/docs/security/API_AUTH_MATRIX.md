# API Auth Matrix (Testnet Current State)

This matrix documents the intended and current authentication requirements by endpoint class.

## Legend

- `Public`: no session required
- `Session`: valid wallet session required
- `Admin`: wallet session + admin authorization required

## Public Endpoints

- `GET /api/health`
- `GET /api/identity/:walletAddress`
- `POST /api/vesting/validate`
- `POST /api/agent/chat` (Turnstile-protected + rate-limited)
- `GET /api/pools`
- `GET /api/pools/browse`
- `POST /api/match/quote`
- `POST /api/match/accept`
- `POST /api/analytics`
- `GET /api/activity`
- `GET /api/vested-contracts`
- `GET /api/vested-snapshots`
- `GET /api/solana/unmapped-mints`
- `GET /api/solana/repay-config`
- `GET /api/repay-schedule`
- `GET /api/kpi/dashboard`
- `GET /api/analytics/summary`
- `GET /api/analytics/benchmark`
- `GET /api/agent/replay`
- export endpoints (`/api/exports/*`) subject to route limits

## Session-Protected Endpoints

- `POST /api/auth/nonce`
- `POST /api/auth/verify`
- `POST /api/write`
- `POST /api/docs/open`
- fundraising endpoints:
  - `POST /api/fundraising/link`
  - `GET /api/fundraising/sources`
  - `GET /api/fundraising/sources/:id`
  - `PATCH /api/fundraising/sources/:id`
- pool management:
  - `POST /api/pools`
  - `POST /api/pools/:id/preferences`
- identity passport seed endpoint:
  - `GET /api/identity/passport-score/:walletAddress` (session + wallet owner guard)

## Admin-Protected Endpoints

- `GET /api/admin/debug/identity/:walletAddress`
- `PATCH /api/admin/debug/identity/:walletAddress/profile`
- `GET /api/admin/debug/kpi`
- `GET /api/admin/audit-logs`
- Solana repay operations:
  - `POST /api/solana/repay-plan` (session + admin)
  - `POST /api/solana/repay-sweep` (session + admin)

## Notes

- Admin authorization accepts:
  - session role `admin`, or
  - wallet in `ADMIN_WALLETS`, or
  - `x-admin-key` matching `ADMIN_API_KEY` (break-glass)
- Keep admin routes behind additional network controls in production.
- This matrix should be updated whenever endpoint middleware changes.

