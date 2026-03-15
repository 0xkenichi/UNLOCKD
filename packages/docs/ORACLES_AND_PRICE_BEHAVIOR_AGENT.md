# Oracles and Price-Behavior Agent

This document describes **(1)** how the protocol uses multiple oracles for spot and historical price data (including all-time high and all-time low), and **(2)** the **price-behavior agent** that evaluates token price behavior to inform risk, DPV, and user guidance.

---

## 1. Oracle strategy: spot and historical

### 1.1 Current usage

- **EVM (e.g. Base, Sepolia)**: `ValuationEngine` uses **Chainlink** `AggregatorV0.8` price feeds (default feed + per-token feeds). Spot price only; staleness enforced via `maxPriceAge`.
- **Solana**: Backend uses **Pyth** (Hermes API) for spot price by mint/symbol; used in `computeSolanaDpv` and streamflow vesting flows.
- **Historical / ATH–ATL**: Not provided by standard Chainlink or Pyth spot feeds. ATH/ATL must be derived from historical data or supplied by a dedicated source.

### 1.2 Options for historical and ATH/ATL

| Source | What it provides | ATH/ATL | Use in protocol |
|--------|------------------|---------|------------------|
| **Chainlink Price Feeds** | Spot only (on-chain). | No. | Current: `ValuationEngine` spot price. |
| **Chainlink Historical Price Feeds API** | Historical prices for a time range (off-chain REST). | Derive by querying history and taking max/min. | Backend/indexer: compute ATH/ATL over lookback; feed to agent and optionally to contract (e.g. `setTokenPriceBounds`). |
| **Chainlink Data Streams / Resolver** | Custom streams; could expose ATH/ATL if built. | Yes, if implemented. | On-chain consumption once available. |
| **Pyth Benchmarks API** | Historical prices at timestamps (`/v1/updates/price/{timestamp}`). | Derive by sampling and taking max/min. | Backend: same as Chainlink Historical—compute ATH/ATL, feed agent and optional contract params. |
| **Custom indexer / backend** | Own DB of prices (e.g. from Chainlink/Pyth/DEX). | Yes: store and serve ATH/ATL per token/lookback. | Single place for “price behavior”; agent and API call this; governance can push to contract. |
| **Governance-set bounds** | Manual ATH/ATL per token. | Yes. | `ValuationEngine.setTokenPriceBounds(token, ath, atl)` for on-chain DPV/LTV adjustment. |

### 1.3 Multi-oracle approach

- **Spot**: Keep Chainlink (EVM) and Pyth (Solana) as primary; add deviation check vs a second source (e.g. second oracle or TWAP) when feasible (see `SECURITY_ORACLES_AND_PARAMETERS.md`).
- **Historical / ATH–ATL**: Prefer one of:
  - **A)** Backend service that calls Chainlink Historical and/or Pyth Benchmarks, computes ATH/ATL over a governance-defined lookback, caches and exposes via API; agent and (optionally) keepers use it; governance can periodically push bounds to `ValuationEngine`.
  - **B)** Custom indexer that maintains ATH/ATL per token and exposes them via API; same consumption pattern.
- **On-chain**: When ATH/ATL are set per token (`ValuationEngine.tokenPriceBounds`), DPV and LTV use them for drawdown and range-based volatility (see `RISK_MODELS.md` § Price history). When not set, behavior is unchanged (spot + global vol only).

---

## 2. Price-behavior agent

### 2.1 Role

An **agent** (or agent tool) **evaluates price behavior** so that:

- Users and support get plain-language answers about how a token’s price has behaved (drawdown from ATH, range, distance from ATL).
- The protocol can suggest a risk tier or conservative LTV when drawdown is high or range is wide.
- The same metrics (drawdown, range) can drive on-chain DPV/LTV when ATH/ATL are set on `ValuationEngine`.

The agent does **not** replace the on-chain valuation; it adds **explanation, gating, and parameter suggestions** (e.g. “this collateral is 60% below ATH; expect lower LTV” or “use conservative pool”).

### 2.2 Inputs

- **Token**: Symbol (e.g. `BIO`) or contract address (EVM) or mint (Solana).
- **Chain / environment**: EVM chainId or Solana; determines which oracles and which contract (if any) to reference.
- **Optional**: Vesting/unlock context (e.g. time to unlock) so the agent can tie price behavior to “risk until unlock.”

### 2.3 Outputs (what the agent exposes)

- **Spot price** and source (e.g. Chainlink, Pyth).
- **ATH / ATL** (and lookback window), when available.
- **Drawdown from ATH**: `(ATH - P) / ATH` in % or bps; short summary (e.g. “40% below all-time high”).
- **Range-based volatility proxy**: e.g. `(ATH - ATL) / P_mid`; “high / medium / low” band.
- **Distance from ATL**: e.g. `P / ATL`; optional “just off lows” flag when near ATL.
- **Suggestion**: e.g. “Use conservative LTV” or “Price behavior suggests standard tier” for pool matching and UX.

### 2.4 Where it lives

- **Backend**:
  - **Service**: A small module (e.g. `backend/lib/priceBehavior.js` or `backend/priceBehavior.js`) that:
    - Resolves token to the right oracle(s) and optional `ValuationEngine` contract.
    - Fetches spot price (existing Chainlink/Pyth paths or RPC to contract).
    - Fetches or derives ATH/ATL (Historical API, Pyth Benchmarks, or internal cache/indexer).
    - Computes drawdown, range ratio, and suggestion; returns a structured object.
  - **API**: e.g. `GET /api/price-behavior?token=BIO&chainId=8453` or `GET /api/price-behavior/:symbol` for frontend and agent.
- **Agent (existing `backend/agent.js`)**:
  - New **intent** (e.g. `price_behavior`) and **tool**: detect queries about “price behavior,” “ATH,” “ATL,” “drawdown,” “how has X token performed.”
  - On trigger, call the price-behavior service (or HTTP endpoint) with token/chain from context or parsed from message.
  - Inject a short **summary** into the agent’s tool output (e.g. “Token X is 35% below ATH; range suggests medium-high vol; consider conservative LTV”) so the LLM can answer in natural language and suggest next steps (e.g. borrow flow, pool choice).

### 2.5 Data flow

1. **User or frontend** asks: “How has BIO price behaved?” or “What’s the drawdown from ATH for my collateral?”
2. **Agent** classifies intent `price_behavior`, extracts token (and optional chain).
3. **Agent** calls price-behavior API or service → gets `{ price, ath, atl, drawdownBps, rangeRatio, suggestion }`.
4. **Agent** adds this to tool context and LLM reply: e.g. “BIO is about 40% below its all-time high; historical range suggests medium volatility. For borrowing, the protocol may apply a more conservative LTV when ATH/ATL are set.”
5. **On-chain**: If governance has set `tokenPriceBounds` for that token, `ValuationEngine.computeDPV` already uses ATH/ATL for drawdown and range-based adjustment; the agent’s message can state that “on-chain valuation already reflects price history for this token.”

---

## 3. Implementation checklist

- [ ] **Oracles**
  - [ ] Document which chains use Chainlink vs Pyth for spot (done in this doc).
  - [ ] Add Chainlink Historical and/or Pyth Benchmarks to backend for ATH/ATL derivation (or deploy/indexer).
  - [ ] Optional: second spot source for deviation check (see SECURITY_ORACLES_AND_PARAMETERS).
- [ ] **ValuationEngine**
  - [ ] Optional per-token ATH/ATL storage and `setTokenPriceBounds` (or equivalent).
  - [ ] In `computeDPV`, when bounds are set: apply drawdown discount and range-based vol (see RISK_MODELS § 2.5).
- [ ] **Price-behavior service**
  - [ ] Module that fetches spot + ATH/ATL and returns drawdown, range, suggestion.
  - [ ] API route for frontend and agent.
- [ ] **Agent**
  - [ ] Intent and tool for price-behavior queries; call price-behavior service and inject summary into answers.
- [x] **Docs**
  - [x] RISK_MODELS.md § 2.5 (price history).
  - [x] SECURITY_ORACLES_AND_PARAMETERS.md — ATH/ATL checklist item.
  - [x] CONTRACTS.md — ValuationEngine ATH/ATL reference.
  - [x] This doc — reference from CONTRACTS.

---

## 4. Related docs

- **Risk and ATH/ATL formulas**: `RISK_MODELS.md` (§ Price history: all-time high and all-time low).
- **Oracle security**: `SECURITY_ORACLES_AND_PARAMETERS.md`.
- **Interest and pool lifecycle**: `INTEREST_RATES_AND_POOL_LIFECYCLE.md`.
- **Contracts**: `CONTRACTS.md` (ValuationEngine, LendingPool).
