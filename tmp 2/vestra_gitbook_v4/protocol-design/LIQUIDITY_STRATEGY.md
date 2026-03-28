# Liquidity Strategy: Tiered Pools & Risk Tranching

Vestra's liquidity approach ensures that lenders can choose their risk exposure while providing the necessary depth for multi-scale borrowers.

## Tiered Collateral Pools
Vestra categorizes assets into three distinct Tiers to manage liquidity concentration and LTV:

### Tier 1: Bluechip Ecosystems (e.g., ARB, OP, ETH)
- **LTV**: 40-50%
- **Liquidity Strategy**: Deep, institutional-grade pools with minimal slippage.
- **Interest Rates**: Lowest premiums (Incentivized repayment).

### Tier 2: Mid-Cap Projects
- **LTV**: 20-30%
- **Liquidity Strategy**: Diversified pools with larger spreads to compensate for volatility.
- **Interest Rates**: Moderate premiums.

### Tier 3: Pre-TGE & High-Risk
- **LTV**: 5-10%
- **Liquidity Strategy**: Isolated pools with **Auto-Hedge Tranches**.
- **Interest Rates**: Highest premiums.

## The Auto-Hedge Yield Tranche
For any Tier 3 loan, the protocol automatically diverts **5-10%** of the borrowed stablecoin into a protocol-owned yield strategy (e.g., staked ETH or Aave USDC).
- **Protection**: If the collateral token defaults and drops 99%, the compounded yield from this tranche acts as a buffer to ensure lenders are made whole.
- **Refund**: If the borrower repays successfully, they receive the principal of the hedge minus a small protocol insurance fee.

## Concentration Limits
The protocol enforces a **Liquidity Cap** on every collateral type. No single asset can represent more than **15%** of the Total Protocol Debt to prevent system-wide contagion in the event of a specific project failure.
