# CRDT Borrow Flow Wireframes — 2030 Edition
Date: January 28, 2030  
Scope: Guided, conservative borrow journey with time-based metaphors.

This flow is intentionally deliberate to reinforce transparency, vesting integrity, and conservative risk modeling. It replaces "one-click leverage" with a clear, auditable path.

## Overview
Four stages:
1) Select & Escrow Position  
2) Risk & Valuation Preview  
3) Loan Terms & Confirmation  
4) Post-Borrow Summary & Monitoring

Visual style
- Background: deep blue → graphite gradient with faint holographic grid.
- Primary accent: silver glow on interactive elements.
- Risk indicators: red/orange pulses at conservative limits.
- Animations: elements phase in from locked vaults; timelines flow left-to-right.

## 1) Step 1 — Select & Escrow Position
Full-screen immersive view with left navigation, center vaults, and AI assistant.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| Header: "Borrow Against Your Locked Assets"               |
| Sub: "Step 1/4 – Choose vesting position to escrow"       |
+-----------------------------------------------------------+
| Left Panel (20%)        | Central Area (60%)              | Right Panel (20%) |
|                         |                                 |                   |
| Your Vested Positions   | [Holographic Vault Carousel]    | AI Assistant      |
| • Position #1           |                                 | "Which position   |
|   TOK – 1,000 @ $10     |   Vault 1 (active)              | would you like    |
|   Unlock: 6 months      |   [3D spinning token model]     | to borrow        |
|   Claimable: $10,000    |   TOK token icon + quantity     | against?"         |
| • Position #2           |   Countdown hologram: 183 days  | [Voice input]     |
|   ...                   |                                 |                   |
| [Refresh] [Filter by chain] | [Escrow Button: silver]     |                   |
+-----------------------------------------------------------+
| Footer: "Only non-transferable vesting positions appear"  |
+-----------------------------------------------------------+

Key interactions
- Tap/voice-select a vault; it expands and glows silver.
- "Escrow" triggers biometric/neural confirmation.
- Vault locks into protocol with particle flow animation.
- AI explains: escrowing preserves vesting integrity.

## 2) Step 2 — Risk & Valuation Preview
Selected vault centers; timeline appears with Monte Carlo paths.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| Header: "Step 2/4 – Valuation & Risk Assessment"          |
+-----------------------------------------------------------+
| Left (30%)              | Center (40%)                    | Right (30%)       |
|                         |                                 |                   |
| Current Market Data     | [Large 3D Risk Timeline]        | Conservative      |
| Price: $10.23 (Oracle)  |                                 | Assumptions       |
| Volatility (30d): 48%   |   Now ─── 6 months ─── Unlock   | • r = 5%          |
| Implied Vol: 55%        |   [Animated Monte Carlo paths]  | • σ = 50%         |
|                         |   Green band = mean             | • Liquidity 90%   |
| Discount Breakdown      |   Red band = 5th percentile     | • Shock 95%       |
| Time discount: 97.5%    |   PV line drops gradually       |                   |
| Vol penalty: 64.6%      |                                 | AI Insight        |
| Composite D: 62.4%      | [Toggle: Deterministic vs MC]   | "95% chance PV ≥  |
| Estimated PV: $6,240    |                                 | $5,800"           |
| Max LTV: 35%            |                                 |                   |
| Borrow Cap: $2,184      |                                 |                   |
+-----------------------------------------------------------+
| Footer: "Uses Chainlink oracles + Monte Carlo calibration"|
+-----------------------------------------------------------+

Key interactions
- Scrub timeline to preview PV changes.
- Toggle deterministic vs Monte Carlo view.
- Red zones highlight unlock supply shocks.
- AI offers identity-linked LTV boost (opt-in).

## 3) Step 3 — Loan Terms & Confirmation
Focused confirmation screen with conservative limits.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| Header: "Step 3/4 – Set Loan Terms"                       |
+-----------------------------------------------------------+
| Center Column                                             |
|                                                           |
| [Large Vault in background – semi-transparent]            |
|                                                           |
| Borrow Amount Slider                                      |
| $0 ─────────────────────────── $2,184 (max)               |
| Current: $1,800                                           |
|                                                           |
| Interest Rate Preview: 10.2% APR                          |
| Estimated Interest (6 months): $91.80                     |
|                                                           |
| Repayment Options                                         |
| • At unlock (default)                                     |
| • Partial anytime                                         |
| • Full early (no penalty)                                 |
|                                                           |
| [Identity Boost Toggle – if linked]                       |
|   → LTV +5% | Rate -0.8%   [On/Off]                      |
|                                                           |
| [Big Silver Confirm Button: "Create Loan"]                |
| [Biometric / Voice / Neural Confirm Prompt]               |
+-----------------------------------------------------------+
| Left: Risk Summary (mini-gauge) | Right: Settlement Preview |
|                                 | • Full repay → release   |
|                                 | • Partial → partial seize |
|                                 | • Default → liquidation  |
+-----------------------------------------------------------+

Key interactions
- Slider snaps to conservative cap.
- Identity toggle increases max borrow with clear disclosure.
- Confirm triggers vault seal animation + transaction broadcast.

## 4) Step 4 — Post-Borrow Summary & Monitoring
Returns to dashboard with new loan card highlighted.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| [Success Hologram: "Loan Created – $1,800 USDC received"] |
| Transaction Hash [copy] | View on Basescan                |
+-----------------------------------------------------------+
| Updated Dashboard Card (highlighted silver border)        |
| Active Loan #42                                           |
| Borrowed: $1,800                                          |
| Collateral: 1,000 TOK (escrowed)                          |
| Interest Accrued: $0.12/hour                              |
| Time to Settlement: 182 days [Countdown]                  |
| Current Debt: $1,800 + accrued                            |
| [Repay Button] [View Risk Sim]                            |
+-----------------------------------------------------------+
| AI Message: "Loan issued. Repay anytime. Settlement is    |
| automatic at unlock timestamp."                           |
+-----------------------------------------------------------+

Key interactions
- Card links to detailed loan view with real-time accrual clock.
- Notifications for interest milestones and risk alerts.

## Whitepaper Alignment
- Non-custodial escrow and vesting integrity reinforced.
- Conservative DPV with explicit discount breakdown.
- Loan lifecycle made explicit at each stage.
- Optional identity-linked credit improvements are opt-in.

## Implementation Notes
- React + Vite base; Three.js for 3D; WebXR for AR.
- Wagmi/Viem for on-chain reads; The Graph for indexing.
- Start with 2D prototype; upgrade to immersive mode.

