# Product Requirements Document (PRD) - Vestra Protocol

**Status**: Draft | **Version**: 1.0 | **Date**: March 2026

## 1. Executive Summary
Vestra Protocol is a DeFi credit primitive designed to unlock liquidity for users holding non-transferable, locked, or vesting token claims. By utilizing a deterministic valuation engine and a non-custodial lending framework, Vestra allows users to borrow against their future wealth without sacrificing their long-term alignment with the protocols they support.

## 2. Product Vision & Goals
### Vision
To become the foundation of the "Vesting Economy," bridging the gap between future token claims and immediate liquidity needs.

### High-Level Goals
- **Liquidity Acceleration**: Provide immediate stablecoin liquidity against illiquid vesting claims.
- **Risk Mitigation**: Implement robust, deterministic risk controls (DPV/LTV) to protect lenders and the protocol.
- **Permissionless Efficiency**: Enable a seamless, non-custodial experience for both borrowers and lenders.
- **Ecosystem Alignment**: Ensure borrowers maintain their governance and vesting status while leveraging their assets.

## 3. User Personas
### A. The Aligned Contributor (Borrower)
- **Profile**: Early employee or founder with significant vesting tokens.
- **Problem**: Needs capital for life expenses or diversification but doesn't want to sell or cannot sell due to lockups.
- **Goal**: Borrow USDC against vesting claims at a fair rate.

### B. The Alpha Yield Seeker (Lender)
- **Profile**: DeFi user or institutional lender looking for stable yields.
- **Problem**: Traditional DeFi yields are volatile or compressed.
- **Goal**: Provide liquidity to Vestra pools for consistent returns backed by high-quality vesting collateral.

### C. The Risk Analyst/DAO
- **Profile**: Governance participants and risk researchers.
- **Problem**: Monitoring protocol health and adjusting parameters.
- **Goal**: Ensure the protocol remains solvent through proper oracle integration and parameter management.

## 4. Functional Requirements

### 4.1. Borrowing Flow
- **Collateral Onboarding**: Support EIP-712 or custom escrow wrappers for various vesting standards (Sablier, custom escrows, etc.).
- **Valuation Engine**: Dynamic Discounted Principal Value (DPV) calculation based on time-to-unlock and asset volatility.
- **Loan Origination**: Real-time LTV checks and instant USDC disbursement.
- **Active Loan Management**: Dashboard for monitoring health factor and liquidation risk.

### 4.2. Repayment & Closure
- **Flexible Repayment**: Support partial or full repayment in the borrowed currency (USDC).
- **Collateral Release**: Automated release of vesting claims upon loan closure.
- **Auto-Repay via Vesting**: Option to use streamed tokens to automatically pay down loan principal and interest.

### 4.3. Risk & Liquidations
- **Oracle Integration**: Multi-source price feeds (Chainlink, Pyth) with TWAP fallback.
- **Liquidation Auction**: Dutch auction mechanism for seizing and selling collateral rights in case of default.
- **Stability Pool**: Buffer to absorb bad debt and maintain protocol solvency.

### 4.4. Governance
- **Parameter Control**: DAO voting on LTV caps, interest rate curves, and whitelisted collateral.
- **Emergency Pause**: Multi-sig/Circuit breaker functionality for critical failures.

## 5. Non-Functional Requirements
- **Security**: 100% code coverage for core contracts; multi-audit roadmap.
- **Performance**: Sub-5 second latency for backend indexing and UI updates.
- **Scalability**: Support for multiple L2s (Base, Optimism, Arbitrum).
- **UX/UI**: Premium, "Command Center" aesthetic with clear risk visualizations.

## 6. Success Metrics (KPIs)
- **TVB (Total Value Borrowed)**: Target $50M in the first 6 months.
- **Utilization Rate**: Maintain 70-85% utilization of lending pools.
- **Liquidation Efficiency**: Zero bad debt incurred during market volatility.
- **User Growth**: Number of unique "Vesting Borrowers."

---

> [!IMPORTANT]
> This PRD is a living document and should be updated as the protocol evolves through testnet milestones.
