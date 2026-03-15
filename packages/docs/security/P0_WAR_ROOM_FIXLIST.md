# Vestra P0 War Room Fixlist

This is the immediate execution plan to move Vestra from fragile demo state to credible pilot state.

## Objectives (Next 14 Days)

- Remove critical security exposure.
- Stabilize live UX/runtime behavior.
- Fix deploy/runtime inconsistencies.
- Prepare pilot-safe release messaging.

## P0 (Do First, 24-72 Hours)

### 1) Lock down Solana repay sweep endpoint

- **Severity:** Critical
- **File:** `backend/server.js`
- **Current issue:** `POST /api/solana/repay-sweep` is unauthenticated.
- **Action:**
  - Add `requireSession` middleware.
  - Enforce `req.user.walletAddress === owner` check (or admin-only fallback).
  - Add strict request schema validation for owner/maxUsdc.
  - Add audit logging for every sweep attempt.
- **Acceptance criteria:**
  - Unauthenticated requests return `401`.
  - Authenticated non-owner requests return `403`.
  - Owner requests succeed with traceable logs.

### 2) Stop React update loop in Borrow/FundWallet flow

- **Severity:** Critical
- **Files:** `frontend/src/components/common/FundWallet.jsx`, `frontend/src/pages/Borrow.jsx`
- **Current issue:** Console flood: "Maximum update depth exceeded".
- **Likely cause:** `onStatusChange(funding)` effect triggers parent update every render due to object identity churn.
- **Action:**
  - In `FundWallet`, only fire callback when meaningful scalar fields change (ready/hasGas/hasUsdc/reason).
  - In `Borrow`, avoid state updates if incoming status is equivalent to previous.
- **Acceptance criteria:**
  - No update-depth warnings in console during Dashboard -> Borrow and direct Borrow visits.
  - Stable FPS and no runaway re-render behavior.

### 3) Fix LoanManager deploy argument mismatch

- **Severity:** High
- **Files:** `deploy/001_deploy_all.js`, `deploy/000_full_deploy.js`, `contracts/LoanManager.sol`
- **Current issue:** Deploy scripts pass 5 args, contract constructor expects 8.
- **Action:**
  - Update deploy scripts to include `_uniswapRouter`, `_poolFee`, `_slippageBps`.
  - Set safe defaults per network/env for testnet.
- **Acceptance criteria:**
  - Fresh deploy completes successfully.
  - Backend can read deployment artifacts and boot without constructor mismatch fallout.

### 4) Mark mock identity as explicit testnet-only

- **Severity:** High
- **Files:** `backend/server.js`, `contracts/IdentityVerifierMock.sol`, docs in `docs/`
- **Current issue:** Identity scoring/verifier paths are simulated; risk of being mistaken for production-grade.
- **Action:**
  - Add explicit API response flags: `mock: true`, `environment: testnet`.
  - Add visible frontend labels when identity output is seeded/mock.
  - Update docs with clear "not production verification" disclaimers.
- **Acceptance criteria:**
  - No surface implies production-grade identity verification.

## P1 (Week 1-2)

### 5) Repair core repayment UX conversion

- **Severity:** High
- **Files:** `frontend/src/pages/Portfolio.jsx`, `frontend/src/pages/Repay.jsx`, `frontend/src/components/repay/RepayActions.jsx`, `frontend/src/components/repay/RepaySlider.jsx`
- **Current issue:** Manual loan ID entry and disconnected simulator reduce conversion and trust.
- **Action:**
  - Add "Repay" CTA per portfolio position with prefilled loan ID.
  - Replace or relabel simulator as "demo-only" unless connected to real loan data.
  - Add clearer disabled states with actionable reasons.
- **Acceptance criteria:**
  - User can go Portfolio -> Repay with no manual ID hunting.
  - Repay funnel trackable and understandable.

### 6) Add explorer links for tx trust

- **Severity:** Medium-High
- **Files:** tx status components in frontend (e.g. status banners)
- **Current issue:** Hash visibility without direct explorer action.
- **Action:** add "View on Explorer" links per chain.
- **Acceptance criteria:** every tx status event has one-click explorer verification.

### 7) Harden endpoint auth boundaries

- **Severity:** Medium-High
- **Files:** `backend/server.js`
- **Action:**
  - Review all write endpoints (`fundraising`, `match accept`, etc.) for required auth.
  - Apply consistent auth policy by endpoint category.
  - Add endpoint auth table to docs.
- **Acceptance criteria:** no sensitive write path remains public unintentionally.

## Product Trust and Narrative Hygiene

### 8) Replace static trust metrics or label as placeholders

- **Severity:** Medium
- **Files:** trust strip / landing stats components
- **Action:** fetch real metrics, or label as illustrative placeholders.
- **Acceptance criteria:** no potentially misleading static KPI claims.

### 9) Clarify "testnet-only vs live" matrix

- **Severity:** Medium
- **Files:** `docs/README.md`, `docs/TESTNET_READINESS.md`, relevant UI badges
- **Action:** publish a simple matrix:
  - live onchain
  - advisory only
  - mock/simulated
- **Acceptance criteria:** users and investors can instantly understand maturity boundaries.

## Suggested Owners

- **Protocol/Security Owner:** backend auth + contract deploy consistency
- **Frontend Owner:** borrow/repay conversion + runtime stability
- **Product Owner:** trust copy + maturity matrix + KPI definitions
- **Founder/BD Owner:** pilot readiness narrative + partner-safe messaging

## QA Checklist Before Next Demo

- no console loops/errors in standard user journey
- all P0 endpoint auth tests pass
- deploy scripts work on clean environment
- Borrow -> Portfolio -> Repay flow can be explained in <60s
- tx explorer links visible and working
- mock surfaces visibly labeled

## Demo Script (Investor/Partner Safe)

- Connect wallet
- Open Borrow and show valuation + terms
- Create sample loan (or show successful prior tx with explorer link)
- Navigate to Portfolio position
- Open Repay with prefilled loan context
- Explain settlement-at-unlock and risk controls

## Success Metrics for This Sprint

- P0 bugs closed: 4/4
- Runtime warning count: 0 for core flow
- Repay funnel completion uplift vs baseline
- Time-to-first-loan-demo reduced
- No unauthenticated sensitive endpoint remaining

