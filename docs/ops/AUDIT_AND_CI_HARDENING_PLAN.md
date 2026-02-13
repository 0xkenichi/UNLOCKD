# Audit and CI Hardening Plan

Last updated: 2026-02-13
Owner: Founder office

This document links security diligence execution to CI quality gates.

## Objectives

- Start external smart contract audit process.
- Enforce linting and frontend E2E smoke checks in CI.
- Raise confidence for partner and investor diligence.

## External Audit Workstream

1. Scope definition
- Contracts in scope:
  - `contracts/LoanManager.sol`
  - `contracts/LendingPool.sol`
  - `contracts/VestingAdapter.sol`
  - `contracts/ValuationEngine.sol`
  - wrapper and auction contracts as phase-2 scope

2. Vendor process
- Prepare 3-auditor shortlist.
- Send same scope pack to all vendors.
- Compare on depth, timeline, and re-test policy.
- Use RFP template:
  - `docs/ops/AUDIT_VENDOR_RFP_TEMPLATE.md`

3. Deliverables
- Signed statement of work
- Findings report
- Remediation tracker and closeout evidence

## CI Hardening Controls

- Add repository lint gate (`npm run lint`).
- Add frontend Playwright smoke gate in CI.
- Keep contract test and coverage gates active.

## Coverage Progression Policy

Current gate is intentionally conservative for velocity.
Raise thresholds in staged increments:
- Stage A: keep existing floor while fixing blind spots
- Stage B: increase statements/functions/lines to 40
- Stage C: increase branch to 25 and all others to 50+

Do not raise thresholds unless flakiness is controlled.

## Definition of Done

- Lint gate runs on pull requests and main pushes.
- Frontend smoke E2E runs on pull requests and main pushes.
- Audit vendor selected and kickoff packet assembled.
- No open critical security issues without owner/date.
