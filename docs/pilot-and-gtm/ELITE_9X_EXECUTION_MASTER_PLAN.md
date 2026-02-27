# Vestra Elite 9X Execution Master Plan (Testnet-First)

This is the operating plan to push Vestra from current state to 9+/10 readiness on:

- Product UX
- Technical readiness
- Security posture
- Commercial readiness

Scope is explicitly **testnet-first** for the next month, while building mainnet discipline in parallel.

---

## North Star Targets (by end of plan)

- Product UX: `>= 9.0`
- Technical readiness: `>= 9.0`
- Security readiness (testnet + pre-mainnet controls): `>= 9.0`
- Commercial readiness: `>= 9.0`
- Time-to-demo (new user): `< 20 minutes`
- Borrow -> Repay successful demo rate: `>= 80%` for qualified testers

---

## Command Model

- Daily war-room: 25 minutes
- Daily maker blocks: 2 x 90 minutes
- Weekly decision review: 45 minutes
- Weekly public changelog + KPI update
- Every task mapped to: owner, ETA, acceptance test, rollback plan

Use a single board with statuses:
- `Now` (P0)
- `Next` (P1)
- `Later` (P2)
- `Blocked`

---

## Phase 0 (Days 1-3): Stop Risk, Stabilize Core

### Security + Runtime P0

1. Lock sensitive Solana repay endpoints behind authenticated admin session only.
2. Add audit entry for every repay-plan/repay-sweep execution.
3. Fix render-loop risk in funding status callback path.
4. Add regression check: no "Maximum update depth exceeded" in core flows.
5. Add tx explorer links in all transaction status banners.

### Deploy + Environment Integrity

6. Align all deploy scripts with current `LoanManager` constructor.
7. Add deploy smoke script for local + Base Sepolia.
8. Validate backend boot against latest deployment artifacts.
9. Tag all mock identity outputs as `mock/testnet`.
10. Publish quick "what is mock vs live" matrix.

Acceptance for Phase 0:
- zero critical auth/runtime defects in demo path
- fresh deploy succeeds in clean environment
- no hidden production-claim ambiguity in identity surfaces

---

## Phase 1 (Days 4-14): Make the Product Demo Frictionless

### Borrow/Repay UX Conversion

11. Add Portfolio row-level `Repay` action with prefilled loan context.
12. Keep top-level Repay CTA prefilled to first active loan when available.
13. Improve repay disabled reasons to be explicit and user-actionable.
14. Convert simulator language to explicit "what-if demo" unless tied to real data.
15. Add clear state labels: `Preview`, `Verified`, `Awaiting wallet`, `Wrong network`.

### Testnet Demo Experience

16. Publish faucet + onboarding one-pager for external testers.
17. Add in-app "Demo Access" section linking faucet docs and sample flow.
18. Provide sample vesting creation path for test users (script + UI guidance).
19. Add one-click "Copy demo inputs" for collateral ID/vesting contract.
20. Add 3-minute guided walkthrough in docs (with screenshots).

### Reliability

21. Add frontend health check card: backend reachable / chain connected / wallet funded.
22. Add retry-safe wrappers for demo-critical API endpoints.
23. Add graceful empty/error states for all tables.
24. Run mobile breakpoints pass for Dashboard/Borrow/Repay/Lender/Portfolio.

Acceptance for Phase 1:
- a new test user can complete Borrow and Repay with docs only
- major UX flow blockers removed
- testnet demo reproducible by non-team users

---

## Phase 2 (Days 15-35): Security Hardening + Risk Controls to 9

### Contract + Backend Hardening

25. Run static analysis (`slither`) and triage issues to closure plan.
26. Add invariants for loan accounting, settlement, and repay behavior.
27. Add endpoint auth matrix and enforce consistently for all write routes.
28. Add admin access policy test cases (session, role, allowlist, key fallback behavior).
29. Add structured security logging for critical operations.

### Risk Operations

30. Define testnet risk parameter policy (LTV/volatility/sigma cadence).
31. Add monthly stress simulation runbook and owner.
32. Publish risk-committee testnet decision log template.
33. Add safety bounds assertions in valuation and repay workflows.

### Incident Preparedness

34. Run tabletop incident drill (API abuse + unexpected contract behavior).
35. Document rollback procedures for frontend, backend, and contract config.
36. Publish "known limits / non-goals" page for testnet users.

Acceptance for Phase 2:
- no unreviewed criticals in static/security checklist
- incident response process tested once end-to-end
- risk policy is documented and operational

---

## Phase 3 (Days 36-60): Commercial Readiness to 9

### Pipeline + Partner Readiness

37. Build target partner list by ecosystem and vesting volume.
38. Create pilot qualification scorecard (technical + legal + liquidity).
39. Convert docs into pilot package: one-pager, checklist, KPI template, LOI.
40. Close at least 2 pilot LOIs and schedule execution windows.

### Proof, Narrative, and Trust

41. Publish weekly KPI snapshots (wallets, quotes, borrow, repay, defaults).
42. Publish one transparent "what worked / what broke / what we fixed" log.
43. Build 1 named case study from testnet pilot behavior.
44. Standardize investor update deck with risk and reliability evidence.

Acceptance for Phase 3:
- partner pipeline moves from conversation to signed pilot intent
- external confidence rises from narrative to measurable proof

---

## Phase 4 (Days 61-90): Final 9+ Consolidation

45. External security review kickoff package ready (code, docs, test evidence).
46. Define mainnet gating criteria and pass/fail thresholds.
47. Freeze unstable features and focus on reliability and clarity.
48. Run 2 full dry-run demo rehearsals with non-team observers.
49. Close all high-severity UX and trust gaps from observer feedback.
50. Publish "mainnet readiness dashboard" (even if mainnet date is not set).

Acceptance for Phase 4:
- clear, auditable proof that system is maturing with discipline
- 9+ readiness by scorecard across product/security/technical/commercial

---

## Detailed Workstreams (Owners + Outputs)

### Workstream A: Product UX (Target 9.0)

- Owner: Product + Frontend lead
- Output: conversion-optimized Borrow -> Portfolio -> Repay flow
- KPI: demo completion rate, time-to-complete, drop-off by step

### Workstream B: Security & Controls (Target 9.0+)

- Owner: Protocol/security engineer
- Output: hardened APIs + contract safety checks + runbooks
- KPI: critical issue count, mean-time-to-fix, drill readiness

### Workstream C: Technical Quality (Target 9.0)

- Owner: Full-stack lead
- Output: stable deployments, reliable runtime, reproducible env
- KPI: successful build/deploy rate, runtime error rate, p95 latency

### Workstream D: Commercial Readiness (Target 9.0)

- Owner: Founder + BD/GTM
- Output: pilot pipeline, LOIs, public KPI trust loop
- KPI: qualified partners, LOIs, pilot activation, retention signals

---

## Weekly Cadence (Template)

### Monday
- set sprint commitments and risk flags
- lock top 5 execution priorities

### Tuesday-Thursday
- ship and verify
- daily 25-min war-room

### Friday
- KPI review
- public changelog
- reset board for next week

---

## Quality Gates (Must Pass)

- No P0 open
- No unauthenticated sensitive route
- No recurring runtime loop/errors in core flow
- Deploy scripts validated on clean machine
- Demo docs allow new user completion without hand-holding
- Every tx status has explorer verification
- Mock/testnet surfaces explicitly marked

---

## "Minute-Capable, Minute-Adaptable" Operating Rules

Use these rules so the team can adapt quickly without chaos:

1. Every task must be breakable into <= 90-minute units.
2. Every unit must end with a verifiable output.
3. Every bug gets severity + owner + rollback note.
4. Every merged fix updates docs or changelog.
5. Every week ends with measurable KPI movement.

---

## Immediate Next 10 Actions (Start Now)

1. Merge P0 auth/runtime/deploy fixes.
2. Verify Borrow flow no longer loops in console.
3. Verify tx explorer links are visible.
4. Verify Repay prefill from Portfolio row action.
5. Publish faucet one-pager for testers.
6. Add in-app link to the one-pager.
7. Run full demo from fresh wallet.
8. Record baseline funnel metrics.
9. Prioritize remaining UX friction tickets.
10. Send partner-safe update with what is live vs mock.

---

## Notes

- This plan assumes testnet-only execution in the near term.
- Mainnet preparation is treated as discipline, not launch pressure.
- The objective is repeatable proof, not cosmetic polish.

