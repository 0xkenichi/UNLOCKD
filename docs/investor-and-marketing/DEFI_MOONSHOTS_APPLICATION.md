# DeFi Moonshots Application — Vestra

**Apply here:** [Sui DeFi Moonshots](https://blog.sui.io/defi-moonshots-program-announcement/)  
**Form type:** Tally

---

## Personal / Contact

| Field | Value |
|-------|-------|
| **What is your project name?** | Vestra |
| **Website** | https://vestraprotocol.io (launch in progress) |
| **What is your name?** | Founder name to be finalized before submission |
| **What is your email?** | 0xkenichi@gmail.com |
| **What is your Telegram handle?** | @vestraprotocol (or official founder handle) |
| **What is your github profile link?** | https://github.com/vestra-protocol (or founder profile) |
| **What is your project X handle?** | @VestraProtocol |
| **Region** | Global remote team (primary region to be declared in final form) |

---

## Project Fields (ready to use)

| Field | Value |
|-------|-------|
| **What category of DeFi is your project in?** | Lending / Credit |
| **What stage is your project in?** | Pre-launch (Testnet) |
| **If your project is already live on another chain please specify** | Ethereum Sepolia testnet; backend integrates Solana (Streamflow vesting, Pyth oracles). Sui deployment planned for Phase 2 multi-chain expansion. |

---

## Product Criteria (check all that apply)

Select **all four** — Vestra fits every Moonshots product criterion:

1. **Novel financial primitives** — Vestra introduces on-chain borrowing against non-transferable vesting claims with DPV valuation, auto-settlement at unlock, and vesting-preserving enforcement. No protocol today combines time-based risk pricing, claim-right escrow, and deterministic settlement.
2. **Capital efficiency breakthroughs** — DPV model and Monte Carlo–calibrated LTV caps materially improve use of locked value; users borrow against illiquid collateral without permanent haircuts.
3. **Net new capital onboarding** — Targets $300–500B+ in locked/vested tokens that cannot participate in DeFi today; credible path to $3–15B+ in mobilized liquidity.
4. **High-value consumer products** — Designed for sustained engagement: borrowers retain upside, lenders get predictable time-bound yield, DAOs retain talent via liquidity access.

---

## Long-Form Responses (copy into form)

### Please describe your team structure (including size, roles, educational, and professional background)

```
Solo founder plus technical legal expert.

- Founder: Full-stack protocol development — smart contracts (Solidity), backend, frontend, risk modeling. Shipped the full Vestra MVP on Ethereum Sepolia with Solana backend integration (Streamflow, Pyth, Jupiter). Built Monte Carlo simulations for DPV/LTV calibration. Prior experience includes full-stack product delivery and protocol engineering.

- Technical Legal Expert: Advisory and compliance guidance for DeFi primitives, tokenomics, and cross-jurisdiction considerations. Ensures protocol design aligns with regulatory frameworks and reduces legal risk as we scale.

Lean, execution-focused structure. The founder owns product, engineering, and architecture; legal expert provides governance, compliance, and risk oversight. We operate [remote/distributed] with a bias toward shipping fast while maintaining audit-ready rigor.
```

---

### Please list any notable experience building products on Sui or other chains.

```
- Deployed and tested full protocol stack on Ethereum Sepolia (ValuationEngine, LoanManager, LendingPool, VestingAdapter, Auction module)
- Built claim-right wrappers for OpenZeppelin VestingWallet, Sablier, Superfluid, TokenTimelock — composable adapters reusable across chains
- Integrated Chainlink price feeds, Pyth (Solana), and multi-oracle redundancy for risk valuation
- Production-ready backend with Solana Streamflow vesting support, Pyth oracles, and repay/sweep flows
- Open-source Monte Carlo risk simulations (Jupyter) calibrating DPV and LTV; results feed on-chain parameters
- End-to-end tests (Hardhat), frontend (React, RainbowKit, Solana wallet adapter), and docs site (Mintlify)
- Sui expansion: Moving core contracts and valuation logic to Move; Sui’s object model and performance align with vesting-claim composability and high-throughput settlement
```

---

### Please describe your project's technical architecture

```
Vestra is a non-custodial credit protocol for time-locked tokens. Architecture is modular and chain-agnostic:

Core contracts (Solidity today, Move planned for Sui):
- VestingAdapter: Interfaces with vesting contracts (OZ, Sablier, etc.), escrows claim rights, releases on settlement
- ValuationEngine: Computes DPV (PV = Q × P × D) using oracles; D aggregates time, volatility, liquidity, unlock-impact; LTV caps 20–40%
- LendingPool: Manages deposits, borrows, utilization-based rates; single-asset (USDC) MVP
- LoanManager: Issues loans, accrues interest (5–15% APR), enforces settlement at unlock (release/seize/liquidate)
- Auction module: Dutch, English, SealedBid for debt-free exits (claim-right sales)
- Claim wrappers: OZVestingClaimWrapper, SablierV2OperatorWrapper, SuperfluidClaimWrapper, TokenTimelockClaimWrapper — composable building blocks

Data flow:
1. Borrower escrows vesting position → Adapter verifies schedule
2. ValuationEngine returns PV + LTV
3. LoanManager mints loan, LendingPool transfers stablecoins
4. At unlock: timestamp-triggered settlement (full repay → release; partial/default → seize → liquidate via DEX router)

Security: Oracle redundancy (Chainlink + Pyth), ReentrancyGuard, Pausable, governance-set risk params. Audits planned with ecosystem partners (e.g. PeckShield, Quantstamp).

Backend: Node.js, wallet auth, Supabase/SQLite persistence, agent for matching and underwriting. Integrates Solana (Streamflow vesting, Pyth, Jupiter for repay).
```

---

### Please describe your project's business model and fee structure

```
Revenue streams:
1. Borrow APR spread: Borrowers pay 5–15% APR (utilization-based); lenders earn yield; protocol takes a fee (e.g. 10–20% of interest)
2. Origination fee: Optional one-time fee on loan creation (e.g. 0.5–1% of principal)
3. Auction fees: Protocol fee on claim-right sales (e.g. 1–2% of proceeds)
4. Governance / CRDT: Protocol fees flow to DAO treasury; CRDT used for governance and optional fee rebates/boosted yields

Fee structure (example):
- Interest: Borrowers pay APR; protocol captures 10–20% of interest to treasury
- Origination: 0.5% of principal (configurable per pool)
- Auction: 1.5% of winning bid (seller receives net)
- Liquidation: Slippage buffer and optional liquidation bonus to incentivize keepers

Business model: B2B2C — DAOs and protocols create pools for their vesting communities; individual borrowers access liquidity; lenders supply capital for yield. Additional B2B: partnerships with funds, market makers, and token issuers for treasury-backed and community-led pools.

Target TAM: $300–500B+ locked tokens; even 1% penetration = $3–5B loan volume. 5–10% capture implies $15–50B in borrowable liquidity.
```

---

### Have you received any notable funding? If yes please list amount.

`Bootstrapped to date. Grant and strategic funding conversations are active.`

---

### Please list any notable investors in your project

`None announced yet. Strategic investor outreach is in progress.`

---

### If applicable list the name of the person who referred you to this application

`No formal referral listed.`

---

## Deck Upload

- Prepare a deck (PDF, ≤10 MB) covering: problem, solution, market size, technical architecture, team, roadmap, and traction
- Use assets from `docs/WHITEPAPER.md`, `docs/LITEPAPER.md`, `docs/MArket.md`
- Highlight: novel primitive, $300–500B TAM, DPV + Monte Carlo risk model, composable adapters, Sui deployment roadmap

---

## Why Vestra Stands Out for Moonshots

**Transformation, not iteration:** Vestra is the first protocol to enable on-chain borrowing against non-transferable vesting claims with DPV valuation and auto-settlement at unlock. SecondSwap trades claims; Diffuse handles liquid-staked assets. Vestra uniquely provides credit primitives for time-locked tokens.

**Market validation:** Exhaustive landscape research shows no direct competitor. $300–500B+ locked, $97B+ annual unlocks; OTC discounts of 20–70%. Vestra activates this capital without breaking vesting or introducing custody.

**Technical depth:** Monte Carlo-calibrated risk curves, multiple vesting adapters, auction module for debt-free exits, identity-aware credit layer (optional). Production backend with Solana integration and explicit security hardening + external audit roadmap.

**Composability:** Adapters for OpenZeppelin, Sablier, Superfluid, TokenTimelock. DAOs and protocols can create pools for their communities. CRDT governance and treasury alignment.

**Sui fit:** Sui’s object model and performance suit vesting-claim composability and high-throughput settlement. Vestra plans Sui as a Phase 2 deployment target alongside Base and other L2s.

---

## Pre-Submit Checklist

- [ ] Finalize founder legal name and declared operating region in the submitted form
- [ ] Create and attach deck (PDF, ≤10 MB)
- [ ] Confirm X handle, GitHub, and Telegram are correct and active
- [ ] Review Moonshots criteria: https://blog.sui.io/defi-moonshots-program-announcement/
