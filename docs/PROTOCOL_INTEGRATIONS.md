# Protocol Integrations – Rollout and Operations

This document covers monitoring, feature flags, and operational playbook for vesting (e.g. Sablier) and fundraising (e.g. Juicebox) integrations.

## Monitoring and indexing

### Vesting sources

- **Table:** `vesting_sources` (backend persistence).
- **Fields:** `chain_id`, `vesting_contract`, `protocol` (`manual` | `sablier`), `lockup_address`, `stream_id`, `created_at`.
- **Use:** Join with loan/collateral data to report volume or risk by protocol. Optional server validation endpoint: `POST /api/vesting/validate` stores a row when `protocol=sablier` and lockup/streamId are provided.

### Fundraising sources

- **Table:** `fundraising_sources` (backend persistence).
- **Fields:** `project_id`, `token`, `treasury`, `chain`, `vesting_policy_ref`, `created_at`, `updated_at`.
- **Use:** Track which projects are linked for vesting/borrow pipeline; filter or aggregate by `chain` or `project_id`.

### Indexer / activity

- Existing indexer events (e.g. `LoanCreated`) do not currently include a protocol/source identifier. To segment by integration, correlate by `vestingContract` with `vesting_sources.vesting_contract` (same chain).

## Feature flags

Controlled via environment (frontend):

| Env var | Default | Effect |
|--------|--------|--------|
| `VITE_FEATURE_SABLIER_IMPORT` | enabled | When `false` or `0`, hide “Import from Sablier v2” in Borrow. |
| `VITE_FEATURE_FUNDRAISE_ONBOARD` | enabled | When `false` or `0`, hide `/fundraise` route (fundraising project onboarding). |

- **Backend:** No feature flags; endpoints are always available. Restrict by auth or rate limits if needed.

## Rollout by chain / protocol

1. **Sablier:** Enable per chain by deploying and configuring `SablierV2OperatorWrapper` (and optional VestingAdapter whitelist) on that chain. Frontend “Import from Sablier v2” is global; support is effectively per-chain by contract availability.
2. **Fundraising:** `POST /api/fundraising/link` accepts any `chain` string; list/filter by `chain` for progressive rollout (e.g. enable UI for `base` first).
3. **VestingAdapter whitelist:** Set `useWhitelist = true` and `setAllowedVestingContract(wrapper, true)` per allowed wrapper to restrict escrow to known contracts.

## Incident and operations playbook

### Disable Sablier import in the UI

- Set `VITE_FEATURE_SABLIER_IMPORT=false` in the frontend build/env and redeploy. Existing escrowed positions are unaffected; only the import UI is hidden.

### Disable fundraising onboarding

- Set `VITE_FEATURE_FUNDRAISE_ONBOARD=false` and redeploy. Existing linked projects remain in the DB; only the `/fundraise` route is hidden.

### VestingAdapter: block a specific wrapper

- Call `setAllowedVestingContract(wrapperAddress, false)` (when using whitelist) or stop adding the wrapper to the whitelist. New escrows using that wrapper will fail with “vesting not allowed”.

### VestingAdapter: pause all new escrows

- No built-in pause on VestingAdapter. To stop new loans that depend on escrow, pause the LoanManager (if it has a pause mechanism) or halt frontend flows.

### Data and support

- **vesting_sources / fundraising_sources:** Stored in backend DB (Supabase or SQLite). Back up per existing backup policy.
- **Validation errors:** `POST /api/vesting/validate` returns 400 with `valid: false` and `error` message; log these for debugging misconfigured contracts.

## Security and compliance

- Validation endpoint is unauthenticated; it only reads on-chain state. Rate-limit if needed.
- Fundraising link/update endpoints do not require auth in the current implementation; add auth or rate limits for production if projects are sensitive.
