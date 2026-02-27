# Monte Carlo Risk Sims + LTV Borrow Limits
Date: January 28, 2030  
Scope: Conservative borrow limits from 5th percentile PV with LTV decay.

## Core Assumptions
- Quantity `Q = 1,000`
- Price `P0 = $10.00`
- Risk‑free rate `r = 5%` per year
- Volatility `σ = 30%, 50%, 70%`
- Horizons: 0–36 months
- Paths: 10,000 per case (GBM, risk‑neutral)
- PV = `exp(-r·t) × Q × P_t`
- Conservative PV = 5th percentile
- LTV: linear decay from 40% to 25% over 36 months  
  `LTV(months) = max(25, 40 - (months × 15 / 36))`
- Borrow Limit = 5th % PV × LTV

## Results Table (PV + LTV Borrow Limits)

| Months | LTV % | 5th % PV (30%) | Borrow (30%) | 5th % PV (50%) | Borrow (50%) | 5th % PV (70%) | Borrow (70%) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0  | 40.00 | 10,000.00 | 4,000.00 | 10,000.00 | 4,000.00 | 10,000.00 | 4,000.00 |
| 3  | 38.75 | 7,714.54  | 2,989.38 | 6,408.47  | 2,483.28 | 5,261.84  | 2,039.01 |
| 6  | 37.50 | 6,882.88  | 2,581.08 | 5,233.10  | 1,962.41 | 3,899.98  | 1,462.49 |
| 9  | 36.25 | 6,289.55  | 2,280.00 | 4,447.15  | 1,612.12 | 3,051.49  | 1,106.17 |
| 12 | 35.00 | 5,819.00  | 2,036.65 | 3,858.03  | 1,350.31 | 2,457.60  | 860.16 |
| 15 | 33.75 | 5,426.42  | 1,831.42 | 3,391.00  | 1,144.46 | 2,016.18  | 680.46 |
| 18 | 32.50 | 5,059.72  | 1,644.41 | 3,009.26  | 977.99 | 1,670.57  | 542.94 |
| 21 | 31.25 | 4,792.65  | 1,497.71 | 2,632.60  | 822.69 | 1,399.20  | 437.25 |
| 24 | 30.00 | 4,528.94  | 1,358.68 | 2,416.75  | 725.03 | 1,171.27  | 351.38 |
| 27 | 28.75 | 4,291.55  | 1,233.82 | 2,181.89  | 626.79 | 1,002.71  | 288.28 |
| 30 | 27.50 | 4,076.00  | 1,120.90 | 1,967.12  | 541.46 | 868.05 | 238.71 |
| 33 | 26.25 | 3,878.91  | 1,018.21 | 1,798.04  | 471.74 | 746.65 | 195.85 |
| 36 | 25.00 | 3,697.64  | 924.41 | 1,639.57  | 409.89 | 644.79 | 161.20 |

## Key Insights
- **LTV decay protects lenders**: 40% → 25% over 36 months.
- **Volatility sensitivity**: long‑dated, high‑vol assets quickly compress borrow limits.
- **Practical safety**: 5th percentile + LTV buffer protects against most outcomes.

## Example Application (BIO Token)
Assume 50,000 BIO at $1 (current value $50,000).
- At 12 months, σ=50%: 5th % PV ≈ $19,290 → LTV 35% → Max borrow ≈ $6,751.
- If BIO = $5 at unlock → collateral $250,000 covers debt.
- If BIO = $0.50 → collateral $25,000 still covers ~$6,751 + interest.

## Implementation Recommendations
- On‑chain: deterministic approximation in `ValuationEngine.sol` + governance LTV curve params.
- Off‑chain: quarterly Monte Carlo refresh; propose σ per asset class.
- Frontend: toggle between deterministic PV and 5th‑percentile borrow limit.
- Safety buffer: optional coverage rule (e.g., 5th % PV ≥ 1.5× debt).

