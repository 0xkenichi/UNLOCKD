// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Vestra v2 risk model — the yellow paper, as code.
 *
 *   tranches        the schedule, valued delivery by delivery (yellow paper §2)
 *   multiplier      M_α(τ) = exp((μ − σ²/2)τ + z_α σ √τ)           (§3)
 *   creditValue     CV_α = Σ q_i P M_α(τ_i)(1 − c_i)                (§3)
 *   maxBorrowV2     B_max = Ω · min(CV_αo(t0), CV_αℓ(T_m) e^(−r T_m)) (§4)
 *   isLiquidatableV2 D(t) > CV_αℓ(t), or past maturity + grace      (§4)
 *
 * Time is in days inside this module (the backtest steps daily); horizons are converted to
 * years where the formulas need them. Prices are USD per token; values are USD.
 */

import { DAYS_PER_YEAR, logReturns, realisedVol, ewmaVol, priceImpact } from './market.js';

/** Inverse standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function normInv(p) {
  if (!(p > 0 && p < 1)) throw new Error('p must be in (0, 1)');
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export const V2_DEFAULTS = Object.freeze({
  alphaOrig: 0.005, //        origination confidence (yellow paper §4)
  alphaLiq: 0.05, //          liquidation confidence
  latencyDays: 5, //          L: breach to cash (cure 2 d + selling 3 d)
  sellDays: 10, //            D: days allowed to sell a tranche
  impactY: 1, //              square-root impact constant
  maxLiquidityCost: 0.5,
  unlockImpact: 0.5, //       price drop per unit of circulating supply unlocking in the ±30 d window
  unlockWindowDays: 30,
  sigmaFloor: 0, //           floor on σ (young tokens get a higher floor)
  ewmaLambda: 0.94,
  trancheDays: 7, //          linear streams are discretised weekly
  maxTranches: 156,
  omega: 1,
  // 'hold': the lender holds each tranche to its unlock (the yellow paper as written).
  // 'blend': the better of holding and selling the locked claim after the latency at a
  //          buyer's marketability discount — the ladder's auction is the realistic exit.
  valuationMode: 'hold',
  marketabilityRateOrig: 0.6, //  buyers' required return (per year) assumed at origination: stressed
  marketabilityRateLiq: 0.3 //    and for health checks: normal
});

/** σ at the end of a price history: the larger of 30-day, 90-day and EWMA (§3). */
export function sigmaV2(prices, params = V2_DEFAULTS) {
  const r = logReturns(prices);
  if (r.length < 10) throw new Error('need at least 10 daily returns');
  return Math.max(realisedVol(r, 30), realisedVol(r, 90), ewmaVol(r, params.ewmaLambda), params.sigmaFloor);
}

/**
 * The schedule still to be delivered at day `t`, as tranches { qty, day }.
 * stream: { type: 'cliff' | 'linear' | 'cliff-linear' | 'tranched', start, end, cliff?, total,
 *           steps?: [{ day, qty }] } — days on the same axis as `t`.
 * Tokens already vested by `t` are tranche 0 (day = t): they sit in escrow, liquid now.
 */
export function tranchesAt(stream, t, params = V2_DEFAULTS) {
  const { type, start, end, total } = stream;
  const vestedAt = (day) => {
    if (type === 'tranched') return stream.steps.filter((s) => s.day <= day).reduce((a, s) => a + s.qty, 0);
    if (type === 'cliff') return day >= end ? total : 0;
    const cliff = type === 'cliff-linear' ? stream.cliff : start;
    if (day < cliff) return 0;
    if (day >= end) return total;
    return (total * (day - start)) / (end - start);
  };
  const vestedNow = vestedAt(t);
  const out = [];
  if (vestedNow > 0) out.push({ qty: vestedNow, day: t, vested: true });
  if (t >= end) return out;
  if (type === 'tranched') {
    for (const s of stream.steps) if (s.day > t) out.push({ qty: s.qty, day: s.day });
    return out;
  }
  if (type === 'cliff') {
    out.push({ qty: total, day: end });
    return out;
  }
  // Linear (or after a cliff): deliveries every trancheDays from max(t, cliff) to end.
  const from = Math.max(t, type === 'cliff-linear' ? stream.cliff : start);
  const span = end - from;
  const n = Math.min(params.maxTranches, Math.max(1, Math.ceil(span / params.trancheDays)));
  let prev = vestedAt(from);
  if (from > t && prev - vestedNow > 0) {
    // A cliff lump lands at `from`.
    out.push({ qty: prev - vestedNow, day: from });
  }
  // Each delivery records the interval over which it vests; creditValueOf averages the
  // multiplier over that interval rather than valuing it all at one instant.
  for (let k = 1; k <= n; k++) {
    const endDay = from + (span * k) / n;
    const v = vestedAt(endDay);
    if (v - prev > 0) out.push({ qty: v - prev, day: from + (span * (k - 0.5)) / n, from: from + (span * (k - 1)) / n, to: endDay });
    prev = v;
  }
  return out;
}

/** Price multiplier at confidence α over τ years with conservative log-drift μτ (§3). */
export function multiplier(alpha, sigma, tauYears, muTau = 0) {
  if (tauYears <= 0) return Math.exp(muTau);
  return Math.exp(muTau - 0.5 * sigma * sigma * tauYears + normInv(alpha) * sigma * Math.sqrt(tauYears));
}

/** Unlock-window drift for a tranche at `day`: ln(1 − κ·share of supply unlocking nearby). */
export function unlockDrift(day, { unlocks = [], circulating = 0 } = {}, params = V2_DEFAULTS) {
  if (!(circulating > 0) || !unlocks.length) return 0;
  const share = unlocks.filter((u) => Math.abs(u.day - day) <= params.unlockWindowDays).reduce((a, u) => a + u.amount, 0) / circulating;
  return Math.log(Math.max(0.05, 1 - params.unlockImpact * share));
}

/**
 * Credit value CV_α at day t (§3).
 * market: { price, sigma, advUsd, unlocks?, circulating? }
 */
export function creditValue(stream, t, alpha, market, params = V2_DEFAULTS) {
  return creditValueOf(tranchesAt(stream, t, params), t, alpha, market, params);
}

/**
 * Tranches still held at day t after `soldVested` already-vested tokens left escrow in paydowns.
 * Paydowns only ever sell vested tokens, so future tranches are untouched.
 */
export function remainingTranches(stream, t, soldVested = 0, params = V2_DEFAULTS) {
  const out = [];
  let toRemove = soldVested;
  for (const tr of tranchesAt(stream, t, params)) {
    if (tr.vested && toRemove > 0) {
      const take = Math.min(tr.qty, toRemove);
      toRemove -= take;
      if (tr.qty - take > 0) out.push({ ...tr, qty: tr.qty - take });
    } else {
      out.push(tr);
    }
  }
  return out;
}

/** CV_α of an explicit list of tranches (see creditValue). */
export function creditValueOf(tranches, t, alpha, market, params = V2_DEFAULTS) {
  const { price, sigma, advUsd } = market;
  // Liquidity cost is charged on the whole position, not tranche by tranche. Square-root impact
  // is superadditive, so pricing each tranche alone would make the credit value FALL as
  // tranches vest and merge into one block — a loan at its maximum could then become
  // liquidatable at an unchanged price. Position-level cost only shrinks as the position does.
  const positionUsd = tranches.reduce((a, tr) => a + tr.qty, 0) * price;
  const c = Math.min(params.maxLiquidityCost, priceImpact(positionUsd / params.sellDays, { advUsd, sigmaAnnual: sigma, impactY: params.impactY }));
  let total = 0;
  const detail = [];
  for (const tr of tranches) {
    const tau = (Math.max(0, tr.day - t) + params.latencyDays) / DAYS_PER_YEAR;
    const mAt = (day) => multiplier(alpha, sigma, (Math.max(0, day - t) + params.latencyDays) / DAYS_PER_YEAR, unlockDrift(day, market, params));
    // A tranche that vests over an interval is valued at the interval's average multiplier
    // (Simpson's rule), which is what the continuous integral of the yellow paper gives.
    const mHold = tr.to != null ? (mAt(tr.from) + 4 * mAt(tr.day) + mAt(tr.to)) / 6 : mAt(tr.day);
    let m = mHold;
    if (params.valuationMode === 'blend') {
      // Sell the claim after the latency: a latency-horizon price move, then the buyer's
      // discount for waiting until the tranche unlocks.
      const k = alpha <= params.alphaOrig ? params.marketabilityRateOrig : params.marketabilityRateLiq;
      const wait = Math.max(0, tr.day - t) / DAYS_PER_YEAR;
      const mSell = multiplier(alpha, sigma, params.latencyDays / DAYS_PER_YEAR, unlockDrift(tr.day, market, params)) * Math.exp(-k * wait);
      m = Math.max(mHold, mSell);
    }
    const usd = tr.qty * price;
    const value = usd * m * (1 - c);
    total += value;
    detail.push({ ...tr, tau, m, c, value });
  }
  return { value: total, detail };
}

/**
 * Largest loan at day t0 maturing at day tm, at fixed APR r (§4):
 *   B_max = Ω · min( CV_αo(t0),  min over t in [t0, tm] of CV_αℓ(t) / (1 + r (t − t0)) )
 * with every CV at today's price. The second term guarantees that, if the price never moves,
 * the debt stays at or below the liquidation line on EVERY day of the loan — not only at
 * maturity — so interest alone can never liquidate a loan taken at the maximum.
 *
 * Exact on a coarse grid, not just approximately: at a fixed price CV_αℓ never falls as time
 * passes (theorem T5), while the debt factor only grows, so for every day t in a grid interval
 * [g, g'] we have CV(t)/(1 + r(t − t0)) ≥ CV(g)/(1 + r(g' − t0)). Taking the minimum of that
 * right-hand side over the intervals bounds the daily minimum from below, at a cost of at most
 * r·(g' − g)/365 of the loan (≈ 0.4% for a 15% loan with a 10-day grid step).
 */
export function maxBorrowV2(stream, t0, tm, rate, market, params = V2_DEFAULTS) {
  const orig = creditValue(stream, t0, params.alphaOrig, market, params).value;
  const growth = (t) => 1 + (rate * (t - t0)) / DAYS_PER_YEAR;
  const step = Math.max(1, Math.ceil((tm - t0) / 120)); // ≤ 121 valuations
  let driftCap = creditValue(stream, tm, params.alphaLiq, market, params).value / growth(tm);
  let bindingDay = tm;
  for (let g = t0; g < tm; g += step) {
    const next = Math.min(tm, g + step);
    const cap = creditValue(stream, g, params.alphaLiq, market, params).value / growth(next);
    if (cap < driftCap) { driftCap = cap; bindingDay = g; }
  }
  return { maxBorrow: params.omega * Math.min(orig, driftCap), orig, driftCap, bindingDay };
}

/** Liquidation test at day t (§4). Health uses the time-weighted price passed in `market`. */
export function isLiquidatableV2(debt, stream, t, tm, market, { graceDays = 3 } = {}, params = V2_DEFAULTS) {
  if (t > tm + graceDays) return { liquidatable: true, reason: 'maturity' };
  const cv = creditValue(stream, t, params.alphaLiq, market, params).value;
  return { liquidatable: debt > cv, reason: debt > cv ? 'health' : null, cv };
}

/** The origination safety gap for one tranche: CV_αℓ / CV_αo = exp((z_αℓ − z_αo) σ √τ). */
export function safetyGap(sigma, tauYears, params = V2_DEFAULTS) {
  return Math.exp((normInv(params.alphaLiq) - normInv(params.alphaOrig)) * sigma * Math.sqrt(tauYears));
}
