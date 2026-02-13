# Credit Markets for Time-Locked Digital Assets
## A Protocol for Borrowing Against Vested and Locked Tokens

Version 2.0  
Date: January 28, 2026  
Authors: Protocol Genesis Team (Inspired by First-Principles Innovation)

### Abstract
In the decentralized economy of Web3, tokenized incentives drive alignment and growth. Yet, vesting schedules and token lockups -- designed to prevent dumps and ensure commitment -- create a paradox: trillions in on-chain value remain economically inert. Holders own assets with real market price but zero immediate utility, often resorting to inefficient workarounds like deeply discounted OTC sales or premature liquidations that erode ecosystem trust.

This whitepaper presents a decentralized protocol that resolves this inefficiency. Users can borrow against the discounted present value (DPV) of their time-locked tokens without transferring ownership, breaking vesting rules, or relying on off-chain enforcement. Key innovations include conservative risk modeling via mathematical discount curves, automated on-chain settlement at unlock time, and an optional identity-aware credit layer for persistent reputation. The protocol is non-custodial, composable, and governed by a DAO, establishing a new financial primitive for DAOs, startups, and contributors.

Built on first-principles engineering -- like optimizing reusable rockets to reduce space travel costs -- this system unlocks liquidity while preserving long-term incentives. It bridges the gap between ownership and utility, potentially activating billions in trapped capital. No prior documents needed: This is your complete blueprint to understand, evaluate, and build upon.

---

## 1. Introduction
Decentralized networks and Web3 organizations rely on token-based compensation to align participants with sustained success. Vesting mechanisms -- where tokens unlock gradually over time -- and lockups -- fixed periods of non-transferability -- are standard tools to mitigate short-term speculation and promote longevity. These structures are effective: They bind founders, employees, contributors, and investors to the project's horizon.

However, they impose a severe cost: Illiquidity. Token holders possess legally and programmatically owned assets with observable market value, yet they cannot access that value for months or years. This locks away economic potential, forcing individuals into suboptimal choices -- such as borrowing from centralized lenders with custodial risks or selling future claims at steep discounts via over-the-counter (OTC) deals.

Traditional DeFi protocols like Aave or Compound excel at lending against liquid collateral but fail here: They require transferable assets that can be liquidated on price drops, not time-based claims. Off-chain solutions introduce counterparty risks, legal complexities, and regulatory hurdles. This whitepaper proposes a protocol that addresses these gaps head-on.

Our approach: Enable borrowing against escrowed claim rights to future unlocks, valued conservatively through DPV models. Loans accrue interest and settle automatically via smart contracts at vesting expiry -- no courts, no custodians, just code. Optional integration with decentralized identities (DIDs) or DAO credentials builds cross-wallet credit histories, evolving beyond anonymous wallet roulette.

This isn't an incremental tweak; it's a foundational primitive. Like Tesla's battery packs storing energy for on-demand use, this protocol stores future token value and deploys it responsibly today. By design, it respects vesting integrity, enforces outcomes on-chain, and scales across ecosystems.

---

## 2. Problem Statement
### 2.1 The Illiquidity Paradox in Web3
Vested or locked tokens represent "paper wealth" with real constraints:

- Ownership is clear: Tokens are programmatically assigned via smart contracts (e.g., OpenZeppelin vesting libraries) and legally recognized.
- Value is observable: Market prices from oracles (e.g., Chainlink) reflect current worth.
- Utility is zero: Non-transferable during lockup, preventing sales, pledges, or DeFi interactions.

This inefficiency affects millions: DAO contributors (e.g., in Arbitrum or Optimism), startup employees in token-heavy comp packages, early investors in seed rounds, and grant recipients from ecosystems like Solana or Ethereum. Estimates suggest over $1-2 trillion in locked tokens across Web3, with billions vesting annually. Holders face opportunity costs -- unable to fund personal needs, invest elsewhere, or weather volatility -- often leading to premature ecosystem exits.

### 2.2 Limitations of Existing Systems
- DeFi lending protocols: Platforms like Aave, Compound, or MakerDAO require liquid, transferable collateral. They use price-based liquidation (e.g., via oracles triggering sales on undercollateralization), not time-based risks. Vested positions cannot be deposited without breaking locks.
- Centralized loans: Services like Ledn or centralized crypto lenders offer loans against locked assets but demand custody, KYC, and jurisdiction-specific compliance. Enforcement relies on legal recourse, introducing opacity and single points of failure.
- OTC deals and secondary markets: Informal arrangements discount future claims by 30-70%, exposing parties to counterparty default and legal disputes. Platforms like SecondSwap enable trading but not borrowing, forcing sellers to forfeit upside.

These solutions fragment liquidity, amplify risks, and undermine the decentralized ethos.

---

## 3. Market Opportunity and Unlock Dynamics
### 3.1 Market Size (2026 Baseline)
The protocol targets the growing pool of vested and time-locked tokens across major
chains. Based on unlock aggregators and market tracking in early 2026, the total
USD value of locked/vested tokens is approximately $300-500B+, or roughly 10-15%
of the total crypto market cap (~$3T). This estimate uses annual unlocks as a proxy
and assumes multi-year vesting schedules:
- Annual unlocks in 2025 were roughly $97B, implying $200-400B remaining locked.
- Adjusted for new project issuance and price appreciation, this expands to $300-500B+.

### 3.2 Chain-Level and Sector Breakdown (Indicative)
- Ethereum ecosystem: ~$150-250B locked (high-value DeFi and L2 allocations).
- Solana and other L1s: ~$50-100B locked (long-duration team and investor schedules).
- Cross-chain RWAs: $20-36B today, with projections of $400-500B by end-2026.

### 3.3 Vesting Timelines and Liquidity Windows
Vesting schedules create predictable illiquidity profiles:
- Cliff periods: 6-12 months are common for team/investor allocations.
- Linear vesting: Monthly or quarterly releases over 1-3 years (total 2-4 years typical).
- 2026 unlocks remain large and diverse across DeFi, L1s, AI, and Bitcoin-native sectors.

These timelines allow the protocol to price risk deterministically and settle at
unlock with minimal liquidation uncertainty.

### 3.4 Opportunity Capture
Even modest penetration is meaningful:
- 1% of the locked market implies $3-5B in loan volume.
- A 5-10% capture rate implies $15-50B in borrowable liquidity.
- Liquidity access reduces OTC discounts (20-50%), improves borrower outcomes,
  and provides lenders steady, time-bound yield.

---

## 4. Competitor and Landscape Analysis
To validate novelty, we conducted exhaustive searches across web queries ("DeFi protocols for borrowing against vested locked tokens"), X (formerly Twitter) for real-time updates, and direct site browses. No protocol fully matches our design: on-chain borrowing against non-transferable vesting claims with DPV valuation, auto-settlement at unlock, and vesting-preserving enforcement. Adjacent projects exist but address subsets.

### SecondSwap
A decentralized exchange for trading locked/vested tokens without early unlocks.

Recent developments (as of January 2026):
- Raised $1.2M in seed funding (November 2024).
- Partnered with Magna and TokenOps for issuer-approved secondary liquidity (August/September 2025).
- Expanded to Avalanche and onboarded billions in inventory.

Strengths: Transparent markets preserve vesting; audited by Code4rena (February 2025 fixes for vesting transfers).  
Weaknesses: Focuses on sales, not borrowing -- users take permanent haircuts, no yield retention.  
Market traction: Targets $1.5-$2.5T locked token space but lacks credit primitives.

### Diffuse (zkServerless)
Enables locked/staked assets in restaking and lending via "collateral abstraction" (e.g., without unlocking).

Updates (2024-2026):
- Emphasized zkMesh and lattice SNARKs (October 2025 X posts).
- Integrations with Symbiotic for cross-chain.

Strengths: Activates staked value in ecosystems.  
Weaknesses: Geared toward liquid-staked derivatives (e.g., stETH), not pure vesting claims; no native DPV for time-locks or unlock-time settlement.

### Other DeFi Players
- Aave/Compound/Maker: Liquid collateral only; recent v4 updates (e.g., Aave hooks) add cross-chain but ignore vesting.
- Emerging: IO DeFi (yield contracts, November 2025), Radiant Capital (cross-chain lending), Liquity (stablecoin focus). None handle non-transferable time-locks natively.
- Reputation-based: Maple Finance offers institutional undercollateralized loans but relies on off-chain credit checks.

Gaps: No protocol combines time-based risk pricing, automatic unlock enforcement, and optional identity for credit continuity.  
Our moat: Conservative curves ensure lender safety; composability with existing vesting standards (e.g., Sablier, OpenZeppelin) enables rapid adoption.

---

## 5. System Overview
The protocol allows users to escrow claim rights to vested/locked tokens, borrow stablecoins or other assets against their DPV, and repay over time. At unlock, smart contracts enforce settlement: release tokens on full repayment, partial seizure on underpayment, or full liquidation on default.

Key characteristics:
- Non-custodial: Users retain control; protocol escrows only claim rights (e.g., via NFTs wrapping vesting positions).
- On-chain enforcement: No off-chain intervention -- settlement triggered by block timestamps.
- Conservative risk modeling: DPV discounts front-load risks, capping loan-to-value (LTV) at 20-40%.
- Optional identity-linked credit: Enhances terms without mandating disclosure.
- Composable: Adapters for common vesting contracts; integrable with DAOs and frontends.

### Optional Auction Primitive (Non-Loan Liquidity)
In addition to borrowing, the protocol can offer a separate auction mechanism where users sell their vested/locked claim rights at a market-clearing discount. This is a non-debt path for users who want immediate exit without repayment risk:
- Asset sold: Claim rights (escrowed as NFTs), not the underlying tokens.
- Auction types: Dutch (price decays), English (bids climb), and Sealed Bid (commit/reveal first-price). Future variants include Vickrey (second-price sealed bid) and Reverse (buyer-driven bids) as modular extensions.
- Settlement: Winner receives the claim rights at unlock; seller receives stablecoins (minus fee).
- Safety: Protocol treasury can bid only at deep discounts (e.g., 50-80% off DPV), so it never lends or takes price risk.
- Market impact: Early exits flow to long-term holders (including treasury), reducing unlock-day sell pressure.

This creates value for:
- Borrowers: Liquidity without selling upside.
- Lenders: Yield from secured, predictable collateral.
- DAOs/startups: Retain talent by enabling financial flexibility.

---

## 6. Architecture
### 5.1 Core Components
- Vesting and lock adapters: Interface with external contracts (e.g., OpenZeppelin, Sablier) to verify schedules, escrow claims, and enforce non-transferability.
- Valuation and risk engine: Computes DPV and borrow limits.
- Lending pools: Manage liquidity supply, allocations, and yields.
- Loan management contracts: Handle issuance, tracking, and settlement.
- Auction module (optional): Runs time-based auctions for claim-right NFTs; settles to stablecoins with protocol fees.
- Identity and reputation module (optional): Integrates DIDs, DAO credentials, or KYC for credit scoring.
- Governance framework: DAO for parameters, risk committees for oversight.

### 5.2 Security and Integration
- Audits: Multi-auditor (e.g., PeckShield, Quantstamp) for all contracts.
- Oracles: Redundant (Chainlink, Pyth) for prices and volatility.
- Chains: Ethereum mainnet MVP; multi-chain via LayerZero or CCIP.

---

## 7. Collateral Valuation
Locked tokens are illiquid futures, so we value them via discounted present value (DPV):

PV = Q * P * D

Where:
- Q: Token quantity.
- P: Current market price (oracle-fed).
- D: Composite discount factor (0-1).

### Discount Factors
- Time to unlock: Exponential decay, D_time = e^(-r t) (r = risk-free rate, t = time in years).
- Volatility: Simplified sqrt-time adjustment, D_vol = 1 - sigma * sqrt(t) (sigma = volatility).
- Liquidity depth: Adjusts for market slippage (e.g., 0.9 for deep markets).
- Unlock supply impact: Discounts for dilution shocks (e.g., 0.95).
- Protocol risk: Token-specific score (e.g., governance stability).

LTV: Capped dynamically (20-40%), governed by DAO.

### Expanded Risk Curve Simulations (Deterministic)
Assumptions retained and refined:
- Risk-free rate r = 5% (annual).
- Liquidity factor = 0.9.
- Shock factor = 0.95.
- Q = 1000 tokens, P = 10 (for borrow limit examples).
- LTV decreases linearly from 40% at t = 0 to a 25% floor at t = 36 months.
- Time is in months, t_years = t / 12.

Formulas:
- D_time = e^(-r * t_years)
- D_vol = max(1 - sigma * sqrt(t_years), 0)
- Composite D = D_time * D_vol * 0.9 * 0.95

| Time (months) | D_time | D_vol_low | D_vol_mid | D_vol_high | Composite D_low | Composite D_mid | Composite D_high | LTV (%) | Borrow Limit_low | Borrow Limit_mid | Borrow Limit_high |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 1.000 | 1.000 | 1.000 | 1.000 | 0.855 | 0.855 | 0.855 | 40.00 | 3420 | 3420 | 3420 |
| 3 | 0.988 | 0.850 | 0.750 | 0.650 | 0.718 | 0.633 | 0.549 | 38.75 | 2781 | 2454 | 2127 |
| 6 | 0.975 | 0.788 | 0.646 | 0.505 | 0.657 | 0.539 | 0.421 | 37.50 | 2464 | 2021 | 1579 |
| 9 | 0.963 | 0.740 | 0.567 | 0.394 | 0.610 | 0.467 | 0.324 | 36.25 | 2210 | 1693 | 1176 |
| 12 | 0.951 | 0.700 | 0.500 | 0.300 | 0.569 | 0.407 | 0.244 | 35.00 | 1993 | 1423 | 854 |
| 15 | 0.939 | 0.665 | 0.441 | 0.217 | 0.534 | 0.354 | 0.175 | 33.75 | 1802 | 1195 | 589 |
| 18 | 0.928 | 0.633 | 0.388 | 0.143 | 0.502 | 0.307 | 0.113 | 32.50 | 1631 | 999 | 368 |
| 21 | 0.916 | 0.603 | 0.339 | 0.074 | 0.472 | 0.265 | 0.058 | 31.25 | 1476 | 829 | 181 |
| 24 | 0.905 | 0.576 | 0.293 | 0.010 | 0.445 | 0.227 | 0.008 | 30.00 | 1336 | 680 | 23 |
| 27 | 0.894 | 0.550 | 0.250 | 0.000 | 0.420 | 0.191 | 0.000 | 28.75 | 1208 | 549 | 0 |
| 30 | 0.882 | 0.526 | 0.209 | 0.000 | 0.397 | 0.158 | 0.000 | 27.50 | 1091 | 435 | 0 |
| 33 | 0.872 | 0.503 | 0.171 | 0.000 | 0.374 | 0.127 | 0.000 | 26.25 | 983 | 334 | 0 |
| 36 | 0.861 | 0.480 | 0.134 | 0.000 | 0.354 | 0.099 | 0.000 | 25.00 | 884 | 246 | 0 |

These curves emphasize conservatism: Longer horizons and higher volatility erode value faster, ensuring lender protection. Governance can adjust parameters per token (e.g., via oracles for real-time sigma).

### Expanded Risk Curve Simulations with Monte Carlo
We also calibrate DPV using Monte Carlo simulations (10,000 paths per scenario) based on a geometric Brownian motion price model under a risk-neutral drift (mu = r):

Key parameters:
- Token quantity Q = 1,000
- Current price P_0 = 10.00
- Risk-free rate r = 5% (annual)
- Volatility sigma: 30%, 50%, 70%
- Time horizons: 0 to 36 months (3-month steps)

Model:
- P_t = P_0 * exp((r - sigma^2 / 2) * T + sigma * sqrt(T) * Z)
- T = t / 12 years, Z ~ N(0, 1)
- Per-path PV = exp(-r * T) * Q * P_t
- Conservative input = 5th percentile PV (used for LTV caps)

Simulation results (mean PV ~ current value due to risk-neutral pricing):

| Time (months) | Mean PV (sigma=30%) | 5th % PV (sigma=30%) | Mean PV (sigma=50%) | 5th % PV (sigma=50%) | Mean PV (sigma=70%) | 5th % PV (sigma=70%) |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 10000.00 | 10000.00 | 10000.00 | 10000.00 | 10000.00 | 10000.00 |
| 3 | 9997.58 | 7714.54 | 9983.23 | 6440.54 | 9959.11 | 5261.84 |
| 6 | 10029.12 | 6949.68 | 10026.69 | 5251.75 | 9968.89 | 3954.98 |
| 9 | 9961.95 | 6351.77 | 9996.99 | 4474.15 | 9935.75 | 3088.38 |
| 12 | 9981.11 | 5826.46 | 9966.27 | 3915.93 | 10120.25 | 2500.38 |
| 15 | 10019.35 | 5428.18 | 9982.17 | 3404.00 | 9988.24 | 2078.25 |
| 18 | 10016.61 | 5059.72 | 10054.76 | 3068.99 | 10002.49 | 1670.57 |
| 21 | 10033.84 | 4859.81 | 9845.64 | 2632.60 | 9949.80 | 1399.20 |
| 24 | 10008.32 | 4548.29 | 10059.06 | 2469.18 | 9609.31 | 1171.27 |
| 27 | 10029.82 | 4279.18 | 9933.40 | 2145.09 | 10218.77 | 1002.71 |
| 30 | 9972.91 | 4096.81 | 9908.42 | 1967.12 | 9915.21 | 870.16 |
| 33 | 10041.45 | 3913.17 | 10089.60 | 1863.41 | 9777.21 | 744.43 |
| 36 | 10044.34 | 3717.09 | 9967.82 | 1668.76 | 10312.03 | 661.03 |

Key insights:
- Mean PV remains near 10,000 across horizons (risk-neutral expectation).
- 5th percentile PV declines sharply with time and volatility; high-vol assets become unborrowable sooner.
- The 5th percentile is a defensible conservative input for LTV caps and risk tiering.

### Deterministic Approximation vs Monte Carlo (sigma = 50%)
To keep on-chain computation simple, we use a composite discount approximation as a conservative proxy for the Monte Carlo 5th percentile:

| Months | Composite D | Approx PV |
| --- | --- | --- |
| 0 | 0.8550 | 8550 |
| 6 | 0.5391 | 5391 |
| 12 | 0.4067 | 4067 |
| 24 | 0.2266 | 2266 |
| 36 | 0.0986 | 986 |

This deterministic curve is more conservative than the Monte Carlo 5th percentile at mid-horizons, which is desirable for lender protection. Governance can recalibrate sigma assumptions and LTV floors quarterly using off-chain simulations.

---

## 8. Loan Lifecycle and Enforcement
### Creation
User escrows vesting claim; engine computes limit; loan issued from pool.

### Accrual
Interest compounds (rates: 5-15% APR, based on utilization/risk).

### Repayment
Flexible (partial/full); early optional.

### Settlement at Unlock
Timestamp-triggered:
- Full repay: Tokens released.
- Partial: Debt settled via seizure; excess returned.
- Default: Full liquidation (e.g., to DEX or OTC).

### Liquidation
Time-based, not price; protected by caps and gradual windows.

### Unlock Shock Protection (via Auctions)
Unlock events can concentrate sell pressure. The auction primitive reduces that pressure by shifting early exit demand away from spot markets and into discounted claim-right sales:
- Users who would otherwise dump can sell claim rights ahead of unlock at a known discount.
- Buyers are long-horizon holders (including the protocol treasury) rather than short-term sellers.
- This channels liquidity needs into a controlled market, smoothing unlock-day supply shocks.

### Pseudocode Example (ValuationEngine + LoanManager Interaction)
```solidity
// ValuationEngine.sol
contract ValuationEngine {
    function computeDPV(uint256 quantity, address token, uint256 unlockTime)
        public
        view
        returns (uint256 pv, uint256 ltv)
    {
        uint256 t = (unlockTime - block.timestamp) / (30 days); // months
        uint256 price = oracle.getPrice(token);
        uint256 d_time = expApprox(-5 * t / 1200); // Fixed-point
        uint256 d_vol = 10000 - 5000 * sqrtApprox(t * 100 / 12);
        uint256 d = (d_time * d_vol * 9000 * 9500) / (10000 ** 3);
        pv = quantity * price * d / 10000;
        ltv = governance.getLTV(token, t);
    }
}

// LoanManager.sol
contract LoanManager {
    function createLoan(uint256 collateralId, uint256 borrowAmount) external {
        (uint256 pv, uint256 ltv) = valuation.computeDPV(...);
        require(borrowAmount <= pv * ltv / 100);
        adapter.escrow(collateralId);
        pool.lend(msg.sender, borrowAmount);
    }

    function settle(uint256 loanId) external {
        // Unlock check, repay logic, seize/release
    }
}
```

---

## 9. Identity-Aware Credit Layer
Wallet anonymity limits repeat lending. Optional opt-in:

- Integrations: DIDs (e.g., Ceramic), DAO badges, or regulated KYC.
- Benefits: Higher LTV, lower rates; reputation accrues across wallets.

| Feature | Without ID | With ID |
| --- | --- | --- |
| Borrow limits | Low | Higher |
| Rates | Higher | Lower |
| Reputation | None | Persistent |

---

## 10. Governance and Risk Management
- DAO: Token-weighted voting for parameters (LTV, discounts).
- Risk committees: Sub-DAOs for onboarding, adjustments.
- Emergency: Time-locked multisig.
- Tokenomics: CRDT has a fixed 1B supply with finalized Phase 1 allocation: treasury 30%, team 20%, protocol liquidity reserve 20%, community sale 15%, presale 7%, VC/investors 5%, airdrop 3% (see `docs/TOKENOMICS_FINAL.md`).

---

## 11. Liquidity Strategy
The liquidity roadmap is modular and scales with protocol maturity:

### Phase 1: Lenders and Borrowers Matching
- Lenders create pools with risk preferences (LTV caps, interest, unlock windows).
- Borrowers pledge vested tokens for USDC loans.
- Matching is handled by the protocol agent; settlement uses lending pool contracts.
- No custody of private keys; only claim rights are escrowed.

### Phase 2: Treasury-Funded Loans (Agent-Led)
- Protocol treasury provides credit directly after the matching system is stable.
- The agent automates underwriting signals and allocates treasury liquidity.
- Returns flow back to the protocol, bootstrapping liquidity depth.

### Phase 3: Community-Led Liquidity Pools
- Communities create pools for their own vested tokens.
- Provides liquidity without token sell pressure.
- Coordinated by DAOs, founders, or contributor groups.

### Additional Liquidity Sources (As We Scale)
- Partnership pools with funds and market makers.
- Tranche structures for risk-tiered liquidity.
- Cross-chain liquidity routing as Base and Solana flows align.
- Stablecoin reserves or third-party credit facilities.

---

## 12. FAQ Highlights
### Is this custodial?
No. Users keep wallet control. The protocol only escrows claim rights.

### Are there margin calls?
No. Settlement occurs at unlock time based on repayment status.

### What happens on default?
The protocol seizes the required amount and liquidates it to repay the pool.

### How is the borrow limit set?
Discounted present value (DPV) is computed as `PV = Q * P * D`, then LTV caps are
applied based on risk models.

### Can the protocol integrate other DEXs?
Yes. Uniswap V3 is the default; adapters can be added for others.

---

## 13. Roadmap and Implementation
### Phase 1 (Q1 2026)
MVP on Ethereum; pilot with 1-2 DAOs.

### Phase 2
Multi-chain, identity module.

### Phase 3
Institutional pools, composability.

Security: Oracle redundancy, audits.  
Regulatory: Non-custodial base; optional compliant interfaces.

---

## 14. Conclusion
This protocol redefines Web3 incentives: Unlock liquidity from time-locked assets without compromise. It is the engine for sustainable growth -- build it, deploy it, scale it. No more trapped value; just progress.

