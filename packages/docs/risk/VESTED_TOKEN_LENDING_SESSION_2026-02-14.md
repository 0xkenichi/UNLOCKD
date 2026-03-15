# Vested Token Lending Risks — Session Summary & Build Plan

**Date:** 2026-02-14  
**Participants:** Seun Gbiri, kenichi  
**Purpose:** Map key points from the call, link to existing docs, and plan what to build or adapt.

---

## 1. Session Summary: Key Points

### 1.1 DPV and Information Asymmetry (Seun)

- **Insiders have information the protocol doesn’t.** Founders/team know unlock timing, fundraising, and exit plans.
- **DPV is easy to manipulate.** Small moves (e.g. 5%) in the inputs can materially change borrow capacity. Example: ~$1M vested, 30% discount → ~$250k loan; if they engineer a 40% dip before borrowing, they lock in a loan at depressed valuation, then price can recover (or they exit anyway).
- **We should not rely on the “favorable” case** (e.g. they dump before borrow so we lend less). Design for the unfavorable case: pump-then-borrow, dump-at-repay, or tank-then-borrow to lock in terms at a chosen point in the cycle.
- **Already covered:** `FOUNDER_INSIDER_RISK_AND_FLAGGING.md` (pump before borrow, dump at repay, “we don’t rely on favorable case”). **Add:** Explicit note that tank-before-borrow is a timing/manipulation vector; DPV at borrow still protects us (we lend less), but monitor for systematic patterns and consider time-weighted or TWAP-style inputs where feasible.

### 1.2 Privacy vs. Lender Risk — Correlated Exits (Seun)

- **Privacy is important:** Don’t reveal “founders exited” to the market or DAO.
- **Problem:** If multiple team members sell/borrow against vested contracts at the same time (and unlocks align), the token can dump. Lenders in **different pools** don’t see each other’s exposure — so Pool A and Pool B might both hold claim rights on the same token from the same team; correlated exit → price drop → both pools take losses.
- **Implication:** Need to **limit lending concentration** per token and per unlock (at least per pool, ideally protocol-wide) so we don’t accumulate too much exposure to one token’s unlock or one cohort exiting together.
- **Already covered:** `FOUNDER_INSIDER_RISK_AND_FLAGGING.md` (cohort alert, token-level concentration). **Gap:** Explicit **per-pool and per-token concentration caps** (max exposure to a given token / unlock window); protocol-level aggregate view for risk (internal only).

### 1.3 Adverse Selection — Vesting Not On-Chain (Seun)

- **VCs and many insiders don’t always use visible vesting.** You won’t see all VC vested contracts on Sablier or similar; a lot is OTC. So “we see 10% vesting on-chain” can understate true supply and exit risk.
- **Lenders are the backbone;** we need to protect them. Need a **better way to query the chain** for the “right” kind of token/vesting (discovery, filters by type/source) and to **document the limitation**: we cannot see OTC or off-chain agreements; disclose to lenders that on-chain vesting may be incomplete.

### 1.4 Claim Rights / Marketplace and Auction (Seun + Kenichi)

- **Scenario:** Borrower borrows 50% of max capacity against a contract. Lender holds claim rights. Can the **lender** sell or auction those claim rights (e.g. “I don’t want this loan anymore, I want to sell the claim rights”)?
- **Need:** A clear mechanism (or policy) for **transfer or sale of claim rights** (or auction of the loan/collateral claim). Rules: e.g. only when loan is in good standing; or auction the claim at unlock; prevent auctioning in a way that leaves the protocol with inconsistent state.
- **Kenichi:** Auction feature is on the roadmap (“lot of comma”); shared diagram on Discord. **Doc:** `CLAIM_RIGHTS_WRAPPERS.md` describes wrappers; add **claim-rights transfer / secondary market / auction** as a planned feature and capture constraints (e.g. no auction that violates loan state or lender obligations).

### 1.5 Interest Rates vs. General Market (Seun)

- **Pool rates must be competitive.** If the “general market” (e.g. staking USDC) yields 7%, our **borrow rate floor** should be at least 7% — otherwise why would a lender deploy here?
- **Sector benchmark:** For vested / lockup lending (e.g. 6–12 months), industry is around **10%**. Pools should target at least that so lenders are fairly compensated for lockup and risk.
- **Volatility and diversification:** Can’t just lend to one asset; need to **diversify the pool** and consider volatility of the pool itself.
- **Already covered:** `risk/INTEREST_RATES_AND_POOL_LIFECYCLE.md` (utilization-based tiers, 12–26% in doc). **Add:** Document **rate floor from general market** (e.g. 7%) and **vested-lending benchmark** (~10%) as design constraints; ensure pool configs and governance can enforce a minimum floor.

### 1.6 Concentration Limits — Unlock and Token (Seun)

- **Limit lending for token unlocks** in a given pool and for a given token at the same time. DPV alone is not enough given altcoin volatility; **lending has to be significant but bounded** to avoid large, correlated losses.
- **Already in docs:** `SECURITY_ORACLES_AND_PARAMETERS.md` (concentration/size limits per token); `FOUNDER_INSIDER_RISK_AND_FLAGGING.md` (token-level caution, cohort). **Build:** Explicit **per-pool and per-token caps** (e.g. max % of pool in one token, max exposure to one unlock window); implement or document in risk-parameter spec.

### 1.7 Tokenomics — When It Matters (Seun + Kenichi)

- **Kenichi:** 1B supply; 20% protocol liquidity reserve (like central bank reserve); fee share to create pools; tiers (low/balanced/high risk) with 85% to lenders, 12% treasury, 3% safety; fallback to treasury then 20% token allocation for bad loans / protocol health.
- **Seun:** Tokenomics is **not absolutely necessary yet**. Priority: get the **tech skeleton** and **parameters** right, make the product easy to use and adjustable; tokenomics fits when approaching VCs, ICO, or token sale — then fold in reserve, tiers, and allocation.
- **Action:** Keep tokenomics in `TOKENOMICS_FINAL.md` and CRDT docs; treat as **later phase**; ensure build plan focuses on **risk, rates, concentration, and claim-rights mechanics** first.

---

## 2. Mapping to Existing Docs

| Session point | Existing doc(s) | Gap / addition |
|---------------|------------------|-----------------|
| DPV manipulation, insider timing | `FOUNDER_INSIDER_RISK_AND_FLAGGING.md`, `RISKS_GAPS_AND_GAMIFICATION.md` | Add tank-before-borrow as a documented vector; state that DPV at borrow protects us but we monitor patterns. |
| Privacy vs correlated exit; lenders can’t see other pools | `FOUNDER_INSIDER_RISK_AND_FLAGGING.md`, `PRIVACY_MODEL.md` | Per-pool and per-token concentration caps; protocol-level (internal) aggregate exposure view. |
| Adverse selection; vesting not on-chain / OTC | (New) | Document limitation (we can’t see OTC); better vesting discovery and “profile” (query by type/source); lender-facing disclosure. |
| Claim rights sale / auction | `CLAIM_RIGHTS_WRAPPERS.md` | Add section: claim-rights transfer, secondary market, auction — planned feature; rules (e.g. loan state, no inconsistent auction). |
| Interest rate floor vs market; 10% vested benchmark | `risk/INTEREST_RATES_AND_POOL_LIFECYCLE.md` | Document floor (e.g. 7%) and sector benchmark (~10%); ensure governance/params can enforce. |
| Concentration per token/unlock | `SECURITY_ORACLES_AND_PARAMETERS.md`, `FOUNDER_INSIDER_RISK_AND_FLAGGING.md` | Explicit per-pool and per-token caps; implement or specify in risk-parameter spec. |
| Tokenomics timing | `TOKENOMICS_FINAL.md`, `token-and-governance/CRDT.md` | No doc change; prioritize “tech + parameters” in build order; tokenomics as later phase. |

---

## 3. Build and Adapt Plan

### 3.1 Documentation (quick wins)

| # | Action | Owner | Doc(s) |
|---|--------|--------|--------|
| D1 | Add “tank-before-borrow” and timing manipulation to founder/insider doc; note DPV at borrow still protects, add monitoring. | Risk / Eng | `FOUNDER_INSIDER_RISK_AND_FLAGGING.md` |
| D2 | Document **interest rate floor** (e.g. 7% vs general market) and **vested-lending benchmark** (~10%) in interest-rate doc; reference from pool/liquidity docs. | Risk / Product | `risk/INTEREST_RATES_AND_POOL_LIFECYCLE.md` |
| D3 | Add **adverse selection** section: OTC/off-chain vesting limitation, lender disclosure, and goal to improve on-chain vesting discovery (query by type/source). | Risk / Product | New subsection in `FOUNDER_INSIDER_RISK_AND_FLAGGING.md` or `risk/RISKS_GAPS_AND_GAMIFICATION.md`; or short `docs/risk/ADVERSE_SELECTION_AND_VESTING_DISCOVERY.md` |
| D4 | In claim-rights doc, add **claim-rights transfer / secondary market / auction**: planned feature; constraints (loan state, no inconsistent auction); link to auction/roadmap. | Product / Eng | `integrations/CLAIM_RIGHTS_WRAPPERS.md` |
| D5 | Specify **per-pool and per-token concentration caps** (max exposure to one token, optional max per unlock window) in security/oracles or risk-parameter doc. | Risk | `risk/SECURITY_ORACLES_AND_PARAMETERS.md` or risk-parameter spec |

### 3.2 Product / risk parameters

| # | Action | Owner | Notes |
|---|--------|--------|------|
| P1 | Define numerical **concentration limits**: e.g. max % of pool in one token, max borrows per token per unlock window (per pool and optionally global). | Risk Committee | Document in risk-parameter list; version and review quarterly. |
| P2 | Ensure **rate model** can enforce a **floor** (e.g. min 7% or 10% for vested) in pool config or governance. | Protocol / Risk | Check `LendingPool` / rate model; add min rate if missing; document in INTEREST_RATES_AND_POOL_LIFECYCLE. |
| P3 | **Cohort / concentration alerting:** When multiple same-protocol wallets (or same token) have loans in the same window, alert; consider tightening or pausing new borrows for that token. | Ops / Backend | Align with `FOUNDER_INSIDER_RISK_AND_FLAGGING.md` cohort alert; extend to “same token” concentration across pools (internal view). |

### 3.3 Build (backend / contracts)

| # | Action | Owner | Notes |
|---|--------|--------|------|
| B1 | **Concentration enforcement:** Per-pool and per-token caps (e.g. reject new borrow if pool would exceed X% in one token, or Y notional per token per unlock window). | Protocol / Backend | On-chain if pool state allows; else backend/oracle gating before `createLoan`. |
| B2 | **Vesting discovery:** Improve indexing/API to query vesting by type, source, protocol — “particular kind of token” for underwriting and risk. | Backend / Data | Feeds internal flagging and concentration view; document in adverse-selection doc. |
| B3 | **Claim-rights transfer / auction:** Design and (when prioritized) implement transfer or auction of claim rights (or loan + claim) with clear rules; avoid inconsistent state. | Product / Protocol | Link from CLAIM_RIGHTS_WRAPPERS; track in roadmap. |

### 3.4 Tokenomics (later phase)

| # | Action | Owner | Notes |
|---|--------|--------|------|
| T1 | Keep 20% liquidity reserve and tiered revenue split in docs; use when approaching VCs / token sale. | — | No immediate build; ensure README or roadmap states “tokenomics in later phase.” |

---

## 4. Priority Order (suggested)

1. **Doc updates** (D1–D5): Low effort; align team and risk committee.
2. **Concentration policy and alerts** (P1, P3, D5): Define caps and alerting so we can implement B1.
3. **Rate floor** (P2, D2): Ensure pools are competitive and documented.
4. **Adverse selection and discovery** (D3, B2): Document limitation, then improve discovery.
5. **Claim-rights transfer/auction** (D4, B3): Design and roadmap; implement when prioritized.
6. **Concentration enforcement in code** (B1): After P1 and D5 are agreed.

---

## 5. Related Docs

- **Founder/insider and flagging:** `docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md`
- **Risks and gamification:** `docs/risk/RISKS_GAPS_AND_GAMIFICATION.md`
- **Oracles and parameters:** `docs/risk/SECURITY_ORACLES_AND_PARAMETERS.md`
- **Interest rates and pool lifecycle:** `docs/risk/INTEREST_RATES_AND_POOL_LIFECYCLE.md`
- **Claim-rights wrappers:** `docs/integrations/CLAIM_RIGHTS_WRAPPERS.md`
- **Privacy:** `docs/protocol-design/PRIVACY_MODEL.md`
- **Tokenomics (later phase):** `docs/token-and-governance/TOKENOMICS_FINAL.md`, `docs/token-and-governance/CRDT.md`

---

---

## 6. Implementation status (first build pass)

- **Docs:** D1–D5 done (tank-before-borrow in FOUNDER_INSIDER; rate floor in INTEREST_RATES; adverse selection in RISKS_GAPS; claim-rights auction in CLAIM_RIGHTS_WRAPPERS; concentration in SECURITY_ORACLES).
- **Backend:** Concentration: `loan_token_exposure` table (migration 0007), `getLoanExposureByToken` / `upsertLoanTokenExposure` / `getExposureByTokenList`; quote flow respects `CONCENTRATION_MAX_USD_PER_TOKEN` (cap or no offers); admin `GET /api/admin/risk/concentration?token=`, `GET /api/admin/risk/concentration-alerts`. Vesting discovery: `GET /api/vesting/sources?chainId=&protocol=&limit=`. Rate floor: `MIN_INTEREST_BPS` env, applied in `getPoolInterestBps` and `buildPoolOffers`.
- **Backfill:** Populate `loan_token_exposure` from indexer events: **POST /api/admin/risk/backfill-concentration** (body or query: `limit`, `chain`; admin session required) or run **node backend/scripts/backfill-loan-token-exposure.js** (uses `BACKFILL_LIMIT`, `BACKFILL_CHAIN`, `RPC_URL`, `DEPLOYMENTS_NETWORK`). Backfill processes events in chronological order: LoanCreated → upsert exposure (token from chain if not in event); LoanRepaid / LoanSettled / LoanRepaidWithSwap → delete exposure for that loan.
- **Next:** Risk Committee to set numerical concentration limits (P1); claim-rights transfer/auction design (B3).

*Session notes transcribed and summarized; build plan is a living list and should be updated as items are completed or reprioritized.*
