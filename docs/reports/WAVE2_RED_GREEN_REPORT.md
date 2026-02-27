# Wave 2 Red/Green Report

Date: 2026-02-13

## Green (Passed)

- Frontend production build: `npm run build:prod --prefix frontend` passed.
- Protocol e2e default: `npm run test:e2e:default` passed.
- Protocol e2e local: `npm run test:e2e` passed.
- Docs deep-linking validated in browser:
  - `/docs?doc=testnet-faucet`
  - `/docs?doc=vesting-quickstart`
- Lints on edited frontend/docs files: no errors.

## Red / Follow-Up Required

- Build output still reports dependency-level warnings:
  - Rollup pure-annotation warning in `ox` dependency variants.
  - Vite browser externalization warning for `vm` via `asn1.js`.
  - Circular chunk warnings in vendor chunk strategy.
  - `eval` warning in `@human.tech/passport-embed`.
- These warnings did not fail build but should be tracked before mainnet launch hardening.

## Fixed During Wave 2

- Repay simulator now explicitly marked demo-only and tracked in analytics.
- Added in-app `Demo Access` card for faucet + vesting quickstart guidance.
- Added explicit testnet/maturity badges on Borrow, Repay, and Identity pages.
- Added repay funnel events: start, approve-start, simulation-error, submit-error, blocked.
- Added endpoint auth matrix docs and updated admin operations docs.
- Fixed stale-oracle e2e failures by refreshing mock oracle after time travel in:
  - `scripts/e2e-local.js`
  - `scripts/e2e-default-local.js`

