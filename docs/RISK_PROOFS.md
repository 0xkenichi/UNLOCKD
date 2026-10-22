# Vestra v2 risk model: theorems, proofs and tests

This is the mathematical argument behind the yellow paper's lending rule. Each theorem states its
proof and the test that checks it against the code as written: `packages/risk/test/proofs.test.js`,
seeded random draws over every input, rerunnable on fresh draws with `PROOF_SEED=n`.

The theorems describe what holds **when the price does not move against the loan**. They cover
interest, time, vesting, accounting and settlement. Price moves are not covered by any theorem,
because no rule can promise a lender is safe from an arbitrary crash. They are covered by the
stress test (`packages/risk/bin/stress.js`, results in `packages/risk/data/STRESS.md`), which
plays every setting through every family of crash, at every timing, on every stream shape.

## Notation

A stream delivers quantities `q_i` at days `d_i` (tranche 0 is already vested and in escrow).
At day `t`, with oracle price `P`, volatility `σ`, latency `L` days and confidence `α < ½`:

- Horizon: `τ_i = (max(0, d_i − t) + L) / 365`
- Multiplier: `M_α(τ) = exp(μτ − σ²τ/2 + z_α σ √τ)`, where `z_α = Φ⁻¹(α) < 0` and `μτ ≤ 0` is the unlock drift
- Liquidity cost, charged on the whole position: `c = min(c_max, Y σ_d √(Q P / (D · ADV)))`, where `Q = Σ q_i`
- Hold credit value: `CV_α(t) = Σ_i q_i P m_i (1 − c)`, where `m_i` is `M_α` averaged over the interval in which tranche `i` vests (Simpson's rule)
- Blend mode: `m_i = max(m_i^hold, M_α(L/365) · e^{−k·wait_i})`, where `wait_i = max(0, d_i − t)/365`
- Maximum loan, at simple rate `r`, maturing on day `T`:
  `B = Ω · min( CV_αo(t₀), min over grid intervals [g, g′] of CV_αℓ(g) / (1 + r(g′ − t₀)) )`.
  The grid spans `[t₀, T]` with at most 121 points, and `T` is included on its own.
- The loan is liquidatable at `t` when `D(t) > CV_αℓ(t)`.

## Theorems

**T1. Bounds.** `0 ≤ CV_α(t) ≤ Q·P`.
*Proof.* With `z_α < 0` and `μτ ≤ 0`, every exponent in `M_α` is ≤ 0, so `0 < M_α ≤ 1`. An average
of values in `(0, 1]` stays in `(0, 1]`. The blend term is a product of two such factors. The
cost `c` lies in `[0, c_max]` with `c_max < 1`. Each term is therefore in `[0, q_i P]`. ∎
*Test:* T1, 10 000 draws.

**T2. Quantity is conserved.** For every day `t`, `Σ_i q_i = total`.
*Proof.* The tranches are:
- the vested amount `V(t)`;
- a cliff lump `V(from) − V(t)`;
- deliveries `V(e_k) − V(e_{k−1})` over a grid whose last point is `end`, where `V(end) = total`.

The sum telescopes to `total`. ∎ *Test:* T2, 10 000 draws, relative error < 1e-9.

**T3. Stricter confidence never lends more.** `α₁ < α₂ ⇒ CV_α₁ ≤ CV_α₂`, at the same marketability rate.
*Proof.* `z_α` increases in `α`, so `M_α(τ)` increases in `α` for every `τ`. Averages and maxima
of increasing functions are increasing. ∎ *Test:* T3, 5 000 draws.

A corollary is the origination safety gap: per tranche, `CV_αℓ / CV_αo = exp((z_αℓ − z_αo) σ √τ) > 1`. A new loan
at the maximum therefore starts strictly inside the liquidation line.

**T4. More volatility never lends more.**
*Proof.* `∂ ln M/∂σ = −στ + z_α √τ < 0`, because both terms are negative. The cost `c` increases in `σ`. ∎
*Test:* T4, 5 000 draws.

**T5. At an unchanged price, credit value never falls as time passes.**
*Proof (continuous schedule).* Each tranche's horizon `τ` falls as `t` rises, and
`∂ ln M/∂τ = −σ²/2 + z_α σ/(2√τ) < 0`, so `M` rises. A tranche that vests becomes part of
tranche 0, where `τ = L`, the minimum possible horizon, and its `M` is at its maximum. In blend mode
`wait` falls, so the sale term rises. `Q` is constant until paydowns, so `c` is constant.
Every term is non-decreasing. ∎
*For the code:* the weekly grid moves with `t`, so the discretised sum is checked numerically
rather than proved. The check covers 5 000 draws at both confidence levels with no violation
beyond 1e-9 relative. This theorem was false in an earlier version that charged liquidity cost
per tranche. Square-root impact is superadditive, so tranches merging into escrow raised the
cost. The fix was the position-level cost above, and T5 is the test that caught the problem.

**T6. Size and price are penalised, never rewarded.** For `λ > 1`, `CV(λQ) ≤ λ·CV(Q)` and `CV(λP) ≤ λ·CV(P)`.
*Proof.* Scaling multiplies every term by `λ`, except `(1 − c)`, which can only fall because `c`
increases in `Q·P`. ∎ *Test:* T6, 5 000 draws.

**T7. A loan at the maximum is never liquidatable if the price does not move.** For every day `t ∈ [t₀, T]`,
`D(t) = B(1 + r(t − t₀)) ≤ CV_αℓ(t)`.
*Proof.* Take `t` in a grid interval `[g, g′]`. By the definition of `B`, then `t ≤ g′`, then T5:

`D(t) ≤ CV(g) · (1 + r(t − t₀)) / (1 + r(g′ − t₀)) ≤ CV(g) ≤ CV(t)`.

The day `T` itself is covered by its own term. ∎
*Test:* T7, 800 draws checked on every single day of the loan.
*History:* an earlier version took the minimum only at the grid points. The daily check found
loans liquidatable between grid points: a cliff stream at 67% APR. The interval bound above
replaced it.
*For the contracts:* this bound assumes simple interest. If the pool compounds, the same proof
holds with `e^{r(g′−t₀)}` in place of `1 + r(g′ − t₀)`.

**T7u. The same, with an unlock calendar.** With unlock drift, T5 can fail. Escrowed tokens
are valued with the drift of whatever unlocks near *today*, so credit value can dip as a large
unlock approaches, and the interval bound no longer follows. The code therefore checks the cap
on every day when unlock data is present. T7 then holds by construction: `B ≤ CV(t)/(1 + r(t − t₀))`
for every day `t`. Health checks see more circulating supply as the loan ages, so each unlock is a
smaller share of supply and the drift penalty only shrinks.
*Test:* T7u, 300 draws with random cliffs of up to 80% of circulating supply, checked on every day.

**T8. Origination is never at the line.** `B ≤ CV_αo(t₀) ≤ CV_αℓ(t₀)`.
*Proof.* The first inequality is the first term of the minimum. The second is T3. ∎ *Test:* T8, 5 000 draws.

**T9. Paydowns sell only vested tokens.** After selling `s ≤ V(t)` vested tokens:
- future tranches are unchanged;
- the remaining quantity is `total − s`.

*Proof.* Paydowns reduce only tranche 0, by construction. ∎ *Test:* T9, 5 000 draws.

**T10. Settlement.** In every loan:
- the lender's loss is `max(0, D − proceeds)` and the borrower's surplus is `max(0, proceeds − D)`;
- the two are never both positive;
- the loss is at most the debt.

*Test:* T10, 1 500 random loans on random paths with gaps (both models). The stress run checks
the same invariants inline on every loan, and a breach aborts it.

**T11. The coarse grid is sound and tight.** The grid cap is never above the daily minimum,
because of T7's argument. It is never below that minimum by more than a factor of
`1 + r·step/365`, because `(1 + r(g′ − t₀)) / (1 + r(g − t₀)) ≤ 1 + r·step/365`.
For a one-year loan at 15% with a 4-day step, that is 0.16% of the loan.
*Test:* T11, 400 draws against a daily grid.

## What the theorems do not say

- **Nothing about price falls.** Overnight gaps, bleeds and regime changes are what the stress
  grid is for.
- **They trust the oracle.** The stress grid includes a stale (two-day) oracle and a 30% spike on
  origination day.
- **T5 for the discretised schedule is a numerical check, not a proof.** T7 rests on it.
