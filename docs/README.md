# Vestra Documentation

This docs hub is the complete entry point for CRDT/Vestra: concept → design → build → test → pilot.

Docs are grouped by topic. Start with **protocol-design** and **reference**; use other folders as needed.

---

## Start Here
- [protocol-design/OVERVIEW.md](protocol-design/OVERVIEW.md) — What the protocol is, who it serves, and how it works.
- [protocol-design/CANONICAL_POSITIONING.md](protocol-design/CANONICAL_POSITIONING.md) — Official naming, chain narrative, and external messaging guardrails.
- [protocol-design/MVP.md](protocol-design/MVP.md) — MVP scope, goals, and build plan.
- [build-and-deploy/SEPOLIA_BORROW_FLOW.md](build-and-deploy/SEPOLIA_BORROW_FLOW.md) — Hands-on Sepolia borrow flow test guide.

---

## protocol-design/
Core protocol narrative, system design, and contracts.
- **OVERVIEW.md** — High-level intro and next steps.
- **WHITEPAPER.md** — Full technical whitepaper.
- **LITEPAPER.md** — Executive summary.
- **ARCHITECTURE.md** — Modules, data flows, and enforcement.
- **TECHNICAL_SPEC.md** — Implementable system spec (complements ARCHITECTURE).
- **CONTRACTS.md** — Contract-by-contract behavior and interfaces.
- **MVP.md** — Scope, goals, and build plan.
- **PRIVACY_MODEL.md** — Privacy and identity hooks.
- **LIQUIDITY_STRATEGY.md** — Liquidity and pool strategy.

## risk/
Risk models, LTV/DPV, interest rates, committee charter, and risk remediation.
- **RISK_MODELS.md** — Deterministic + Monte Carlo valuation and TWAP LTV constraints.
- **INTEREST_RATES_AND_POOL_LIFECYCLE.md** — Inverted interest rate curve and pool lifecycle.
- **MONTE_CARLO_LTV_TABLE.md** — Monte Carlo LTV table reference.
- **RISK_COMMITTEE_CHARTER.md** — Risk governance scope, voting, emergency controls.
- **RISKS_GAPS_AND_GAMIFICATION.md** — Protocol risks, gaps, and gamification vectors.
- **REMEDIATION_AND_STAYING_AHEAD.md** — Resolution matrix and remediation process.
- **SECURITY_ORACLES_AND_PARAMETERS.md** — Oracle security and parameter mitigations.

## security/
Threat model, audit roadmap, incident response, and admin controls.
- **SECURITY.md** — Threat model and audit checklist.
- **SECURITY_ROADMAP.md** — Security milestones from MVP to mainnet readiness.
- **SECURITY_AUDIT_CLOSEOUT_2026-02-13.md** — Hardening changes and residual risk list.
- **INCIDENT_RESPONSE_RUNBOOK.md** — Incident severity, response, and postmortem process.
- **ADMIN_OPERATIONS.md** — Admin endpoint controls, access policy, and audit trail.
- **API_AUTH_MATRIX.md** — Endpoint-by-endpoint auth for testnet operations.
- **P0_WAR_ROOM_FIXLIST.md** — P0 fixlist and war room items.
- **SLITHER_TRIAGE.md** — Static analysis baseline and remediation priorities.

## token-and-governance/
CRDT token and DAO governance.
- **CRDT.md** — Token + DAO governance blueprint.
- **TOKENOMICS_FINAL.md** — Phase 1 allocation, vesting, and treasury policy.

## integrations/
Claim-rights wrappers, protocol integrations, futures, and legal.
- **CLAIM_RIGHTS_WRAPPERS.md** — Real vesting standards, wrapper patterns, and admin-access audit requirements.
- **PROTOCOL_INTEGRATIONS.md** — External protocol integration points and DAO OTC Treasury plays.
- **FUTURES_AND_STACK_INTEGRATION.md** — Futures/perps integration for hedging and liquidation.
- **LEGAL_IMPLICATIONS.md** — Legal implications (informational; not legal advice).

## build-and-deploy/
Deployment, testing, frontend, and testnet tooling.
- **DEPLOYMENT.md** — Deploy scripts, networks, and addresses.
- **TESTING.md** — Unit/integration tests and coverage expectations.
- **FRONTEND.md** — UI notes, wallet flows, and Wagmi/RainbowKit hooks.
- **DEMO_LOCAL.md** — Local demo setup.
- **IDENTITY_VERIFIER_DEPLOY.md** — Identity verifier deployment.
- **SEPOLIA_BORROW_FLOW.md** — Sepolia borrow flow test guide.
- **TESTNET_READINESS.md** — Testnet readiness criteria.
- **TESTNET_FAUCET_DEMO_ONE_PAGER.md** — Faucets + demo flow for external testers.
- **TESTNET_VESTING_CREATION_QUICKSTART.md** — Sample testnet vesting contracts for demos.

## pilot-and-gtm/
Pilot launch, GTM, and metrics.
- **PILOT_LOI_TEMPLATE.md** — Partner LOI template for pilot intent.
- **PILOT_CHECKLIST.md** — Launch gate checklist.
- **WEEKLY_KPI_REPORT_TEMPLATE.md** — Weekly reporting format for pilots.
- **ELITE_9X_EXECUTION_MASTER_PLAN.md** — Testnet-first plan to 9/10 readiness.
- **GTM_PIPELINE.md** — Partner pipeline and go-to-market milestones.
- **METRICS.md** — KPI definitions and reporting cadence.

## product-ux/
Wireframes, Figma map, and frontend vision.
- **CRDT_FIGMA_FRAME_MAP.md**
- **CRDT_DASHBOARD_WIREFRAMES_2030.md**
- **CRDT_BORROW_FLOW_WIREFRAMES_2030.md**
- **CRDT_REPAY_FLOW_WIREFRAMES_2030.md**
- **CRDT_IDENTITY_FLOW_WIREFRAMES_2030.md**
- **CRDT_GOVERNANCE_FLOW_WIREFRAMES_2030.md**
- **CRDT_FRONTEND_2030.md**
- **CRDT_INTERACTIVE_PROTOTYPING.md**

## reports/
Execution and quality reports.
- **WAVE2_RED_GREEN_REPORT.md** — Wave 2 execution status and remaining warnings.
- **WAVE3_MOBILE_A11Y_REPORT.md** — Mobile responsiveness and accessibility.

## reference/
Glossary, FAQ, and changelog.
- **GLOSSARY.md** — Protocol terms and definitions.
- **FAQ.md** — Common questions and quick answers.
- **CHANGELOG.md** — Doc and MVP changes over time.
- **MArket.md** — Market reference (if applicable).
- **assets/diagrams/** — Architecture and flow images used across docs.

## Legal (docs root)
Advisory and compliance — not legal advice; engage counsel for mainnet and offerings.
- **legal/VESTRA_UNA_CONSTITUTION.md** — Formal Constitution of the Vestra Unincorporated Nonprofit Association.
- **LEGAL_ADVISORY_MEMO.md** — Legal arm memo: biggest risks, loan T&Cs, LOI, IP, mainnet steps, traffic-light areas.
- **LOAN_TERMS_AND_RISK_DISCLOSURE_OUTLINE.md** — Outline for counsel to draft Loan Terms; UI linkage and one accept trigger.
- **integrations/LEGAL_IMPLICATIONS.md** — Full legal implications (regulatory, custody, liability, presale).

## investor-and-marketing/
Investor memos, grant applications, and eligibility.
- **INVESTOR_MEMO_ONE_PAGER.md** — Concise investor/grants diligence memo.
- **DEFI_MOONSHOTS_APPLICATION.md**
- **ALCHEMY_EVERYONE_ONCHAIN_ELIGIBILITY.md**
- **deck/** — Pitch deck and related assets.

## ops/
Execution ops (founder-led): GTM, audit, funding, presale, mainnet rollout, hiring.
- **GTM_90_DAY_EXECUTION.md** — Weekly GTM and LOI execution plan.
- **AUDIT_AND_CI_HARDENING_PLAN.md** — Audit path and quality-gate plan.
- **AUDIT_VENDOR_RFP_TEMPLATE.md** — External auditor RFP template.
- **FUNDING_PRESALE_SPRINT.md** — Investor and pre-sale sprint plan.
- **INVESTOR_DATAROOM_INDEX.md** — Diligence checklist and source index.
- **PRESALE_EXECUTION_CHECKLIST.md** — Pre-sale readiness and go/no-go.
- **CONTROLLED_MAINNET_ROLLOUT.md** — Phased mainnet rollout and guardrails.
- **TEAM_TOKEN_VESTING_AND_HIRING.md** — Token-aligned hiring and vesting policy.
- **ANNUAL_REVIEW_AND_NEXT_YEAR_PLANNING.md** — Year-end review and planning.
- **PILOT_OPERATIONS_PLAYBOOK.md** — Runbook for launching and operating a live pilot.
- **HIRING_TWITTER_PAGE.md** — Hiring and Twitter presence.

## private/
Private or internal docs (e.g. tokenomics playbooks, data).
- **tokenomics/** — Live tokenomics calculator, playbooks, and data.
