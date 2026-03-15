# CRDT AI: Knowledge, Automation, and Privacy

This document defines **(1)** what the CRDT AI knows and how it stays informed, **(2)** what must be automated so the system and AI have up-to-date data, and **(3)** strict privacy rules so that **no one can know when or which token holders use the platform**.

---

## 1. What CRDT AI Knows

The CRDT AI must be able to inform users correctly about the protocol and what is happening on the platform. It receives **only** the following.

### 1.1 Protocol knowledge (full)

- **Docs**: All indexed protocol documentation (whitepaper, technical spec, risk models, interest rates and pool lifecycle, oracles and price-behavior agent, security oracles, governance, liquidity strategy, etc.). Loaded at startup and via retrieval at query time.
- **Risk data**: Monte Carlo / risk simulation results (e.g. `risk_sim_results.csv`) for conservative caps and P5/ES5.
- **Structured protocol facts**: Rate model (utilization tiers), community pool lifecycle (FUNDRAISING → ACTIVE / REFUNDING → CLOSED), settlement rules, DPV/LTV formulas, ATH/ATL usage in valuation.

### 1.2 Platform activity (aggregate only)

- **Platform snapshot**: Aggregated, anonymized stats only—**no addresses, no wallet identifiers, no per-user or per-holder data**. Examples:
  - Counts: loans created (24h / 7d), loans repaid, loans settled, defaults (24h / 7d).
  - Pool-level: total deposits, total borrowed, utilization %, community pools count by state.
  - Optional: total volume (USD) in time windows, asset-type buckets (e.g. by collateral symbol) **without** any address or timing that could identify a holder.
- **Source**: A dedicated API (e.g. `GET /api/platform/snapshot`) that computes from on-chain indexer and pool state and returns **only** such aggregates. The AI receives this snapshot in its system prompt or tool context so it can say things like “there have been X loans created in the last 24 hours” or “pool utilization is Y%” without ever seeing who did what.

### 1.3 What CRDT AI must never receive or infer

- **Wallet addresses** (connected user or any third party): Must not be included in prompts to the LLM, in conversation memory, or in logs in a way that links identity to activity. Optional: “a wallet is connected” (boolean) for in-session UX only, with no address characters.
- **Per-user or per-address activity**: No “user X borrowed at time T”, no lists of borrowers or lenders, no exports that include addresses.
- **Timing that identifies holders**: No API or AI context that allows inferring “this address used the platform at this time.”

---

## 2. Automation (so the system and AI are up to date)

All of the following should run **without manual steps** and **without any user or holder data** in the pipeline.

| What | How (automated) | Privacy |
|------|------------------|--------|
| **Spot price** | Existing oracles (Chainlink, Pyth) and indexer; no user data. | Safe. |
| **ATH / ATL** | Scheduled job (cron/worker) that calls Chainlink Historical and/or Pyth Benchmarks (or indexer), computes ATH/ATL per token, updates cache or pushes to `ValuationEngine.setTokenPriceBounds` via governance/keeper. No user input. | Safe. |
| **Price-behavior service** | Same job or a separate one refreshes the data used by `getPriceBehavior` (cache or env overwrite). Agent and API use refreshed data. | Safe. |
| **Pool state** | Indexer already polls chain for deposits/borrows; utilization and rate are derived on-chain. Optional: backend cache of `totalDeposits`, `totalBorrowed`, `getInterestRateBps()` for snapshot API. | Safe. |
| **Community pool lifecycle** | On-chain state; any backend that serves pool lists or snapshot calls contract view (`communityPools`, state). No user data in automation. | Safe. |
| **Platform snapshot** | Periodic (e.g. every 1–5 min) recompute of aggregate stats from indexer events and pool state; serve via `/api/platform/snapshot`. Inputs: event counts, amounts (no addresses). | Safe. |
| **Rate model / risk params** | Governance (timelock) or keeper scripts that call `setRateModel` / `setTokenPriceBounds` etc. from off-chain inputs (e.g. risk committee output). No user data. | Safe. |

Implementation notes:

- **Cron/workers**: Use a small scheduler (e.g. node-cron, or a separate worker process) to run ATH/ATL refresh, price-behavior cache refresh, and snapshot recompute. No PII or wallet data in job inputs or logs.
- **Agent context**: On each chat request the backend fetches the current platform snapshot and injects it into the CRDT AI system prompt so the AI can answer “what’s happening on the platform” from aggregates only.

**Automation runbook (concise):**

- **ATH/ATL**: Run a job (e.g. daily) that calls Chainlink Historical and/or Pyth Benchmarks, computes ATH/ATL per listed token, then updates backend cache or (via governance/keeper) `ValuationEngine.setTokenPriceBounds`. No user data.
- **Price-behavior cache**: Same or separate job refreshes the data used by `getPriceBehavior` (e.g. env vars or a cache file). Frontend and agent then see fresh drawdown/range.
- **Platform snapshot**: Currently computed on demand when the agent chat is called. Optional: a lightweight cron (e.g. every 1–5 min) that calls `getPlatformSnapshot()` and stores the result in memory so the agent read is instant.

---

## 3. Privacy rules (no one knows when or which holders use the platform)

These rules apply to APIs, logs, AI prompts, and any export.

### 3.1 Public and AI-facing APIs

- **Activity feeds**: Public activity endpoints (e.g. `/api/activity`, `/api/exports/activity`) must **not** return wallet addresses, borrower addresses, or any identifier that can be used to infer “which token holder did what when.” Return only: event type, loan id (opaque), amount, timestamp, tx hash if needed for verification—**no `borrower` or `user` or `wallet` field** in the response body or export columns.
- **Platform snapshot**: Only aggregates (counts, totals, utilization). No addresses, no per-user stats, no “unique wallets” if that could be combined with other data to enumerate or correlate holders.
- **KPI / analytics**: If any endpoint returns “unique wallets” or similar, it must not be fed to the AI or exposed in a way that identifies who used the platform when. Prefer not to expose unique wallet counts in public or AI-facing endpoints.

### 3.2 CRDT AI and LLM

- **System prompt**: Include protocol knowledge and platform snapshot (aggregates only). Include an explicit instruction: “You have protocol knowledge and aggregate platform stats only. Never infer or expose individual user or wallet activity; never ask for or store wallet addresses.”
- **Context from frontend**: Do **not** include the connected wallet address in the text sent to the LLM. Option: send only “wallet connected: yes/no” or “chain: X” for in-session UX (e.g. “use the same borrower wallet for repay”) without identifying the wallet.
- **Conversation memory**: Do not store wallet address or any user identifier in conversation history in a way that could link a holder to questions or usage. Store at most session id or anonymous fingerprint for rate limiting; do not attach wallet to message content or metadata in logs.

### 3.3 Logging and storage

- **Request logs**: Do not log wallet address together with message or action (e.g. avoid “wallet 0x… asked …”). Log only aggregate or anonymized metrics (e.g. “agent chat request”).
- **Persistence**: If conversation or analytics are persisted, ensure no table or export links “this wallet” to “this activity at this time.” Use anonymous session or no identifier.

### 3.4 Alignment with PRIVACY_MODEL

- The protocol’s **PRIVACY_MODEL** (identity, relayers, sealed-bid, etc.) applies to on-chain and product privacy. This document applies to **backend, APIs, and CRDT AI**: no leakage of “when and which token holders use the platform” via data or AI answers.

---

## 4. Implementation checklist

- [x] **Platform snapshot API**: `GET /api/platform/snapshot` returns only aggregate stats (counts, utilization, pool stats; no addresses). Agent chat fetches it and injects into system prompt.
- [x] **Agent**: Platform snapshot in CRDT AI system prompt; privacy rule in prompt (“protocol + aggregates only; never expose or ask for wallet/identity”). Runtime context sent to LLM omits `walletAddress`; only “Wallet connected: yes” in hints.
- [x] **Privacy**: `borrower` removed from public `/api/activity` response and from `/api/exports/activity` CSV. Wallet address not sent to LLM.
- [ ] **Automation**: Add scheduled jobs for ATH/ATL refresh and price-behavior cache refresh; document in runbook or ops doc. Snapshot is computed on demand per chat; optional periodic precompute for speed.
- [ ] **Docs**: Link this doc from PRIVACY_MODEL, ARCHITECTURE, and the agent/ops runbooks.

---

## 5. Related docs

- **Privacy (protocol)**: `protocol-design/PRIVACY_MODEL.md`
- **Oracles and price behavior**: `ORACLES_AND_PRICE_BEHAVIOR_AGENT.md`
- **Interest and pools**: `INTEREST_RATES_AND_POOL_LIFECYCLE.md`
- **Risk (ATH/ATL)**: `RISK_MODELS.md` (§ Price history)
- **Security oracles**: `SECURITY_ORACLES_AND_PARAMETERS.md`
