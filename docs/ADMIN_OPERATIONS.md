# Admin Operations

This document defines protected backend endpoints used for operational debugging.

## Access Control

- All admin debug routes require a valid wallet session (`Authorization: Bearer <sessionToken>`).
- A request is authorized only if one of these conditions is true:
  - Session user role is `admin`.
  - Session wallet is listed in `ADMIN_WALLETS`.
  - Request includes `x-admin-key` matching `ADMIN_API_KEY`.
- Recommended production setup:
  - Use wallet sessions plus `ADMIN_WALLETS` allowlist.
  - Keep `ADMIN_API_KEY` as a break-glass fallback.
  - Restrict access behind private network/proxy rules.

## Endpoints

- `GET /api/admin/debug/identity/:walletAddress`
  - Returns persisted identity profile + attestations and computed score output.
- `PATCH /api/admin/debug/identity/:walletAddress/profile`
  - Updates persisted identity profile fields (`linkedAt`, `identityProofHash`, `sanctionsPass`).
- `GET /api/admin/debug/kpi?windowHours=24`
  - Returns KPI bundle with persistence source for verification.
- `GET /api/admin/audit-logs?limit=100&action=admin.identity.profile.patch`
  - Returns immutable admin action logs for operations review and incident forensics.

## Audit Trail

- Every admin debug endpoint writes an audit record to `admin_audit_logs`.
- Records include actor identity (`user_id`, wallet, role), target object, IP hash, session fingerprint, payload delta, and timestamp.
- Supabase migration: `backend/migrations/0004_admin_audit_logs.sql`.

## Security Notes

- Admin routes are additionally rate-limited via `RATE_LIMIT_ADMIN_MAX`.
- Do not expose admin endpoints directly to public internet without WAF/IP controls.
- Rotate `ADMIN_API_KEY` on operator changes or any suspected exposure.
