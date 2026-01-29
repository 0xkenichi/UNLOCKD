# CRDT Repay Flow Wireframes — 2030 Edition
Date: January 28, 2030  
Scope: Transparent, conservative repayment with real-time accrual and settlement impact.

The repay journey emphasizes clarity, time awareness, and enforcement logic. Users see precise accrual, conservative settlement outcomes, and explicit impact on vesting release.

## Overview
Three stages:
1) View Active Loan & Accrual Status  
2) Choose & Execute Repayment  
3) Confirmation & Updated Position

Style notes
- Background: subtle graphite gradient with faint ticking clock particles.
- Active debt elements pulse gently in silver.
- Risk previews: red/orange for default exposure, green for full repay.
- Animations: debt balance decreases via flowing particles; timeline updates.

## 1) Step 1 — View Active Loan & Accrual Status
Entry from dashboard card or sidebar. Focus on real-time debt clarity.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| Header: "Repay Your Active Loan"                          |
| Sub: "Loan #42 – Borrowed $1,800 USDC"                    |
+-----------------------------------------------------------+
| Left Panel (30%)          | Center (40%)                  | Right Panel (30%) |
|                           |                               |                   |
| Loan Summary              | [Large Holographic Debt Clock]| Settlement Simulator
| • Borrowed: $1,800        |                               | (Real-time preview)
| • Current Debt: $1,912.45 | [Big Silver Number: $1,912.45]| • Full Repay → Release
|   (accrued +$112.45)      | Interest ticking upward       | • Partial → Partial seize
| • Interest Rate: 10.2% APR| Small line: daily accrual     | • Remaining Debt → Higher risk
| • Utilization Impact: Low |                               |                   |
| • Time to Unlock: 182 days| [Countdown Hologram]          | AI Insight:
|                           | Timeline: Now ────── Unlock   | "Repaying now reduces
| Collateral Locked         |                               | default probability by
| • 1,000 TOK (escrowed)    |                               | 68% at current vol"
| • Current Value: $10,230  |                               |                   |
| • DPV: $6,240             |                               |                   |
|                           |                               |                   |
| [Repay Now Button: large silver]                          |                   |
+-----------------------------------------------------------+
| Footer: "Interest accrues continuously. Settlement is automatic at unlock." |
+-----------------------------------------------------------+

Key interactions
- Debt clock updates from `block.timestamp`.
- "Show interest breakdown" expands accrual math.
- AI suggests partial repay that ensures full release.

## 2) Step 2 — Choose & Execute Repayment
Focused input with settlement impact preview.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| Header: "Step 1/2 – Choose Repayment Amount"              |
+-----------------------------------------------------------+
| Center Column (focused)                                   |
|                                                           |
| [Background: semi-transparent vault with locked TOK]      |
|                                                           |
| Repayment Slider / Input                                  |
| $0 ──────────────────────── $1,912.45 (full debt)         |
| Current: $500                                             |
|                                                           |
| Repayment Impact Preview (mini 3D gauge)                  |
| • New Debt After Repay: $1,412.45                         |
| • Remaining Collateral Risk: Medium (orange)              |
| • Settlement Outcome: Partial seizure expected            |
|                                                           |
| Payment Method                                            |
| • USDC Balance: $2,345.67 [Max]                           |
| • [Approve & Repay Button: large silver]                  |
|   (Biometric / Voice / Neural Confirm)                    |
|                                                           |
| [Alternative: Partial Repay at Unlock Toggle]             |
+-----------------------------------------------------------+
| Left: Current Debt Breakdown      | Right: Quick Options  |
| • Principal: $1,800               | • Pay $500            |
| • Accrued Interest: $112.45       | • Pay to Full Release |
| • Protocol Fee (if any): $0       | • Pay Minimum to Lower Risk |
+-----------------------------------------------------------+

Key interactions
- Slider snaps to meaningful points (full release, minimum risk).
- "Pay to Full Release" sets exact payoff amount.
- Confirmation requires biometric/voice.
- Vault opens slightly in animation to signal partial release.

## 3) Step 3 — Confirmation & Updated Position
Success overlay and updated loan card.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| [Success Hologram Overlay]                                |
| "Repayment Successful"                                    |
| Amount: $500 USDC                                         |
| New Debt: $1,412.45                                       |
| Transaction Hash [copy] | View on Explorer                |
+-----------------------------------------------------------+
| Updated Loan Card (highlighted green border)              |
| Active Loan #42                                           |
| Borrowed: $1,800                                          |
| Repaid: $500                                              |
| Current Debt: $1,412.45                                   |
| Interest Accrued: $0.08/hour                              |
| Time to Settlement: 181 days [Countdown]                  |
| Settlement Path: Partial seizure expected (improved)      |
| [View Full Timeline] [Repay More]                         |
+-----------------------------------------------------------+
| AI Message:                                               |
| "Repayment recorded. Default risk has decreased."         |
+-----------------------------------------------------------+

Key interactions
- Loan card links to repayment history and interest curve.
- Push notification on updated settlement projection.
- "Repay More" loops back to Step 2.

## Whitepaper Alignment
- Reinforces loan lifecycle and enforcement at unlock.
- Transparent accrual and settlement outcomes at each step.
- No aggressive defaults; conservative and explicit.

## Implementation Notes
- React + Vite; Three.js for 3D; WebXR for AR overlays.
- Wagmi/Viem for debt reads; writeContract for repayments.
- Start with 2D prototype, add immersive effects later.

