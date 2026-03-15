# Security Oracles and Parameters: Mitigating Expert Attackers

**Purpose:** Define oracle security controls and risk parameters that close loopholes targeted by sophisticated actors (flash-loan manipulation, wrong-feed abuse, governance bypass, settlement/liquidation gaming). Use for Risk Committee parameter policy, audit scoping, and red-team checks.

**Related:** `RISKS_GAPS_AND_GAMIFICATION.md` (attack vectors), `REMEDIATION_AND_STAYING_AHEAD.md` (resolution matrix), `RISK_COMMITTEE_CHARTER.md` (governance), `FOUNDER_INSIDER_RISK_AND_FLAGGING.md` (insider/wallet flagging).

---

## 1. Threat Model: What Experts Target

| Attacker goal | Typical vector | Mitigation layer |
|---------------|----------------|------------------|
| Inflate collateral value at borrow | Flash-loan or coordinated pump → borrow at high LTV → price reverts | Staleness + deviation + circuit breaker; LTV and max-borrow caps |
| Use wrong price for an asset | List token without dedicated feed → fallback to default (wrong) feed | Token-specific feed required per listed collateral; no fallback for unknown tokens |
| Stale price = stale LTV | Delayed or stuck feed → DPV/max borrow from old price | `maxPriceAge` enforced; reject valuation if `updatedAt` too old |
| Unlock supply shock | Large unlock → price dumps at settlement → protocol seizes at low value | Unlock-impact discount parameter; concentration/size limits per token |
| Illiquid collateral default | Borrow at max LTV → don’t repay → protocol sells into thin market | Per-token LTV/size limits; min liquidity or depth check; conservative `minOut` |
| Governance/oracle takeover | Single key or bypass timelock → malicious feed or params | Multisig + timelock always on for mainnet; param changes require rationale + simulation |
| Founder/insider pump–dump | Insider pumps token → high DPV/loan → dumps at repay → we liquidate at a loss | Know counterparty: internal wallet–token flagging; insider-aware LTV/caps; cohort alerts (multiple same-protocol exits). See **`docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md`**. |

---

## 2. Oracle Security Layer

### 2.1 Staleness (implemented)

- **Parameter:** `maxPriceAge` (e.g. 1 hour in `ValuationEngine`).
- **Rule:** Reject any valuation where `block.timestamp - updatedAt > maxPriceAge`.
- **Loophole closed:** Using a delayed or stuck feed to get a favorable (stale) price.
- **Recommendation:** Keep configurable per chain; document in RISK_MODELS. Risk Committee owns the value.

### 2.2 Token-specific feeds (implemented)

- **Mechanism:** `tokenPriceFeeds[token]` in ValuationEngine; use token feed when set.
- **Rule:** For production, **require** a token-specific feed for every listed collateral; do not allow “default feed only” for new assets.
- **Loophole closed:** Listing an unknown token and getting valuation from a wrong (default) feed.
- **Recommendation:** Enforce in deployment/ops: no collateral listing without explicit feed; document in CONTRACTS.

### 2.3 Deviation and circuit breaker (to add / document)

- **Deviation:** Compare primary oracle price to a reference (e.g. TWAP or secondary oracle). If deviation exceeds threshold (e.g. 5–10% in 1h), reject valuation or use conservative bound.
- **Circuit breaker:** If price move in a short window exceeds a cap (e.g. >20% in 1h), pause new borrows or use last-known-good price until validated.
- **Loophole closed:** Flash-loan or short-lived pump/dump that slips past staleness; caps impact even when it can’t be fully eliminated.
- **Reference:** CRDT.md “Oracle Safeguards”; REMEDIATION sprint B4.

### 2.4 Secondary source (optional)

- Use a second oracle (e.g. Pyth or TWAP) as sanity check or fallback when primary is stale or in deviation.
- Document trust assumptions and failure modes for each source (RISK_COMMITTEE_CHARTER: “Third-party trust”).

---

## 3. Risk Parameters That Cap Loophole Impact

Even if an expert temporarily manipulates price or exploits a gap, these parameters bound the damage:

| Parameter | Role | Loophole mitigated |
|-----------|------|--------------------|
| **LTV cap** | Max borrow = DPV × LTV (e.g. 20–40%). | Limits upside of inflating DPV once; keeps debt below collateral value at issuance under normal oracle behavior. |
| **Max borrow per loan / per token** | Hard cap on principal per loan or per collateral type. | Caps single-position and single-token exposure from wrong/stale price or illiquid default. |
| **maxPriceAge** | Reject stale prices. | Prevents using old, favorable price from delayed feed. |
| **Unlock-impact discount** | Extra discount when large % of supply unlocks (e.g. >5% at once). | Reduces DPV for high-unlock events so protocol doesn’t lend assuming pre-dump price. |
| **Volatility (sigma)** | Higher vol → larger discount → lower DPV. | Conservative vol assumption limits overvaluation when vol is actually higher. |
| **Liquidation minOut / slippage** | Minimum output (e.g. USDC) on default sale; per-pool or per-token. | Limits loss when selling illiquid collateral; document policy per pool (REMEDIATION). |
| **Per-token eligibility** | Whitelist + token-specific feed + optional liquidity/depth check. | Prevents “unknown token + wrong feed” and extreme illiquidity. |
| **Insider-aware LTV or caps** | For flagged wallet–token pairs (founder/team/insider): lower LTV or lower max borrow (policy). | Caps damage when counterparty can move price; used together with internal flagging. See **`docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md`**. |

---

## 4. Governance and Operational Hardening

- **Timelock:** All critical oracle and risk param changes (e.g. `setPriceFeed`, `setTokenPriceFeed`, `setMaxPriceAge`, `setVolatility`, LTV-related) go through queue/execute with a delay (e.g. ≥24h mainnet). No bypass for “routine” updates (SECURITY.md).
- **Multisig:** Owner of ValuationEngine, LoanManager, LendingPool, VestingAdapter is a multisig; document in DEPLOYMENT and CONTRACTS.
- **Parameter change process:** Every change has rationale + simulation + Risk Committee visibility (RISK_COMMITTEE_CHARTER); link to proposal or doc in process/CI where feasible (REMEDIATION C3).
- **Emergency:** Oracle failure or extreme deviation triggers pause/tighten and disable affected oracle routes; post-incident review within 72h (RISK_COMMITTEE_CHARTER).

---

## 5. Red-Team / “Expert Loophole” Checklist

Use this when reviewing new collateral, new oracles, or parameter changes:

- [ ] **Price source:** Is there a token-specific feed? Is fallback for this asset disabled or conservative?
- [ ] **Staleness:** Is `maxPriceAge` enforced at valuation and at loan issuance/settlement? What if the feed is stuck?
- [ ] **Spike:** What if price moves 20%+ in 1 hour—do we reject, cap, or circuit-break?
- [ ] **Price history (ATH/ATL):** If the protocol factors all-time high and all-time low into DPV/LTV (see RISK_MODELS.md § Price history), is the ATH/ATL source defined, staleness bounded, and manipulation resistance (e.g. min observations, sanity bounds) documented?
- [ ] **Unlock impact:** For this token, is there a scheduled large unlock? Is unlock-impact discount or size limit in place?
- [ ] **Liquidity:** If we had to sell this collateral at unlock, what slippage/minOut do we assume? Is it documented and enforced?
- [ ] **Governance:** Can one key change oracle or LTV? Is timelock always on and multisig in place?
- [ ] **Invariants:** Do we have tests (and ideally fuzz) for “debt ≤ collateral value at issuance” and settlement balance conservation under oracle failure?
- [ ] **Insider:** Do we know if this counterparty is a founder/team/insider for this token? Do we flag and apply insider-aware LTV/caps or cohort alerts? See **`docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md`**.

---

## 6. Summary

- **Oracles:** Enforce staleness (`maxPriceAge`), require token-specific feeds for listed collateral, add deviation check and circuit breaker where feasible, document in RISK_MODELS.
- **Parameters:** LTV cap, max borrow, unlock-impact discount, volatility, liquidation minOut, per-token eligibility, and (when used) price history (ATH/ATL) and drawdown caps bound the impact of price manipulation and illiquid default. See RISK_MODELS.md § Price history for ATH/ATL usage.
- **Governance:** Timelock + multisig for all oracle and risk param changes; every change has rationale and Risk Committee visibility; emergency path for oracle failure with post-incident review.
- **Staying ahead:** Run the red-team checklist on new assets and param changes; keep `RISKS_GAPS_AND_GAMIFICATION.md` and `REMEDIATION_AND_STAYING_AHEAD.md` updated and linked from this doc and the Risk Committee Charter. For founder/insider and wallet–token flagging, see **`docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md`**.
