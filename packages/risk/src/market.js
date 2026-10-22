// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Layer 2 — what each token's own market says. Everything here is estimated from the
 * token's price history (daily closes), volume and unlock schedule, so the parameters
 * move when the token's circumstances move.
 */

export const DAYS_PER_YEAR = 365;

export function logReturns(prices) {
  const out = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1));
}

/** Annualised realised volatility over the last `window` returns (all if omitted). */
export function realisedVol(returns, window) {
  const xs = window ? returns.slice(-window) : returns;
  return stdev(xs) * Math.sqrt(DAYS_PER_YEAR);
}

/** RiskMetrics-style EWMA volatility (annualised). Reacts within days to a regime change. */
export function ewmaVol(returns, lambda = 0.94) {
  if (!returns.length) return 0;
  const seedN = Math.min(30, returns.length);
  let v = returns.slice(0, seedN).reduce((a, r) => a + r * r, 0) / seedN;
  for (let i = seedN; i < returns.length; i++) v = lambda * v + (1 - lambda) * returns[i] * returns[i];
  return Math.sqrt(v * DAYS_PER_YEAR);
}

/** Annualised volatility of negative returns only. */
export function downsideVol(returns) {
  const neg = returns.filter((r) => r < 0);
  if (neg.length < 2) return 0;
  return Math.sqrt((neg.reduce((a, r) => a + r * r, 0) / neg.length) * DAYS_PER_YEAR);
}

export function maxDrawdown(prices) {
  let peak = -Infinity;
  let worst = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    worst = Math.max(worst, 1 - p / peak);
  }
  return worst;
}

/** Empirical q-quantile of overlapping k-day log returns (e.g. q = 0.01, k = 3). */
export function tailReturn(prices, k, q) {
  const r = [];
  for (let i = k; i < prices.length; i++) if (prices[i] > 0 && prices[i - k] > 0) r.push(Math.log(prices[i] / prices[i - k]));
  if (!r.length) return 0;
  r.sort((a, b) => a - b);
  return r[Math.min(r.length - 1, Math.max(0, Math.floor(q * r.length)))];
}

/**
 * Merton jump-diffusion fit by thresholding: returns beyond `k` robust σ are jumps,
 * the rest is diffusion. Simple, stable on short histories, and conservative because
 * the jump component is estimated from the token's own worst days.
 */
export function fitJumpDiffusion(returns, k = 4) {
  if (returns.length < 20) {
    return { sigma: realisedVol(returns), lambda: 0, jumpMean: 0, jumpStd: 0, n: returns.length };
  }
  const sorted = [...returns].map(Math.abs).sort((a, b) => a - b);
  const mad = sorted[Math.floor(sorted.length / 2)];
  const robustSigmaDaily = mad / 0.6745 || stdev(returns);
  const cutoff = k * robustSigmaDaily;
  const diffusion = returns.filter((r) => Math.abs(r) <= cutoff);
  const jumps = returns.filter((r) => Math.abs(r) > cutoff);
  return {
    sigma: stdev(diffusion) * Math.sqrt(DAYS_PER_YEAR),
    lambda: (jumps.length / returns.length) * DAYS_PER_YEAR,
    jumpMean: jumps.length ? mean(jumps) : 0,
    jumpStd: jumps.length > 1 ? stdev(jumps) : jumps.length ? Math.abs(jumps[0]) / 2 : 0,
    n: returns.length
  };
}

/** Total annualised variance of a jump-diffusion, as a single σ. */
export function totalVol({ sigma, lambda, jumpMean, jumpStd }) {
  return Math.sqrt(sigma * sigma + lambda * (jumpMean * jumpMean + jumpStd * jumpStd));
}

/**
 * Price impact of selling `usd` worth, square-root law: impact ≈ Y · σ_daily · √(usd / ADV).
 * Y ≈ 1 is the usual empirical constant; capped at 95%.
 */
export function priceImpact(usd, { advUsd, sigmaAnnual, impactY = 1 }) {
  if (!(advUsd > 0)) return 0.95;
  const sigmaDaily = sigmaAnnual / Math.sqrt(DAYS_PER_YEAR);
  return Math.min(0.95, impactY * sigmaDaily * Math.sqrt(Math.max(0, usd) / advUsd));
}

/** Largest position (USD) whose forced sale moves the price by at most `maxImpact`. */
export function maxPositionForImpact(maxImpact, { advUsd, sigmaAnnual, impactY = 1 }) {
  const sigmaDaily = sigmaAnnual / Math.sqrt(DAYS_PER_YEAR);
  if (!(sigmaDaily > 0)) return Infinity;
  return advUsd * Math.pow(maxImpact / (impactY * sigmaDaily), 2);
}

/**
 * Supply overhang around a date: tokens unlocking within ±windowDays of `atDay`, as a share
 * of circulating supply at that time. `unlocks` = [{ day, amount }], days from today.
 */
export function unlockOverhang(unlocks = [], circulating, atDay, windowDays = 30) {
  if (!(circulating > 0)) return 0;
  const amount = unlocks.filter((u) => Math.abs(u.day - atDay) <= windowDays).reduce((a, u) => a + u.amount, 0);
  return amount / circulating;
}

/** Everything the engine needs about one token, from raw history. */
export function describeMarket({ prices, volumesUsd = [], unlocks = [], circulating = 0 }) {
  const r = logReturns(prices);
  const jd = fitJumpDiffusion(r);
  const adv = volumesUsd.length ? mean(volumesUsd.slice(-30)) : 0;
  return {
    spot: prices[prices.length - 1],
    ath: Math.max(...prices),
    atl: Math.min(...prices),
    vol30d: realisedVol(r, 30),
    vol90d: realisedVol(r, 90),
    volEwma: ewmaVol(r),
    volDownside: downsideVol(r),
    maxDrawdown: maxDrawdown(prices),
    tail3d1pct: tailReturn(prices, 3, 0.01),
    tail14d1pct: tailReturn(prices, 14, 0.01),
    jumpDiffusion: jd,
    volTotal: totalVol(jd),
    advUsd: adv,
    unlocks,
    circulating,
    observations: r.length
  };
}
