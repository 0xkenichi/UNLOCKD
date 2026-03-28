# Interest Rates & Pool Lifecycle

Vestra implements an unconventional interest rate model designed specifically for the unique risks of vested collateral.

## The Inverted Duration-Rate Curve
In traditional finance, longer durations carry lower rates. In Web3 vested lending, the longer a loan spans, the higher the volatility risk. Vestra implements an **Inverted Curve**:

- **Short-Term (0-3 Months)**: 3-5% APR (Incentivizes rapid turnover).
- **Medium-Term (3-12 Months)**: 8-12% APR.
- **Long-Term (12+ Months)**: 15-25% APR (Reflects extreme black-swan risk over time).

## Pool Lifecycle Phases

### 1. Inception (Beta)
- Limited TVL per asset.
- Conservative LTV caps (Manual 15%).
- High Omega sensitivity.

### 2. Stabilization
- Standard Tiered LTV (25-40%).
- Automated Omega adjustment enabled.
- Strategic Recourse triggers active.

### 3. Maturation (Vault Autonomy)
- Uncapped lending depth for Bluechip assets.
- Gauge voting for $CRDT holders to prioritize specific pools.
- Full integration with the Futures stack.
