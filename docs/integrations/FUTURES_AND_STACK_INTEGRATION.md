# Adding Futures Contracts to the Vestra Stack

This doc outlines how **futures** (perpetual or expiry) can be added to Vestra for hedging, better liquidation, and optional product extensions. It assumes the current stack: Solidity core (VestingAdapter, ValuationEngine, LendingPool, LoanManager), Uniswap v3 for liquidation, oracles (Chainlink, Pyth), and React/Vite frontend.

---

## 1. Why Futures Fit Vestra

| Use case | Benefit |
|----------|---------|
| **Borrower/lender hedging** | Lock in unlock-date price: e.g. short perp or buy put-like exposure so at unlock, token price move doesn’t blow out the loan or pool. |
| **Liquidation path** | When spot is illiquid (risk #8 in [RISKS_GAPS_AND_GAMIFICATION.md](../risk/RISKS_GAPS_AND_GAMIFICATION.md)), routing default collateral via perp/futures (e.g. short perp + buy spot to cover, or sell expiry future) can improve recovery vs. single DEX path. |
| **DPV / risk** | Optional use of futures basis or funding as a signal for volatility/demand (e.g. in discount curve or LTV). |
| **Product** | “Unlock-date futures” or perp on the same underlying tokens as collateral (partner or integrate with existing perp venues). |

---

## 2. Integration vs. Native Contracts

- **Integration (recommended first)**: Use **existing** perp/futures protocols (e.g. dYdX v4, GMX, Hyperliquid, Vertex, or CEX APIs for analytics). No new core “futures contract” in Vestra; add oracles, backend, and frontend that talk to these venues.
- **Native**: Run or clear your own perp/futures markets. Much heavier (margins, liquidations, risk engine). Only consider later if you need a custom “unlock-date” product that no one else offers.

Below we assume **integration** only.

---

## 3. Stack Additions (Concrete)

### 3.1 Smart contracts (optional, minimal)

- **Keep current behavior**: `LoanManager._liquidate()` continues to use Uniswap only; no change required to “add futures” for hedging (hedging is off-chain or on the perp venue).
- **Optional: configurable liquidation path**  
  - Introduce an abstract `ILiquidationRouter`: `liquidate(token, amount) → usdcReceived`.  
  - Implementations: (1) current Uniswap path; (2) “Futures-assisted” path: a **keeper** (or a dedicated contract that calls a perp protocol) shorts perp, then buys spot to deliver, and returns USDC to the protocol. The contract side can be a thin adapter that the keeper calls after executing the hedge on the perp venue.  
  - This improves recovery when spot is illiquid without replacing Uniswap for liquid tokens.

No new “futures contract” in the core protocol; the new piece is an optional **liquidation strategy** that may use external perp/futures protocols.

### 3.2 Oracles and data

- **Price**: You already have spot from Chainlink/Pyth. For perp-based logic (e.g. basis-aware LTV or hedging UI), add:
  - Perp index/mark price and (if available) funding from the same or another oracle or off-chain API.
- **Volatility / basis**: If you want DPV or LTV to depend on perp basis, feed “basis” or “funding rate” into your risk model (e.g. in [CRDT.md](../token-and-governance/CRDT.md) / [RISK_MODELS.md](../risk/RISK_MODELS.md)) as an optional input, with governance-controlled weight.

### 3.3 Backend

- **Futures API client**: Connect to one or more perp/futures venues (dYdX, GMX, Hyperliquid, etc.) for:
  - Mark/index price and funding.
  - Optional: order placement for **protocol hedging** (e.g. when a large default is pending, hedge before unlock).
- **Hedging service (optional)**:
  - At settlement time, for large defaults, compute notional to hedge and (if you have keeper/treasury execution) place short perp or sell expiry futures, then buy spot to repay pool; or document “recommended hedge size” for manual execution.
- **Analytics**: Store or expose perp/futures data (price, open interest, funding) for dashboards and risk views.

### 3.4 Frontend

- **“Hedge your unlock”**:  
  - Show users they can hedge their vesting exposure (e.g. “Short [TOKEN] perp on dYdX/GMX to lock in a price”).  
  - Link to integrated perp platform or embed widget/iframe if the venue supports it; no need to build your own order book.
- **Lender / risk view**: Optional “Unlock risk” view using perp data (e.g. funding, open interest) for tokens you have as collateral.

### 3.5 Docs and governance

- **Docs**: Reference this doc from TECHNICAL_SPEC, CONTRACTS, and RISK_MODELS; add a short “Hedging and futures” section to the litepaper/whitepaper if you offer the product.
- **Governance**: If you add basis/funding into DPV or LTV, define who can set weights and data sources (e.g. risk committee, timelock).

---

## 4. Implementation Order

1. **Phase 1 (no contract change)**  
   - Backend: Perp/futures price (and optionally funding) API; expose in your existing API.  
   - Frontend: “Hedge your unlock” CTA and link to a chosen perp venue.  
   - Docs: Add “Hedging with perps” to user-facing and internal docs.

2. **Phase 2 (optional)**  
   - Use perp/funding data in risk analytics or DPV (off-chain first).  
   - Optional keeper: at default settlement, use perp to improve execution for large, illiquid collateral (with clear operational runbook).

3. **Phase 3 (optional)**  
   - Abstract `ILiquidationRouter` and a “futures-assisted” liquidation path; keep Uniswap as default.  
   - Only if you need on-chain, protocol-executed hedging or multiple liquidation venues.

---

## 5. Summary

- **You don’t need a new “futures contract” in your core stack.** You add **futures via integration**: oracles/APIs, backend client, optional liquidation path, and frontend “hedge your unlock” and risk views.
- **Contracts**: Optional `ILiquidationRouter` + futures-assisted implementation (keeper or adapter) for better default recovery on illiquid collateral.
- **Backend**: Perp/futures API client and optional hedging/analytics service.
- **Frontend**: Hedging CTA and, if useful, perp-based risk metrics.
- **Product**: Start with user-directed hedging and optional protocol-side use of perp data; add protocol-executed hedging or custom “unlock-date” futures only if justified by demand and risk.

This keeps your core (VestingAdapter, ValuationEngine, LendingPool, LoanManager) unchanged while layering futures in as a **complement** for risk and UX.
