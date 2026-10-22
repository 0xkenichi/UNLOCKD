# Findings — what the engine says about the deployed parameters

Measured against the contracts at ef2e300 with the defaults in `src/params.js`.
Reproduce any figure with `npm test` or `npm run audit`; the synthetic tokens are stated
models, not market data.

## 1. Lenders are well protected — except against overnight gaps

With continuous price moves a loan is liquidated while the stream is still worth about
three times its debt, so the auction clears above the debt. Across all four fixture tokens,
expected lender loss is 0.00% a year and the worst-1% outcome is ≤ 0.1% of principal.

Losses come from gaps: a −80% overnight move costs lenders 41% of principal on a rank II
loan at max (60% on rank I, 5% on rank III); a uniform −70% crash over 3 days costs 7.7%.
No LTV a borrower would accept prevents this — it is what the insurance reserve is for, and
the reserve should be sized to the gap loss on outstanding exposure per token.

## 2. Borrowers at max LTV are usually liquidated

The price drop that triggers liquidation at max borrow is fixed by the rank, not by the token:

| Rank | Max LTV → threshold | Buffer | Liquidated within 1 year at σ = 40% / 60% / 90% / 120% |
|---|---|---|---|
| I | 50% → 65% | 23% | 67% / 78% / 87% / 92% |
| II | 35% → 50% | 30% | 51% / 68% / 81% / 88% |
| III | 20% → 35% | 43% | 24% / 47% / 68% / 80% |

(Closed form, confirmed by simulation within 2 pp.) A liquidation costs the borrower 20–39%
of the stream's market value: the auction buyer's discount for locked tokens and the price
impact, net of the surplus returned.

Two consequences:
- **Rank I, the "best" collateral, has the thinnest buffer.** Under a fast crash it is the
  first to lose lender money.
- **The haircut ignores the token and the time.** `(1 − σ/2)` uses one global σ (50%) for
  every token and does not grow with time to unlock; the buffer `1 − LTV/threshold` is the
  same for a stablecoin-like token and a memecoin, for one month or three years.

## 3. Interest alone can liquidate a loan

Debt grows at the floating APR; collateral value grows only at the rank's discount rate as
the time discount unwinds. With no price move at all, a loan at max is liquidated after:

| Borrow APR | Rank I | Rank II | Rank III |
|---|---|---|---|
| 15% (kink) | 2.0 years | 3.6 years | 11.2 years |
| 45% | 7.3 months | 10.7 months | 1.6 years |
| 75% (100% utilisation) | 4.4 months | 6.1 months | 10.3 months |

A spike in pool utilisation therefore pushes every open loan toward liquidation at once.

## 4. Documents and code disagree

`packages/docs/RISK_MODELS.md` describes a time-scaled volatility haircut `1 − σ·√t`,
per-token σ and a liquidity factor. The contracts implement `(1 − σ/2)` with one global σ.

## Suggestions for the contract rebuild (not made here)

1. **Per-token σ, scaled by time:** e.g. haircut `= 1 − min(cap, k·σ_token·√T)`, with σ_token
   set by governance from this engine's calibration (`sigmaEquivalentPct` in each report).
2. **Make the buffer depend on risk:** set the liquidation threshold per rank *and* token so
   that `1 − LTV/threshold` covers a k-day move of the token (e.g. 3× its daily σ × √3),
   instead of a fixed gap. Rank I in particular needs a wider gap.
3. **Bound the interest drift:** cap the borrow APR a loan can accrue relative to its
   collateral's discount rate, or accrue against a fixed rate per loan, so utilisation spikes
   cannot liquidate healthy loans en masse.
4. **Size insurance to gap risk:** target reserve ≥ Σ (exposure × gap loss) per token, using
   the reported gap figure.

Until then, the per-token levers that exist (Ω, hard LTV cap, per-loan value cap) are what
`calibrate` sets, and the Borrow page shows each borrower the price that would liquidate
them before they borrow.
