# CRDT Token and DAO Documentation

This document specifies how the CRDT token and the UNLOCKD DAO work. It is
intended to be comprehensive and beginner friendly.

## Overview

UNLOCKD is a protocol for borrowing against locked or vesting tokens. CRDT is
the protocol token and the governance token for the DAO. CRDT aligns protocol
participants, secures governance, and funds long term development.

For final Phase 1 allocation, vesting, and treasury policy, see
`TOKENOMICS_FINAL.md`.

## Core Concepts

- **Locked collateral**: Tokens that are not yet transferable (vesting,
  timelocks, or escrowed tokens).
- **DPV (Discounted Present Value)**: The value of locked collateral after
  time discounting and risk adjustments.
- **LTV (Loan-to-Value)**: Maximum borrow amount as a percentage of DPV.
- **DAO**: The decentralized governance body that manages parameters and
  treasury.

## CRDT Token Summary

- **Token name**: CRDT
- **Type**: ERC-20
- **Role**: Governance + protocol utility
- **Total supply**: 1,000,000,000 CRDT (fixed cap)
- **Decimals**: 18
- **Minting**: One-time genesis mint, no ongoing emissions in Phase 1

## CRDT Utility

CRDT provides protocol utility in four primary ways:

1) **Governance voting**
   - Vote on risk parameters, supported assets, and treasury spending.
2) **Safety incentives**
   - Reward participants who improve protocol health (e.g., lenders,
     liquidators, risk assessors).
3) **Protocol alignment**
   - Optional fee rebates or boosted yields for CRDT holders or stakers.
4) **Treasury funding**
   - A portion of protocol fees flows to the DAO treasury.

## Tokenomics

### Total Supply

UNLOCKD uses a fixed-cap model for predictability and governance clarity:

- **Total supply**: 1,000,000,000 CRDT
- **Supply model**: no inflation in Phase 1
- **Future emissions**: only via DAO governance vote and timelock execution

### Allocation (Final Phase 1 Plan)

The allocation below sums to 100%.

- **Treasury**: 30%
- **Team**: 20%
- **Protocol liquidity reserve (fixed lending pool / minimum credit reserve)**: 20%
- **Community sale**: 15%
- **Presale**: 7%
- **VC / investors**: 5%
- **Airdrop**: 3%

### Vesting (Phase 1 Defaults)

- **Team (20%)**: 12-month cliff, then 36-month linear vesting
- **VC / investors (5%)**: 6-month cliff, then 24-month linear vesting
- **Treasury (30%)**: timelock-controlled, governance-approved releases
- **Protocol liquidity reserve (20%)**: programmatic release by governance-approved pool policies
- **Presale (7%)**: 10% at TGE, 90% linear over 12 months
- **Community sale (15%)**: 25% at TGE, 75% linear over 9 months
- **Airdrop (3%)**: phased claim windows with anti-sybil controls

## Protocol Fees and Value Capture

### Fee Sources

- **Borrow APR**: Paid by borrowers to lenders.
- **Protocol fee**: A small percent of interest or origination fee.
- **Liquidation fee**: Charged during default resolution.

### Fee Routing

Suggested default:

- 80% to lenders
- 15% to protocol treasury
- 5% to safety module / insurance fund

### CRDT Value Capture Options

Choose one or combine:

- **Fee rebate**: CRDT stakers receive fee rebates.
- **Buyback**: Protocol fees buy CRDT from the market and send to treasury.
- **Revenue share**: CRDT stakers receive a portion of protocol fees.

## Governance and DAO

### Governance Roles

- **Token holders**: Vote on proposals.
- **Delegates**: Represent smaller holders.
- **Multisig council** (optional): Executes approved proposals or acts as
  a temporary guardian.

### Governance Process

1) **Proposal draft** (off-chain)
2) **Community discussion**
3) **On-chain proposal**
4) **Voting period** (5 days)
5) **Timelock** (48 hours)
6) **Execution**

### Voting

- **Quorum**: 4% of circulating voting power
- **Passing threshold**: 55% yes votes
- **Snapshot**: block number-based voting power

### DAO Treasury

- Receives protocol fees and allocated CRDT.
- Funds audits, grants, marketing, and development.
- Treasury spending requires governance approval.

## Risk Model and Parameters

### DPV Calculation

DPV uses a discounted present value approach with additional conservative
adjustments:

- **Time discount**: decreases value as unlock time increases.
- **Volatility adjustment**: penalizes high volatility assets.
- **Liquidity haircut**: penalizes illiquid collateral.
- **Shock factor**: reduces exposure to tail risk.

These parameters are governance controlled to reflect market conditions.

### Risk Simulation Models

Risk simulation models quantify uncertainty in the discounted present value
(DPV) of locked or vested tokens. They anchor conservative LTV ratios and
protect lenders from downside scenarios (for example, price crashes during
vesting periods). The core approach combines:

- **Deterministic discounting** (time decay + volatility penalty) for on-chain
  computation (fast, gas efficient).
- **Stochastic simulations** (Monte Carlo) for off-chain calibration, stress
  testing, and governance parameter setting.

#### Core Model Recap (On-Chain Friendly)

Base DPV formula:

`PV = Q * P * D`

Where:

- `Q`: token quantity
- `P`: current market price (from Chainlink oracle)
- `D`: composite discount = `D_time * D_vol * D_liq * D_shock`

Typical fixed parameters (configurable via governance):

- Risk-free rate `r = 5%` (annual)
- Liquidity factor = `90%`
- Supply shock factor = `95%`
- Volatility `sigma` (token-specific: `30%` low, `50%` average crypto,
  `70%` high vol)

Time discount (exponential):

`D_time = exp(-r * t)` where `t` is time to unlock in years.

Volatility penalty (sqrt-time rule):

`D_vol = max(1 - sigma * sqrt(t), 0)`

Dynamic LTV suggestion: 40% at `t = 0` linearly decaying to a 25% floor over
~36 months. This is cheap to compute on-chain (for example with
`ABDKMath64x64` for fixed-point exp and sqrt).

#### Monte Carlo Simulation (Off-Chain / Calibration)

Use geometric Brownian motion (risk-neutral) for price paths:

`P_t = P_0 * exp((r - sigma^2 / 2) * t + sigma * sqrt(t) * Z)` where
`Z ~ N(0, 1)`.

Present value per path:

`PV_i = exp(-r * t) * Q * P_{t,i}`

Example setup:

- `P_0 = 10`
- `Q = 1000`
- `r = 0.05`
- Volatility levels: `30%`, `50%`, `70%`
- 10,000 paths per time horizon
- Horizons: 0 to 36 months (step 3 months)

Key stats (mean and 5th percentile PV):

| Months | Vol 30% Mean PV | Vol 30% 5th % PV | Vol 50% Mean PV | Vol 50% 5th % PV | Vol 70% Mean PV | Vol 70% 5th % PV |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 10,000 | 10,000 | 10,000 | 10,000 | 10,000 | 10,000 |
| 3 | 9,997 | 7,755 | 9,974 | 6,426 | 10,027 | 5,308 |
| 6 | 9,993 | 6,925 | 10,003 | 5,304 | 10,085 | 3,945 |
| 9 | 9,993 | 6,327 | 10,000 | 4,397 | 9,974 | 3,080 |
| 12 | 9,997 | 5,790 | 10,048 | 3,856 | 10,117 | 2,503 |
| 15 | 9,976 | 5,428 | 10,001 | 3,400 | 10,073 | 2,027 |
| 18 | 10,014 | 5,075 | 9,889 | 3,070 | 9,920 | 1,713 |
| 21 | 10,024 | 4,814 | 10,020 | 2,670 | 9,966 | 1,397 |
| 24 | 9,991 | 4,560 | 10,011 | 2,478 | 9,837 | 1,165 |
| 27 | 9,996 | 4,372 | 10,116 | 2,226 | 9,742 | 1,012 |
| 30 | 9,974 | 4,086 | 10,102 | 1,955 | 9,988 | 855 |
| 33 | 9,957 | 3,867 | 10,106 | 1,856 | 9,692 | 770 |
| 36 | 10,054 | 3,691 | 9,941 | 1,653 | 10,171 | 675 |

Insights:

- Mean PV stays ~10,000 (risk-neutral expectation).
- 5th percentile drops sharply with time and volatility, so high-vol tokens
  become unborrowable after ~18 to 24 months.
- Use the 5th percentile as the conservative PV input for governance LTV caps.
- On-chain: approximate with precomputed tables or simplified formulas.

#### Advanced / Alternative Models

- **Black-Scholes option analogy**: treat vested tokens as deep in-the-money
  call options (strike ~0). Useful off-chain for stress tests, too gas heavy
  for on-chain use.
- **VaR / Expected shortfall**: compute 95% VaR on simulated PV to set
  protocol-wide risk buffers.
- **Real-world adjustments**:
  - Unlock supply shock discount (add 10% to 30% discount if more than 5% of
    total supply unlocks at once).
  - Protocol-specific risks (governance attacks, oracle failure).
  - Historical data oracles (for example, Chainlink volatility feeds).

#### Implementation Recommendations

- **On-chain**: keep the deterministic model for speed and predictable gas.
- **Off-chain**: run Monte Carlo in Python (quarterly) to calibrate
  parameters, then feed results into DAO proposals.
- **Governance**: allow a risk committee to vote on `sigma` per token class
  (blue chip vs memecoin).
- **Monitoring**: track defaults vs simulated tail risks (for example via a
  Dune Analytics dashboard).

### LTV Policy

- LTV is derived from DPV and adjusted by risk parameters.
- LTV should be lower for longer lockups or higher volatility assets.

### Supported Collateral

The DAO approves each collateral type with:

- Price feed source (Chainlink or approved oracle).
- Volatility estimate.
- Liquidity haircut.
- Maximum LTV.

## Borrowing Lifecycle

1) **Borrower deposits vesting/locked collateral**
2) **Protocol computes DPV and LTV**
3) **Borrower receives stablecoin loan**
4) **Borrower repays principal + interest**
5) **At unlock**, collateral is released, or default resolution occurs

## Default and Liquidation

If the loan is not repaid at unlock:

- A liquidation mechanism converts collateral to repay lenders.
- A liquidation fee may apply.
- Any surplus can return to the borrower.

The DAO can define a grace period or restructuring process.

## Oracle Strategy

### Preferred Oracle

- **Chainlink Data Feeds** for price discovery.
- Fallback to secondary oracles if Chainlink is unavailable.

### Oracle Safeguards

- Staleness checks (max age).
- Deviation checks vs. TWAP or reference price.
- Circuit breaker in extreme volatility.

## Token Contract Specification

This section describes the intended CRDT token contract. CRDT is not being
implemented right now; this is a design spec for a future release.

### Standards

- ERC-20 (standard token transfers)
- EIP-2612 permit (gasless approvals)
- ERC20Votes (delegated governance)

### Core Parameters

- **Name**: CRDT
- **Symbol**: CRDT
- **Decimals**: 18
- **Total supply**: 1,000,000,000 CRDT (fixed cap)

### Roles and Permissions

- **Owner / timelock**: controls parameter updates and treasury actions.
- **Minter** (optional): only if emissions are enabled.
- **Pauser** (optional): only for emergency use.

### Transfer and Delegation

- Standard ERC-20 `transfer` and `transferFrom`.
- Delegation enabled via `delegate` and `delegateBySig`.
- Snapshot-based voting (block number).

### Minting and Supply

Choose one:

- **Fixed cap**: mint once to treasury + allocations, no further minting.
- **Fixed cap + emissions**: controlled minting schedule with capped supply.

### Upgradeability (Optional)

- If used, prefer transparent or UUPS proxies with a timelock.
- If not used, deploy as immutable contract with governance controls.

## DAO Operational Policies

- Regular parameter reviews (monthly or quarterly).
- Emergency response process for oracle failures.
- Public treasury reporting.

## Example Parameters (Starter Defaults)

These are suggested defaults for testnet or early launch. Adjust via DAO.

- Risk-free rate: 5%
- Volatility: 50%
- Liquidity haircut: 10%
- Shock factor: 5%
- Base LTV: 30%
- Loan duration: 30 days (aligned to vesting unlock)

## Roadmap

- **Phase 1**: MVP on testnet with mocks
- **Phase 2**: Mainnet pilot with limited collateral
- **Phase 3**: DAO launch and token distribution
- **Phase 4**: Multi-chain expansion

## Glossary

- **DAO**: Decentralized Autonomous Organization
- **DPV**: Discounted Present Value
- **LTV**: Loan-to-Value
- **TWAP**: Time-Weighted Average Price

