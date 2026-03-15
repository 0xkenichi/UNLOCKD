# Risk Simulation Models

Risk simulation models quantify uncertainty in the discounted present value
(DPV) of locked or vested tokens. They anchor conservative LTV ratios and
protect lenders from downside scenarios (for example, price crashes during
vesting periods). The approach combines deterministic on-chain discounting
with off-chain Monte Carlo simulations for calibration and governance.

## 1) On-Chain Friendly Deterministic Model

Base formula:

`PV = Q * P * D`

Where:

- `Q`: token quantity
- `P`: current market price (Chainlink oracle)
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
~36 months. Use fixed-point math (for example `ABDKMath64x64`) for exp/sqrt.

Expanded deterministic table (Q = 1000, P = 10, liquidity = 0.9, shock = 0.95,
t in months, t_years = t / 12, LTV linearly decays from 40% to 25%):

| Months | D_time | D_vol_low | D_vol_mid | D_vol_high | D_low | D_mid | D_high | LTV (%) | Borrow_low | Borrow_mid | Borrow_high |
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

## 2) Off-Chain Monte Carlo Calibration

Price process (geometric Brownian motion, risk-neutral):

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

Key stats (mean and 5th percentile PV) and implied borrow limits after applying
the 0.855 liquidity/shock factor and time-decayed LTV:

| Months | D_time | Mean_PV_low | Perc5_PV_low | Borrow_Limit_low | Mean_PV_mid | Perc5_PV_mid | Borrow_Limit_mid | Mean_PV_high | Perc5_PV_high | Borrow_Limit_high |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 1.000 | 10000.000 | 10000.000 | 3420.000 | 10000.000 | 10000.000 | 3420.000 | 10000.000 | 10000.000 | 3420.000 |
| 3 | 0.988 | 9996.789 | 7752.171 | 2568.391 | 9998.037 | 6431.476 | 2130.828 | 9987.695 | 5285.896 | 1751.283 |
| 6 | 0.975 | 10015.854 | 6920.155 | 2218.775 | 9952.029 | 5236.439 | 1678.933 | 10019.802 | 3855.141 | 1236.055 |
| 9 | 0.963 | 9993.072 | 6289.160 | 1949.246 | 9959.256 | 4436.642 | 1375.082 | 10100.047 | 3095.467 | 959.401 |
| 12 | 0.951 | 9987.995 | 5819.829 | 1741.584 | 9954.473 | 3893.172 | 1165.032 | 10043.276 | 2436.189 | 729.029 |
| 15 | 0.939 | 9957.202 | 5431.193 | 1567.238 | 9955.239 | 3373.159 | 973.367 | 9832.963 | 2024.718 | 584.258 |
| 18 | 0.928 | 9993.254 | 5101.198 | 1417.495 | 10082.783 | 3074.595 | 854.353 | 9928.222 | 1716.372 | 476.937 |
| 21 | 0.916 | 10047.957 | 4806.996 | 1284.369 | 9933.234 | 2743.366 | 732.993 | 10278.343 | 1425.228 | 380.803 |
| 24 | 0.905 | 10078.019 | 4582.634 | 1175.446 | 10155.368 | 2405.914 | 617.117 | 9891.972 | 1182.367 | 303.277 |
| 27 | 0.894 | 10010.168 | 4359.306 | 1071.572 | 9825.881 | 2188.423 | 537.942 | 9967.894 | 999.758 | 245.753 |
| 30 | 0.882 | 10116.669 | 4223.453 | 993.039 | 9985.285 | 1996.237 | 469.365 | 10182.854 | 907.052 | 213.271 |
| 33 | 0.872 | 10037.852 | 3836.973 | 861.161 | 9969.271 | 1823.868 | 409.344 | 9850.704 | 737.689 | 165.565 |
| 36 | 0.861 | 9999.808 | 3648.004 | 779.761 | 9969.630 | 1660.015 | 354.828 | 9748.286 | 647.845 | 138.477 |

Insights:

- Mean PV stays near 10,000 (risk-neutral expectation).
- 5th percentile drops sharply with time and volatility; high-vol assets
  become unborrowable sooner as tails dominate.
- Use the 5th percentile as the conservative PV input for governance LTV caps.
- On-chain: approximate with precomputed tables or simplified formulas.

## 2.5) Price history: all-time high and all-time low

Price history — in particular **all-time high (ATH)** and **all-time low (ATL)** — should be factored into DPV, LTV, and (optionally) risk-based rate adjustments so that valuations and terms reflect drawdown risk and historical range, not only spot price.

### Why ATH and ATL matter

- **Drawdown from ATH**: If current price is far below ATH, the asset has already shown large downside; collateral value may be more at risk of staying low or falling further. Lenders should get a more conservative valuation and/or lower LTV.
- **Distance from ATL**: Price near ATL can mean “already crashed” (high risk) or “recovery floor” (context-dependent). Used with care, it can avoid double-penalizing assets that have already repriced.
- **Range as volatility proxy**: The historical range (ATH − ATL) relative to current or mid price gives a simple, robust proxy for volatility when no live vol feed exists.

### Definitions and data source

- **ATH**: Highest observed price for the collateral token over a defined lookback (e.g. since listing, or rolling 12/24 months). Governance sets the lookback and source.
- **ATL**: Lowest observed price over the same (or symmetric) lookback.
- **Data source**: Standard spot oracles (e.g. Chainlink) typically do not expose ATH/ATL. Options: (1) custom oracle or Chainlink Data Streams / Resolver that maintains ATH/ATL; (2) off-chain indexer (e.g. backend or subgraph) that tracks highs/lows and is used for risk tiers or max-borrow caps; (3) governance-set per-token ATH/ATL updated periodically. Staleness and manipulation resistance (e.g. min observation count, sanity bounds) must be defined.

### Incorporating ATH and ATL into calculations

**1) Drawdown from ATH (primary)**

- Define drawdown:  
  `drawdown_bps = (ATH - P) / ATH * 10000`  
  (e.g. P = 6, ATH = 10 → 4000 bps = 40% drawdown.)
- **Effective price cap for PV**: Use a price floor that reflects how far we trust current price relative to ATH, e.g.  
  `P_eff = min(P, ATH * (1 - max_drawdown_penalty))`  
  or apply an extra discount factor:  
  `D_drawdown = 1 - k_drawdown * (drawdown_bps / 10000)`  
  with governance cap on how much drawdown can reduce D (e.g. cap at 20–30% extra discount).
- **LTV**: Reduce LTV when drawdown is large (e.g. LTV_adj = LTV_base * (1 - drawdown_penalty_bps / 10000)), with a floor so the asset remains borrowable at reduced size.

**2) Range-based volatility proxy**

- Define:  
  `range_ratio = (ATH - ATL) / P_mid`  
  where `P_mid = (ATH + ATL) / 2` or use current P with bounds. High range_ratio → treat as higher volatility.
- Use to **adjust sigma** in the deterministic model (section 1):  
  `sigma_eff = max(sigma_base, k_range * range_ratio)`  
  so that assets with wide historical swings get a stronger volatility penalty in `D_vol` and in LTV.

**3) Distance from ATL (optional)**

- Define:  
  `recovery_ratio = P / ATL`  
  (e.g. P = 2, ATL = 1 → ratio 2).
- Optional use: if P is only slightly above ATL (e.g. recovery_ratio < 1.2), apply an extra conservatism (tighter LTV or extra discount) to reflect “just off the bottom” risk. If recovery_ratio is high, avoid adding a second penalty on top of drawdown so that assets that have already crashed are not over-penalized relative to drawdown-from-ATH.

### Implementation options

| Layer        | ATH/ATL usage |
|-------------|----------------|
| **On-chain** | If ATH/ATL are available via oracle or storage: in `ValuationEngine` (or a wrapper), compute `P_eff` or `D_drawdown` and pass into `computeDPV`; optionally adjust LTV and/or sigma from range_ratio. |
| **Off-chain** | Backend or indexer computes drawdown and range; returns risk tier or max LTV / max borrow per token; frontend and/or agent use this before calling `createLoan`. On-chain still uses current price and existing D; ATH/ATL act as gating or tier selection. |
| **Governance** | Risk committee sets per-token or per-class ATH/ATL (or lookback policy), drawdown penalty caps, and range→sigma mapping; these feed on-chain params or off-chain rules. |

### Summary

- **ATH** and **ATL** are first-class risk inputs: drawdown from ATH tightens valuation and LTV; (ATH − ATL) range can proxy volatility; distance from ATL can add optional conservatism when price is barely above ATL.
- Data can come from a dedicated oracle, an indexer, or governance-updated params; consistency and staleness rules must be defined.
- This section should be reflected in `SECURITY_ORACLES_AND_PARAMETERS.md` (oracle/parameter checklist) and in any future `ValuationEngine` extension that accepts ATH/ATL or derived inputs.

## 3) Advanced / Alternative Models

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

## 4) Implementation Recommendations

- **On-chain**: keep the deterministic model for speed and predictable gas.
- **Off-chain**: run Monte Carlo in Python (quarterly) to calibrate
  parameters, then feed results into DAO proposals.
- **Governance**: allow a risk committee to vote on `sigma` per token class
  (blue chip vs memecoin).
- **Monitoring**: track defaults vs simulated tail risks (for example via a
  Dune Analytics dashboard).
