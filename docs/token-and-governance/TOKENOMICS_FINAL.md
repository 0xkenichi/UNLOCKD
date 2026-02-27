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

<!-- MARKET_ANCHORS_START -->
## Market Potential Baseline (Data Snapshot, 2026-02-13)

This section anchors growth assumptions to external market data so expansion targets are auditable.

### Core Market Inputs

- U.S. infrastructure needs (2024-2033): `$9.139T`; funded: `$5.450T`; gap: `$3.689T`.
- Global infrastructure need to 2040: `$94T` baseline (`$97T` including SDG water/electricity needs), with `$18T` unfunded if current trends persist.
- Total crypto market cap: `$2.361T` (point-in-time global market value).
- DeFi TVL: `$166.42B` (total onchain value actively deployed in protocols).
- Stablecoin circulating value: `$305.54B` (liquidity base for settlement and lending).
- Token unlock flow proxy: Tokenomist reports `$97.43B` of total token releases in 2025, and `$1.38B` release activity in the current week.

### What This Means For CRDT/UNLOCKD

- Infrastructure has a large structural funding deficit; we target a narrow financing wedge, not the full infrastructure asset base.
- Crypto has enough liquidity depth to support a large collateralized credit layer if risk filters are strict.
- Unlock/vesting flows are already near the `$100B` annual scale, supporting the thesis that "illiquid token value -> credit capacity" is a real market, not a hypothetical.

### Aggressive Scenario (Data-Anchored)

Using token unlock flow as the liquidity entry universe:

- Annual unlock universe: `$97.43B`
- Eligibility haircut (quality + liquidity filters): `60%` -> `$58.46B` addressable
- Onboarding share: `25%` -> `$14.61B` onboarded collateral
- Average LTV: `45%` -> `$6.58B` credit capacity
- Capital velocity: `1.8x` -> `$11.84B` annual loan volume
- Protocol take rate: `1.2%` -> `$142.05M` annual protocol revenue

Formula chain:

- `AddressableCollateral = UnlockUniverse * EligibilityRate`
- `OnboardedCollateral = AddressableCollateral * AdoptionRate`
- `CreditCapacity = OnboardedCollateral * AvgLTV`
- `AnnualLoanVolume = CreditCapacity * CapitalVelocity`
- `ProtocolRevenue = AnnualLoanVolume * TakeRate`

### Source Links

- ASCE 2025 Report Card (Executive Summary, investment table): `https://infrastructurereportcard.org/wp-content/uploads/2025/03/Executive-Summary-2025-Natl-IRC-WEB.pdf`
- Global Infrastructure Hub outlook release: `https://www.gihub.org/media/global-infrastructure-investment-need-to-reach-usd97-trillion-by-2040/`
- DeFiLlama TVL API (`/charts`): `https://api.llama.fi/charts`
- DeFiLlama stablecoin API (`/stablecoincharts/all`): `https://stablecoins.llama.fi/stablecoincharts/all`
- CoinGecko global market API: `https://api.coingecko.com/api/v3/global`
- Tokenomist unlock dashboard and insights: `https://tokenomist.ai/unlocks`
<!-- MARKET_ANCHORS_END -->
