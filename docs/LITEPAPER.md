# VESTRA: Credit Markets for Time-Locked Digital Assets
## Litepaper (v2.1)

Date: February 7, 2026  
Authors: Protocol Genesis Team

### Summary
Vesting and lockups protect long-term alignment, but they trap real economic value. VESTRA enables borrowing or selling claim rights against time-locked tokens without taking custody or breaking vesting rules. Loans are issued non-custodially, settle automatically at unlock, and are priced with conservative risk controls. Optional identity signals and privacy modes improve terms while keeping settlement enforceable on-chain.

### The Problem
- Locked tokens have market value but zero immediate utility.
- DeFi lending requires liquid collateral and does not accept time-locked claims.
- OTC sales and custodial lenders demand steep discounts or custody.

### The Solution
Borrow against claim rights, valued using discounted present value (DPV):

PV = Q * P * D

Where Q is quantity, P is oracle price, and D is a composite discount factor (time, volatility, liquidity, unlock impact, protocol risk). Borrowing is capped by time-aware LTV limits.

### What Makes VESTRA Different
- Escrow of claim rights, not tokens.
- Deterministic, on-chain settlement at unlock.
- Conservative, risk-first valuation and LTV caps.
- Optional identity and privacy controls per pool.
- Composable adapters for common vesting standards.
- Optional auction path for debt-free exits.

### How It Works (Loan Path)
1. Escrow claim rights via a vesting adapter.
2. Valuation engine computes PV and max borrow.
3. Loan manager issues loan from a lending pool.
4. Borrower can repay anytime pre-unlock.
5. At unlock, settlement enforces repayment first.

### Claim-Rights Escrow and Enforcement
VESTRA does not custody tokens. Instead, adapters wrap vesting schedules and expose a callable release function:
- Tokens remain in the original vesting contract until unlock.
- At unlock, the loan contract settles debt before any release.
- Settlement is permissionless once `block.timestamp >= unlockTime`.

Outcomes at unlock:
- Full repay: tokens release to borrower.
- Partial repay: protocol seizes only the amount needed.
- Default: protocol seizes unlocked tokens for repayment.

### Risk Model (Conservative by Design)
VESTRA cannot liquidate early. Risk controls are front-loaded:
- DPV discount incorporates time, volatility, liquidity, and unlock impact.
- LTV caps are conservative (target 20-40%) and time-aware.
- Pool governance can reprice or pause volatile assets.

Example: 50,000 tokens at $1 with a 12-month unlock and 10% APR  
If D = 0.407, PV = ~$20,350. At 30% LTV, max borrow is ~$6,105.  
At unlock, debt with interest is ~$6,715.

### Liquidity Sources and Incentives
Primary liquidity providers:
- DAOs and protocols seeking stable yield on conservative collateral.
- Market makers and treasury managers optimizing idle stablecoin.
- Token issuers providing community liquidity without forced sales.

Incentives: time-locked collateral, conservative LTVs, deterministic settlement, and pool-level risk governance.

### Optional Auction Path (Debt-Free Exit)
Users can sell claim rights instead of borrowing:
1. Escrow claim rights as a non-transferable NFT.
2. Run a Dutch, English, or Sealed Bid auction (1-7 days).
3. Winner pays stablecoins; seller receives proceeds minus fee.
4. Winner receives tokens at unlock.

### Privacy and Identity (Opt-In)
Some communities discourage early exits. VESTRA supports:
- Optional identity proofs for better terms.
- Selective disclosure of eligibility without identity leakage.
- Relayed transactions to reduce linkability.
- Pool-level controls over privacy modes.

Privacy is opt-in and policy-driven. Settlement remains public and enforceable.

### Security and Safety Guarantees
- Claim rights cannot be released before settlement.
- Settlement always resolves outstanding debt first.
- Loans cannot exceed max borrow at issuance.
- Admin actions are minimized and policy-gated.

### Roadmap
- Testnet MVP live with public docs and demo flow.
- Mainnet MVP with initial DAO pilots.
- Multi-chain expansion and identity enhancements.
- Institutional pools and composable extensions.

### Why Now
Locked token value is large, persistent, and cyclically painful in low-liquidity markets. VESTRA turns locked value into productive capital while preserving vesting integrity and long-term alignment.

Note: This document is informational and not legal or financial advice.

