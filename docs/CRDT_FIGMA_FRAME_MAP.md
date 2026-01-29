# CRDT Figma Frame Map — Prototype Structure
Date: January 28, 2030  
Purpose: Single‑file Figma map linking Dashboard → Borrow/Repay/Identity/Governance.

## File Setup
File name: `CRDT 2030 Prototypes`  
Pages: `00-Cover`, `01-Desktop`, `02-Mobile`, `03-Components`

## 01-Desktop Frames (Suggested Names)
- `Desktop/Dashboard`
- `Desktop/Borrow/Step-1-Select`
- `Desktop/Borrow/Step-2-Risk`
- `Desktop/Borrow/Step-3-Terms`
- `Desktop/Borrow/Step-4-Success`
- `Desktop/Repay/Step-1-Status`
- `Desktop/Repay/Step-2-Amount`
- `Desktop/Repay/Step-3-Success`
- `Desktop/Identity/Step-1-Opt-In`
- `Desktop/Identity/Step-2-Link`
- `Desktop/Identity/Step-3-Success`
- `Desktop/Governance/Step-1-Overview`
- `Desktop/Governance/Step-2-Detail`
- `Desktop/Governance/Step-3-Success`
- `Desktop/Modal/Wallet-Connect`
- `Desktop/Modal/Risk-Tooltip`
- `Desktop/Modal/DPV-Breakdown`

## 02-Mobile Frames (Suggested Names)
- `Mobile/Dashboard`
- `Mobile/Borrow/Step-1-Select`
- `Mobile/Borrow/Step-2-Risk`
- `Mobile/Borrow/Step-3-Terms`
- `Mobile/Borrow/Step-4-Success`
- `Mobile/Repay/Step-1-Status`
- `Mobile/Repay/Step-2-Amount`
- `Mobile/Repay/Step-3-Success`
- `Mobile/Identity/Step-1-Opt-In`
- `Mobile/Identity/Step-2-Link`
- `Mobile/Identity/Step-3-Success`
- `Mobile/Governance/Step-1-Overview`
- `Mobile/Governance/Step-2-Detail`
- `Mobile/Governance/Step-3-Success`

## 03-Components (Core Library)
- `Buttons/Primary-Silver`
- `Buttons/Secondary-Graphite`
- `Cards/Loan-Card`
- `Cards/Vesting-Card`
- `Cards/Proposal-Card`
- `Gauges/LTV-Gauge`
- `Charts/MonteCarlo-Chart`
- `Timeline/Timeline-3D-Flat`
- `Badges/CRDT`
- `Badges/ZK`
- `Modals/Confirm-Biometric`

## Prototype Connections (Desktop)
- `Desktop/Dashboard` → `Desktop/Borrow/Step-1-Select` (Click: Borrow)
- `Desktop/Borrow/Step-1-Select` → `Desktop/Borrow/Step-2-Risk` (Click: Escrow)
- `Desktop/Borrow/Step-2-Risk` → `Desktop/Borrow/Step-3-Terms` (Click: Continue)
- `Desktop/Borrow/Step-3-Terms` → `Desktop/Borrow/Step-4-Success` (Click: Create Loan)
- `Desktop/Dashboard` → `Desktop/Repay/Step-1-Status` (Click: Loan Card)
- `Desktop/Repay/Step-1-Status` → `Desktop/Repay/Step-2-Amount` (Click: Repay Now)
- `Desktop/Repay/Step-2-Amount` → `Desktop/Repay/Step-3-Success` (Click: Approve & Repay)
- `Desktop/Dashboard` → `Desktop/Identity/Step-1-Opt-In` (Click: Identity)
- `Desktop/Identity/Step-1-Opt-In` → `Desktop/Identity/Step-2-Link` (Click: Link Identity)
- `Desktop/Identity/Step-2-Link` → `Desktop/Identity/Step-3-Success` (Click: Generate zk‑Proof)
- `Desktop/Dashboard` → `Desktop/Governance/Step-1-Overview` (Click: Governance)
- `Desktop/Governance/Step-1-Overview` → `Desktop/Governance/Step-2-Detail` (Click: View Details)
- `Desktop/Governance/Step-2-Detail` → `Desktop/Governance/Step-3-Success` (Click: Confirm Vote)

## Overlays
- `Wallet-Connect` overlay from any Connect button.
- `Risk-Tooltip` overlay from LTV gauges.
- `DPV-Breakdown` overlay from DPV text.

## Notes
- Use component variants for chart states (base/stress, deterministic/MC).
- Use variables for slider amounts and resulting text updates.
- Keep interaction easing conservative; avoid flashy animations.

