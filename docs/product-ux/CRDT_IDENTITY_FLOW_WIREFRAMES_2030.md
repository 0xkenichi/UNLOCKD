# CRDT Identity Flow Wireframes — 2030 Edition
Date: January 28, 2030  
Scope: Optional, privacy‑preserving identity linking with zk‑proofs.

This flow is fully optional and non-coercive. It emphasizes zero-knowledge proofs, conservative disclosures, and clear incentives without forced KYC.

## Overview
Three stages:
1) Identity Overview & Opt‑In  
2) Link / Verify Identity Sources  
3) Confirmation & Enhanced Dashboard

Visual style
- Background: deep blue void with faint zk‑circuit patterns.
- Primary accent: silver holographic mask fragments.
- Privacy signals: green lock icons and "Zero‑Knowledge" badges.
- Animations: fragments orbit, then assemble on consent.

## 1) Step 1 — Identity Overview & Opt‑In
Accessed from profile icon, dashboard, or suggested in borrow/repay.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| Header: "Unlock Better Credit Terms"                      |
| Sub: "Optional – Link Identity for Higher Limits & Rates" |
+-----------------------------------------------------------+
| Left Panel (30%)          | Center (40%)                  | Right Panel (30%) |
|                           |                               |                   |
| Current Benefits          | [Central Holographic Mask]     | Why Link?         |
| • Credit Tier: Basic      | [Scattered Fragments Floating] | • +5–15% LTV       |
| • Max LTV: 30%            |  - ENS / DID icon              | • -1–3% Rate       |
| • Interest Rate: 12% APR  |  - Ceramic / zk‑credential     | • Persistent Rep   |
| • Cross‑wallet: No        |  - DAO badge                   | • No forced KYC    |
|                           |                               | • zk‑proofs only   |
| [Link Identity Button]    | [Grayed: "Fragments Unlinked"] | Privacy Guarantee |
| [Skip for Now]            |                               | "We never see your |
|                           |                               | full identity"     |
+-----------------------------------------------------------+
| Footer: "Optional. You can borrow anonymously anytime."   |
+-----------------------------------------------------------+

Key interactions
- Hover fragments to explain each credential.
- "Link Identity" triggers fragment‑gather animation.
- "Skip" returns to previous flow without penalty.

## 2) Step 2 — Link / Verify Identity Sources
Wizard-style selection with zk‑proof generation.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| Header: "Step 1/3 – Choose Identity Sources"              |
| Progress Bar: [•───────○───────○]                         |
+-----------------------------------------------------------+
| Center Column (focused)                                   |
|                                                           |
| [Holographic Mask – fragments orbiting]                   |
|                                                           |
| Available Sources (Selectable Cards)                      |
| • ENS Name [Connect]                                      |
| • Ceramic DID [Link]                                      |
| • DAO Membership Badge [zk‑Proof]                         |
| • Worldcoin / Gitcoin Passport [Optional]                 |
| • Regulated KYC Provider [Advanced]                       |
|                                                           |
| Selected: ENS + Ceramic [Green Check]                     |
|                                                           |
| Privacy Preview                                           |
| What we learn:                                            |
| • Consistent identity across wallets                      |
| • Credit history persists                                 |
| • No personal data stored on‑chain                        |
| What we do NOT learn:                                     |
| • Real name, email, location                              |
| • Full wallet transaction history                         |
| [Green Lock: "Zero‑Knowledge Proof"]                      |
|                                                           |
| [Generate zk‑Proof & Link]                                |
| [Back | Cancel]                                           |
+-----------------------------------------------------------+

Key interactions
- Selecting a source opens connect/proof flow.
- Each linked source snaps a fragment into the mask.
- Privacy preview updates in real time.
- zk‑proof action uses biometric/voice confirmation.

## 3) Step 3 — Confirmation & Enhanced Dashboard
Success overlay with benefits and updated profile status.

ASCII Wireframe (Desktop / Flat View)

+-----------------------------------------------------------+
| [Success Holographic Overlay – Mask Assembled]            |
| "Identity Linked Successfully"                            |
| Credit Tier: Premium                                      |
| Benefits Activated:                                       |
| • Max LTV increased to 38%                                |
| • Interest rate reduced to 9.8% APR                       |
| • Reputation persistent across chains                     |
| Transaction (zk‑proof hash) [copy]                        |
+-----------------------------------------------------------+
| Updated Dashboard Card (silver + green border)            |
| Your Profile                                              |
| • Wallet: @0xKenichi                                      |
| • Identity Status: Linked (zk‑Proof Verified)             |
| • Credit Tier: Premium                                    |
| • Reputation Score: High                                  |
| [Manage Identity Button]                                  |
+-----------------------------------------------------------+
| AI Message:                                               |
| "Credit stronger — no personal data shared."              |
+-----------------------------------------------------------+
| [Return to Dashboard]                                     |
+-----------------------------------------------------------+

Key interactions
- "Manage Identity" lets users add/remove sources.
- Unlink requires explicit confirm + revocation notice.
- Borrow flow reflects higher LTV and lower rate.

## Whitepaper Alignment
- Optional identity, no forced KYC.
- zk‑proofs only; minimal disclosure by design.
- Clear incentives displayed without coercion.

## Implementation Notes
- Wallet connects via Wagmi/RainbowKit.
- Identity sources: ENS, Ceramic, DAO badges, optional KYC.
- zk‑proofs via ZK.js or equivalent.

