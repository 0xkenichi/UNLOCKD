# CRDT Tokenomics (Phase 1 Final)

This document defines the Phase 1 CRDT token policy for funding, governance, and long-term protocol alignment.

Version: 1.1  
Last updated: 2026-02-13

## Token Specification

- Token name: CRDT
- Symbol: CRDT
- Standard: ERC-20 + ERC20Votes
- Decimals: 18
- Total supply: 1,000,000,000 CRDT (fixed cap)
- Inflation: none in Phase 1

## Allocation (Final)

The allocation sums to 100%.

- Treasury: 30%
- Team: 20%
- Protocol liquidity reserve (fixed lending pool / minimum credit reserve): 20%
- Community sale: 15%
- Presale: 7%
- VC / investors: 5%
- Airdrop: 3%

## Vesting and Unlock Policy

- Team (20%): 12-month cliff, then 36-month linear vesting
- VC / investors (5%): 6-month cliff, then 24-month linear vesting
- Treasury (30%): timelock-controlled, governance-approved emissions only
- Liquidity reserve (20%): released by governance-approved pool requirements
- Presale (7%): 10% at TGE, 90% linear over 12 months
- Community sale (15%): 25% at TGE, 75% linear over 9 months
- Airdrop (3%): staged claim windows with anti-sybil controls

## Treasury Policy

- Treasury mandate: audits, grants, protocol growth, and risk buffer
- Spending approval: on-chain governance proposal + timelock
- Emergency use: limited and transparent, published post-incident report required
- Reporting cadence: monthly treasury and runway disclosure

## Value Capture and Fee Routing

Default routing for protocol fee revenue:

- Low-risk loans: 85% to lenders, 12% to treasury, 3% to safety module / insurance
- Balanced-risk loans: 80% to lenders, 14% to treasury, 6% to safety module / insurance
- High-risk loans: 72% to lenders, 13% to treasury, 15% to safety module / insurance

This routing is governance-managed and may be tuned by proposal, simulation evidence, and timelock.

Interpretation:
- Low-risk routing prioritizes lender yield and competitiveness while maintaining a basic protection layer.
- Balanced-risk routing is the default middle profile for standard collateral and duration.
- High-risk routing increases safety module accrual to improve resilience against tail losses.

Formula:
- If `F` is total protocol fee revenue in a period:
  - Low-risk:
    - Lenders receive `0.85 * F`
    - Treasury receives `0.12 * F`
    - Safety module receives `0.03 * F`
  - Balanced-risk:
    - Lenders receive `0.80 * F`
    - Treasury receives `0.14 * F`
    - Safety module receives `0.06 * F`
  - High-risk:
    - Lenders receive `0.72 * F`
    - Treasury receives `0.13 * F`
    - Safety module receives `0.15 * F`

Example:
- If quarterly protocol fee revenue is `$2,000,000`:
  - Low-risk:
    - Lenders: `$1,700,000`
    - Treasury: `$240,000`
    - Safety module: `$60,000`
  - Balanced-risk:
    - Lenders: `$1,600,000`
    - Treasury: `$280,000`
    - Safety module: `$120,000`
  - High-risk:
    - Lenders: `$1,440,000`
    - Treasury: `$260,000`
    - Safety module: `$300,000`

## Governance Controls

- Quorum: 4% of circulating voting power
- Passing threshold: 55% yes votes
- Voting window: 5 days
- Timelock: 48 hours
- Guardrail: risk parameter changes require rationale + simulation summary

## Launch Guardrails

- No discretionary minting in Phase 1
- No treasury transfer outside approved governance path
- No team/investor unlock acceleration without supermajority governance
- Public unlock dashboard required before TGE

## Review Cadence

- Quarterly token policy review
- Annual tokenomics stress test (liquidity, emissions, participation)
- Any policy changes must be documented in `docs/CHANGELOG.md`
