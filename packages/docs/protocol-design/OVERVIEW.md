# Vestra (Vestra) Overview

Vestra (Vestra) enables borrowing against time-locked or vested tokens without breaking vesting rules. Borrowers escrow claim rights (not tokens), get a conservative loan based on discounted present value (DPV), and settle on-chain at unlock. Lenders are protected by risk models, LTV caps, and automatic settlement.

![Vestra Protocol Architecture](../assets/diagrams/vestra-architecture.png)

## Who This Is For
- Contributors with vesting schedules who need liquidity.
- DAOs/startups who want to support contributors without early token sales.
- Lenders seeking conservative, secured yield on time-based collateral.

## Core Idea
Locked tokens are future value. The protocol prices that value conservatively:
`PV = Q * P * D` and `Borrow <= PV * LTV`.

## What Makes It Different
- Time-based enforcement (no price-based margin calls).
- Non-custodial control of wallets.
- Conservative risk-first lending with on-chain settlement.

## Where to Go Next
- [MVP.md](MVP.md) for build plan
- [ARCHITECTURE.md](ARCHITECTURE.md) for system design
- [SEPOLIA_BORROW_FLOW.md](../build-and-deploy/SEPOLIA_BORROW_FLOW.md) for test flow
