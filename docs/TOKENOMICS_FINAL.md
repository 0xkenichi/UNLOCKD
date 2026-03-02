---
title: Tokenomics ($CRDT)
---

# Vestra Tokenomics ($CRDT & veCRDT)

The Vestra protocol employs a robust vote-escrowed (veTokenomics) architecture, transitioning away from static allocations to a dynamic, yield-bearing, and governance-driven model. The core objective is to align long-term liquidity providers, borrowers, and protocol governors.

## 1. Token Specification
- **Token Name**: Vestra
- **Symbol**: $CRDT
- **Standard**: ERC-20
- **Decimals**: 18
- **Total Supply**: 1,000,000,000 CRDT (Fixed Cap)
- **Inflation**: Zero-inflation model at inception; future emissions strictly controlled by veCRDT voters from the community treasury.

## 2. Phase 1 Allocation
- **Protocol Liquidity Reserve (Emissions Pool)**: 35% - Directed exclusively via veCRDT gauge voting.
- **Treasury (DAO Managed)**: 25% - For grants, integration bounties, and risk buffers.
- **Core Contributors (Team & Advisors)**: 18% - 12-month cliff, 36-month linear vesting.
- **Community Sale / LBP**: 10% - Circulating at TGE to bootstrap initial liquidity.
- **Early Strategic Backers**: 7% - 6-month cliff, 24-month linear vesting.
- **Airdrop (Early Users & Testnet)**: 5% - Staged claim windows with anti-sybil controls.

## 3. The veCRDT Mechanism (Vote-Escrowed)
Holding $CRDT alone does not provide governance rights or a share of the protocol revenue. To participate actively, holders must lock their $CRDT to receive `veCRDT`.

- **Locking Mechanics**: Users can lock $CRDT for up to 4 years. The longer the lock, the greater the veCRDT voting power (e.g., locking 1 CRDT for 4 years = 1 veCRDT; locking 1 CRDT for 1 year = 0.25 veCRDT).
- **Non-Transferable**: veCRDT is purely an internal accounting standard and cannot be traded.

### 3.1 Utility of veCRDT
1. **Governance & Gauge Voting**: veCRDT holders decide which locked collateral pools (e.g., vested ARB, locked OP, specialized DAO tokens) receive liquidity injections, better DPV parameters, and CRDT emissions.
2. **Revenue Distribution**: The Vestra protocol generates revenue from:
   - Origination fees on loans.
   - Successful auction liquidations.
   - Interest rate spreads.
   100% of these accrued fees are used to buy back $CRDT on the open market and distribute it pro-rata to veCRDT holders.
3. **Borrowing Boosts**: Users who hold veCRDT receive preferential interest rates and slightly optimized LTV caps on their own collateralized loans.

## 4. Deflationary Pressures & Value Capture
As the protocol facilitates more credit against illiquid assets, the demand for liquidity provision increases. By directly linking the protocol's credit volume to buybacks and distributing those buybacks to locked token holders, the circulating supply of $CRDT faces persistent deflationary pressure despite the inflationary reality of gauge emissions.

For full policy details, historical updates, and the real-time emission schedule, refer to the on-chain gauge dashboard.
