# CRDT Interactive Prototyping Guide (2026–2030)
Date: January 28, 2030  
Purpose: Turn wireframes into clickable, testable flows for demos and UX validation.

This guide maps the CRDT dashboard/borrow/repay/identity flows into interactive prototypes using modern tools. It prioritizes speed-to-demo while preserving the institutional tone and conservative risk emphasis.

## Recommended Tooling Path (Practical)
1) **Figma** for fast, collaborative clickable prototypes.  
2) **Framer** for immersive motion/3D polish.  
3) **ProtoPie** for sensor-like micro-interactions (gesture/biometric).

## Prototype Scope (Minimum Viable Clickable)
Start with a tight flow:
- Dashboard → Borrow Step 1 → Step 2 → Step 3 → Success
- Dashboard → Active Loan → Repay Step 1 → Step 2 → Success
- Dashboard → Identity Opt‑In → Benefit Preview

## Figma Setup (Fast Start)
Create a file: `CRDT 2030 Prototypes`

Frames to build:
- Dashboard (Desktop + Mobile)
- Borrow Step 1 / 2 / 3 / 4
- Repay Step 1 / 2 / 3
- Identity Opt‑In
- Wallet Connect Modal

Prototype connections:
- Dashboard → Borrow Step 1 (click “Borrow”)
- Borrow Step 1 → Step 2 (click “Escrow”)
- Step 2 → Step 3 (click “Continue”)
- Step 3 → Step 4 (click “Create Loan”)
- Dashboard → Repay Step 1 (click active loan card)
- Repay Step 1 → Step 2 (click “Repay Now”)
- Repay Step 2 → Step 3 (click “Approve & Repay”)
- Dashboard → Identity Opt‑In (click “Identity”)

Interaction notes:
- Hover overlays for DPV breakdown and risk warnings.
- After‑delay animations for countdown clocks.
- Variables for slider values (borrow amount / repay amount).
- Component variants for Monte Carlo chart states.

## Framer Enhancement (Immersive Layer)
Import Figma frames into Framer and add:
- 3D timeline scrubber with glow and depth.
- Vault card parallax on hover.
- Particle unlock animations on confirm.

## ProtoPie (High‑Fidelity Micro‑Interactions)
Use for:
- Gesture swipe repay.
- Biometric “confirm” pulse.
- Voice command triggers (mocked).

## Test Plan (Lightweight)
Run quick user tests:
- Can users find their active loan quickly?
- Do they understand DPV vs LTV?
- Do risk warnings change behavior?

## Next Assets to Create
- Figma component library (buttons, sliders, cards, gauge).
- Icon set (lock, timeline, chain, credit stream).
- Motion spec: easing curves and response times.

