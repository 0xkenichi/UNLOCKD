# Solving Risks and Staying Ahead

**Purpose:** Map every risk and gamification vector to a resolution strategy (solve, mitigate, or accept), define concrete remediations, and establish an ongoing process so the protocol stays ahead of new attack surfaces.

**Input:** `docs/RISKS_GAPS_AND_GAMIFICATION.md`  
**Last updated:** 2026-02-14

---

## 1. Can We Solve All of This?

**Short answer:** We can **solve or materially mitigate** most of it. A small set remains as **residual risk** that we accept, monitor, and cap.

| Category | Solvable? | Approach |
|----------|-----------|----------|
| **Fake vesting / adapter abuse** | Yes | Whitelist-on by default; factory/bytecode checks; formal adapter checklist. |
| **Oracle manipulation / wrong feed** | Partially | Staleness + deviation limits + circuit breaker; we cannot eliminate flash-loan price spikes but we can cap impact (LTV, max borrow). |
| **Identity pseudo-score gaming** | Yes | Remove deterministic hash from production; require real attestation provider for any “verified” tier. |
| **Airdrop sybil** | Partially | Cap per wallet; require proof-of-uniqueness (e.g. Gitcoin Passport, World ID, or on-chain history); we cannot eliminate all sybils but we can raise cost and cap allocation. |
| **Sablier operator revocation** | Yes | Document; consider wrapper that locks operator or use a different escrow pattern that doesn’t rely on revocable approval. |
| **Auction collusion** | Partially | Reserve pricing + identity/allowlist for high-value auctions; we cannot eliminate off-chain side deals but we can make them visible (e.g. same-entity detection) or restrict who can bid. |
| **Admin / governance takeover** | Partially | Multisig + timelock + 2-of-N for sensitive admin actions; we cannot eliminate key compromise but we can make it harder and slower. |
| **Illiquid collateral default** | Partially | Per-token LTV/size limits; min liquidity or DEX depth checks; we accept some slippage loss and cap it. |
| **Relayer / MEV / privacy** | Partially | Relayer set + optional slashing; private RPC recommendation; we cannot eliminate MEV but we can reduce surface. |

So: **most items are solvable or mitigable to an acceptable level.** The rest we **accept as residual**, document, and keep in scope for the Risk Committee and monitoring.

---

## 2. Resolution Matrix: Solve / Mitigate / Accept

Use this to drive backlog and ownership. Each row from `RISKS_GAPS_AND_GAMIFICATION.md` is classified and given an action.

### 2.1 Protocol and Contracts

| # | Risk / Vector | Resolution | Owner | Action |
|---|----------------|------------|--------|--------|
| 1 | Fake vesting, no whitelist | **Solve** | Protocol eng | Default `useWhitelist = true`; deploy with allowlist populated; add `allowedVestingContracts` for known factories/wrappers only. Document in CONTRACTS and CLAIM_RIGHTS_WRAPPERS. |
| 2 | Malicious vesting interface | **Mitigate** | Protocol eng | Add optional bytecode hash or factory allowlist; require audit or governance vote for new vesting types. |
| 3 | Sablier operator revocation | **Solve** | Protocol eng | Document in CLAIM_RIGHTS_WRAPPERS; consider wrapper that cannot have operator revoked, or escrow pattern that doesn’t depend on operator. |
| 4 | Oracle staleness / wrong feed | **Mitigate** | Risk / Protocol | Enforce `maxPriceAge`; token-specific feed required for listed collateral; add deviation check vs secondary source if feasible. |
| 5 | No early liquidation | **Accept** | Risk | By design; document in LITEPAPER and RISK_MODELS; cap LTV and size so tail loss is bounded. |
| 6 | Settlement front-run / MEV | **Mitigate** | Protocol | Document; optional “settlement window” or private RPC for repay; monitor settlement vs repay timing. |
| 7 | Default liquidation slippage | **Mitigate** | Risk / Protocol | Per-pool/p per-token `minOut` and max seize; sanity check DEX liquidity before allowing collateral. |
| 8 | Sealed-bid nonce / reveal | **Mitigate** | Protocol | Recommend strong nonce (entropy); document in TECHNICAL_SPEC; consider commit deadline and reveal window. |
| 9 | Auction unclaimed collateral | **Solve** | Protocol / Ops | Define policy: after N days, protocol or seller can claim/redirect; implement in BaseAuction or docs. |
| 10 | Owner / timelock bypass | **Solve** | Ops / Protocol | Mainnet: timelock always on; multisig owner; document in DEPLOYMENT and CONTRACTS. |
| 10b | Founder/insider pump–dump | **Mitigate** | Risk / Ops / Backend | Internal wallet–token relationship map and flagging (founder/team/insider per token); cohort alert when multiple same-protocol wallets exit; insider-aware LTV or caps for flagged counterparties. See **`docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md`**. |

### 2.2 Identity and Eligibility

| # | Risk / Vector | Resolution | Owner | Action |
|---|----------------|------------|--------|--------|
| 11 | Deterministic passport score | **Solve** | Backend / Product | Remove or feature-flag hash-based score; production “verified” tier only with real attestation provider (e.g. Gitcoin Passport API, World ID). Document in P0_WAR_ROOM or FAQ. |
| 12 | Admin identity patch | **Mitigate** | Ops / Backend | Two-party approval or logged change request for identity profile patches; audit log already exists—add review cadence. |
| 13 | Airdrop leaderboard sybil | **Mitigate** | Product / Ops | Cap per-wallet allocation; require Passport or on-chain history for airdrop; don’t trust feedback payload alone for wallet attribution; document in TOKENOMICS or ops. |
| 14 | Feedback wallet spoofing | **Solve** | Backend | Leaderboard: only attribute feedback to wallet if that wallet had a valid session in same time window; or remove feedback from leaderboard score and use only on-chain + session-backed events. |
| 15 | Presale eligibility / caps | **Solve** | Ops / Legal | Publish eligibility and per-wallet/per-entity caps in one canonical doc (e.g. PRESALE_EXECUTION or investor dataroom); enforce in subscription flow. |

### 2.3 Privacy and Operations

| # | Risk / Vector | Resolution | Owner | Action |
|---|----------------|------------|--------|--------|
| 16 | Relayer trust / MEV | **Mitigate** | Protocol / Ops | Publish relayer set and expected behavior; optional slashing or reputation; recommend private RPC in PRIVACY_MODEL. |
| 17 | Tabletop / incident drill | **Solve** | Ops | Run at least one tabletop (oracle failure + pause) before mainnet; log in INCIDENT_RESPONSE_RUNBOOK or ops. |
| 18 | Risk param change without evidence | **Mitigate** | Risk Committee | Checklist: every param change PR or proposal links to rationale + simulation; CI or process check. |
| 19 | Invariant / fuzz tests | **Solve** | Protocol eng | Add invariant tests (debt ≤ collateral at issuance; settlement conserves balances); add fuzz for loan lifecycle (see SECURITY_AUDIT_CLOSEOUT). |
| 20 | Dependency risk | **Mitigate** | Eng | Dependabot or Renovate; upgrade SLA (e.g. critical in 7 days); document in SECURITY_ROADMAP. |

---

## 3. Concrete Remediation Sprints (Prioritized)

### Sprint A — Critical (before mainnet)

- **A1.** VestingAdapter: deploy with `useWhitelist = true` and populate allowlist for approved wrappers/vesting types only.
- **A2.** Identity: remove or gate hash-based passport score; production verified tier requires real attestation; document clearly.
- **A3.** Governance: multisig owner + timelock always on for mainnet; document in DEPLOYMENT and CONTRACTS.
- **A4.** Invariant tests: debt ≤ collateral at issuance; settlement balance conservation; run in CI.
- **A5.** Tabletop: one incident drill (oracle failure + pause + comms); document outcome.

### Sprint B — High (next 1–2 milestones)

- **B1.** Sablier: document operator revocation risk; implement or document wrapper/pattern that doesn’t rely on revocable operator.
- **B2.** Airdrop: define anti-sybil (cap per wallet + proof-of-uniqueness or session-backed events); stop attributing feedback to arbitrary payload wallet.
- **B3.** Presale: publish eligibility and per-wallet/per-entity caps; enforce in process.
- **B4.** Oracle: add deviation check or circuit breaker where feasible; document in RISK_MODELS and in **`docs/SECURITY_ORACLES_AND_PARAMETERS.md`** (oracle security layer and red-team checklist).
- **B5.** Admin: two-party or approval workflow for identity profile patch and repay-sweep.
- **B6.** Founder/insider: implement or integrate internal risk-intel (wallet–token relationship, vesting type/source, cohort detection); define flagging rules and insider-aware LTV/caps; see **`docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md`**.

### Sprint C — Medium (ongoing backlog)

- **C1.** Auction: policy for unclaimed collateral; optional bidder allowlist for large auctions.
- **C2.** Relayer: document set, expectations, and optional slashing in PRIVACY_MODEL.
- **C3.** Risk param changes: mandatory link to rationale + simulation in process/checklist.
- **C4.** Dependencies: automate upgrades and SLA (e.g. in SECURITY_ROADMAP).

---

## 4. How We Stay Ahead

Staying ahead means: **continuous identification, ownership, and mitigation** of new and existing risks, plus **clear accountability**.

### 4.1 Ownership and Cadence

| Activity | Owner | Cadence | Output |
|----------|--------|---------|--------|
| **Risk and gamification review** | Risk Committee + 1 protocol lead | Quarterly | Updated `RISKS_GAPS_AND_GAMIFICATION.md`; new vectors added and classified. |
| **Remediation backlog** | Protocol eng + Ops | Bi-weekly | Sprint alignment with this doc; items from §2 and §3. |
| **Security roadmap** | Security lead / Ops | Per phase | SECURITY_ROADMAP updated; Go/No-Go checklist re-checked. |
| **Incident drill** | Ops | At least 1 pre-mainnet, then every 6 months | Runbook update; timeline and lessons in runbook or postmortem. |
| **Dependency and audit** | Eng | Dependencies: ongoing; Audit: pre-mainnet + after major changes | Upgrades applied; audit scope and findings tracked. |

### 4.2 “Stay Ahead” Checklist (Recurring)

Run this on a schedule (e.g. quarterly) and when adding new features:

- [ ] **New surface?** New contract, adapter, or integration → add to threat model and `RISKS_GAPS_AND_GAMIFICATION.md`.
- [ ] **New incentive?** Any new reward, airdrop, or score → ask “how can this be sybiled or gamed?” and add mitigations.
- [ ] **New admin power?** Any new owner/caller function → require timelock + multisig and document.
- [ ] **Parameter change?** Any LTV, oracle, or risk param → require rationale + simulation and Risk Committee visibility.
- [ ] **Third-party trust?** New oracle, relayer, or KYC provider → document trust assumptions and failure modes.

### 4.3 Monitoring and Alerts

- **On-chain:** Oracle staleness and deviation; settlement failures; unusual borrow size or LTV; new collateral type usage.
- **Backend:** Identity score distribution changes; airdrop leaderboard anomalies (e.g. many high-score new wallets); admin audit log for sensitive actions.
- **Operational:** Failed settlements; pool insolvency or large slippage on liquidation; emergency pause usage.

Ownership for alerting: assign in runbook (e.g. on-call + Risk Committee for protocol alerts).

### 4.4 Game-Theory and Red Team

- **Annually (or pre-mainnet):** Dedicated “gamification review”: can someone rationally sybil airdrop, fake identity, or abuse auctions? Update §2 resolution matrix.
- **After any new incentive or feature:** Short checklist: “What’s the best response of a rational, profit-seeking actor?” Document and mitigate.

### 4.5 Bug Bounty and Disclosure

- **Pre-mainnet:** Responsible disclosure policy and channel (see SECURITY_ROADMAP Phase 2).
- **Post-mainnet:** Bug bounty for contracts and critical backend paths; scope and rewards in policy.
- **Stay ahead:** Include “gamification” and “economic exploit” in bounty scope so researchers are incentivized to find sybil and incentive abuses.

### 4.6 Documentation and References

- Keep **RISKS_GAPS_AND_GAMIFICATION.md** as the single source of risks and vectors; link to it from:
  - **RISK_COMMITTEE_CHARTER** (e.g. “Quarterly review of `docs/RISKS_GAPS_AND_GAMIFICATION.md` and `docs/REMEDIATION_AND_STAYING_AHEAD.md`”).
  - **SECURITY_ROADMAP** (e.g. “Remediation plan: `docs/REMEDIATION_AND_STAYING_AHEAD.md`”).
  - **INVESTOR_DATAROOM_INDEX** (risks and mitigations section).
- After each Risk Committee meeting or major release, update the resolution matrix (§2) and sprint list (§3) so the doc stays the single place to “what we’re doing and who owns it.”

---

## 5. Summary

- **Can we solve all of it?** We can **solve or materially mitigate** most risks; the rest we **accept as residual**, document, and cap with LTV/limits and monitoring.
- **How we solve it:** Use the **resolution matrix** (§2) and **remediation sprints** (§3) with clear owners.
- **How we stay ahead:** **Quarterly risk and gamification review**, **recurring stay-ahead checklist**, **monitoring and alerts**, **game-theory/red-team pass**, **bug bounty**, and **keeping this doc and RISKS_GAPS_AND_GAMIFICATION.md up to date** with links from Risk Committee Charter and Security Roadmap.

This gives you a single place to drive remediation and a repeatable process so new features and new attack surfaces don’t outpace your controls.
