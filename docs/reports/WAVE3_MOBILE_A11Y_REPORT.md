# Wave 3 Mobile + A11y Report

Date: 2026-02-13

Scope:

- `Borrow`
- `Repay`
- `Lender`
- `Portfolio`

## What was improved

- Added explicit testnet/maturity context chips on:
  - `Portfolio`
  - `Lender`
- Improved mobile table readability using `data-label` and responsive pseudo-label rendering:
  - `Portfolio` positions and recent activity rows
  - `Lender` pool list rows
- Added accessibility labels for filtering controls:
  - Portfolio search input
  - Portfolio sort dropdown
- Added live-region semantics to lender action logs:
  - `role="log"` with `aria-live="polite"` and `aria-relevant="additions"`

## Browser validation

- Mobile viewport test run at `390x844`.
- Verified:
  - `Repay` slider has explicit accessible name: "Repay percentage simulator".
  - Demo Access button route to docs deep-link works (`/docs?doc=testnet-faucet`).
  - Lender page shows new testnet/advisory chips.

## Remaining gaps (next pass)

- Some route snapshots can briefly show loading-only state before full hydration in mobile checks.
- Tables with no data cannot be visually validated for mobile labels without seed data.
- Full keyboard traversal matrix and contrast audits still recommended before mainnet readiness sign-off.

