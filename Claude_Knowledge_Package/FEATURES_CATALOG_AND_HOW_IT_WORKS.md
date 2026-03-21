# Vestra Protocol: Features Catalog & How It Works

## 1. Core Borrowing & Lending
- **Vesting-Collateralized Loans**: Users escrow their vesting claim rights (Sablier, Superfluid, Streamflow) to borrow USDC.
- **dDPV (Dynamic Discounted Present Value)**: Real-time calculation of collateral value based on time-to-unlock, volatility, and AI risk factors.
- **Non-Custodial Settlement**: No manual liquidations based on price; instead, the protocol settles debt at the moment of token unlock.
- **Lending Pools**: Lenders provide USDC liquidity to earn yield from borrower interest and protocol fees.

## 2. Risk & AI Intelligence
- **Omega AI Watcher Network**: Off-chain agents monitor ecosystem health and adjust risk multipliers (Ω) predictively.
- **Citadel Guardrails**: Circuit breakers for oracle deviation, sequencer downtime, and "flash pump" detection.
- **Regulatory Quarantine**: Ability to freeze assets in case of extreme market events or regulatory shifts.

## 3. Identity & Reputation (VCS)
- **Vestra Credit Score**: A multi-dimensional score incorporating:
  - **Gitcoin Passport**: Sybil resistance and reputation.
  - **World ID**: Proof of personhood.
  - **EAS (Ethereum Attestation Service)**: Verifiable credentials.
  - **On-Chain Activity**: History of successful repayments and general DeFi participation.
- **Tiered Benefits**: "Titan" and "Premium" ranks unlock higher LTVs and lower interest rates.

## 4. Multi-Chain Sovereignty
- **Unified Registry**: Centralized contract management across Sepolia, Base, and ASI Chain.
- **Cross-Chain Oracles**: Flexible integration with Chainlink and custom Pre-TGE oracles for unlisted assets.

---

### Implementation Status
| Feature | Status | Priority |
| :--- | :--- | :--- |
| Borrowing Flow | Live | High |
| dDPV Engine | Live | High |
| VCS Tier System | In Progress| Medium |
| AI Watcher Integration | Planned | Medium |
| Cross-Chain Bridging | Research | Low |
