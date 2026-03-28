# Risk Models: Deterministic & Monte Carlo

Vestra's risk framework quantifies uncertainty in the Discounted Present Value (DPV) of locked tokens, protecting lenders from downside scenarios.

## 1. On-Chain Deterministic Model
The protocol uses a simplified, gas-efficient model for real-time borrowing:

$$PV = Q \times P \times D_{composite}$$

**Where**:
- $D_{composite} = D_{time} \times D_{vol} \times D_{liq} \times D_{shock}$
- $D_{time} = e^{-r \cdot t}$ (where $t$ is time to unlock in years)
- $D_{vol} = \max(1 - \sigma \times \sqrt{t}, 0)$

## 2. Off-Chain Monte Carlo Calibration
We run 10,000 paths quarterly using a Geometric Brownian Motion process to calibrate the $\sigma$ (volatility) parameters for each collateral tier.

$$P_t = P_0 \times \exp((r - \frac{\sigma^2}{2}) \times t + \sigma \times \sqrt{t} \times Z)$$

**Calibration Insights**:
- **Tier 1 (Low Vol)**: $\sigma = 30\%$
- **Tier 2 (Mid Vol)**: $\sigma = 50\%$
- **Tier 3 (High Vol)**: $\sigma = 70\%$

## 3. Price History: ATH and ATL
Vestra factors in the **All-Time High (ATH)** and **All-Time Low (ATL)** to prevent over-valuation during market peaks and to gauge drawdown risk.

- **Drawdown Penalty**:
  $$\text{drawdown\_bps} = \frac{ATH - P}{ATH} \times 10,000$$
- **Effective Price Cap**:
  $$P_{eff} = \min(P, ATH \times (1 - \max\_drawdown\_penalty))$$

> [!CAUTION]
> If an asset's price is within 1.2x of its ATL, the protocol applies an extra 15% conservatism haircut to the LTV.
