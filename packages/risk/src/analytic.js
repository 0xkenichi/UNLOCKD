// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { BPS, protocolDefaults } from './params.js';
import { discountMultiplier } from './onchain.js';

/*
 * Closed forms. They do two jobs:
 *   - proof: the Monte Carlo engine must agree with them where both apply (test/analytic.test.js);
 *   - speed: they are cheap enough to run in the browser, so a borrower can see the price
 *     that would liquidate them and how likely that is, for the exact amount they choose.
 *
 * Model: a driftless (martingale) price with volatility σ; debt grows at the borrow APR a;
 * collateral value grows as the time discount unwinds at the rank rate r. The loan is
 * liquidated when debt > threshold × liquidationValue, i.e. when
 *     S_t < B_0 · e^{(a − r)·t},   B_0 = D_0 / (thr · Q · (1 − σ_c/2) · e^{−r·T}).
 */

/** Standard normal CDF (Zelen & Severo 26.2.17, |error| < 7.5e-8). */
export function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/**
 * P(min over [0, T] of a Brownian motion with drift ν and volatility σ, started at 0, ≤ b), b < 0.
 * The reflection-principle formula for first passage.
 */
export function firstPassageProbability(b, nu, sigma, T) {
  if (b >= 0) return 1;
  if (!(T > 0) || !(sigma > 0)) return nu * T <= b ? 1 : 0;
  const s = sigma * Math.sqrt(T);
  return normCdf((b - nu * T) / s) + Math.exp((2 * nu * b) / (sigma * sigma)) * normCdf((b + nu * T) / s);
}

/** Broadie–Glasserman–Kou: a barrier checked every Δt years behaves like a continuous one moved by β·σ·√Δt. */
export const BGK_BETA = 0.5826;

/**
 * The price at which a loan becomes liquidatable today, and how fast that trigger rises.
 * Bounds (ATH/ATL) are ignored here; with bounds set, use the on-chain mirror directly.
 */
export function liquidationTrigger({ debt, quantity, years, rank, borrowRateBps }, params = protocolDefaults()) {
  const thr = params.loan.liqThresholdBps[rank] / BPS;
  const m = discountMultiplier({ price: 1, years, rank }, params.valuation).multiplier;
  const triggerPrice = debt / (thr * quantity * m);
  const r = params.valuation.rankDiscountRateBps[rank] / BPS;
  const a = borrowRateBps / BPS;
  return { triggerPrice, driftPerYear: a - r };
}

/**
 * Probability that a loan is liquidated on price (or interest) before `horizonYears`,
 * for a token with total volatility σ. Daily monitoring by default, like a keeper.
 */
export function liquidationProbability(
  { debt, quantity, spot, years, horizonYears = years, rank, sigma, borrowRateBps = 1500, checksPerYear = 365 },
  params = protocolDefaults()
) {
  const { triggerPrice, driftPerYear } = liquidationTrigger({ debt, quantity, years, rank, borrowRateBps }, params);
  if (triggerPrice >= spot) return { probability: 1, triggerPrice, dropToTrigger: 0 };
  const shift = checksPerYear ? BGK_BETA * sigma * Math.sqrt(1 / checksPerYear) : 0;
  const b = Math.log(triggerPrice / spot) - shift;
  const nu = -0.5 * sigma * sigma - driftPerYear;
  return {
    probability: firstPassageProbability(b, nu, sigma, horizonYears),
    triggerPrice,
    dropToTrigger: 1 - triggerPrice / spot,
    triggerRisePerYear: Math.exp(driftPerYear) - 1
  };
}

/** Largest debt for which the liquidation probability over the horizon stays at or below `target`. */
export function debtForLiquidationProbability(target, args, params = protocolDefaults()) {
  let lo = 0;
  let hi = args.quantity * args.spot;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (liquidationProbability({ ...args, debt: mid }, params).probability <= target) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Borrower outlook from what a page already reads on chain: the origination value `pv`
 * (computeDPV, which includes Ω and the EWMA) and the chosen debt. Because pv is never above
 * the health-check value, the trigger shown is never later than the real one.
 */
export function outlookFromPv({ pv, debt, liqThresholdBps, discountRateBps, borrowRateBps = 1500, years, sigma, checksPerYear = 365 }) {
  const thr = liqThresholdBps / BPS;
  const ratio = debt / (thr * pv); // trigger price / spot
  const driftPerYear = borrowRateBps / BPS - discountRateBps / BPS;
  const out = { dropToTrigger: Math.max(0, 1 - ratio), triggerRisePerYear: Math.exp(driftPerYear) - 1, probability: null };
  if (sigma > 0 && years > 0) {
    if (ratio >= 1) out.probability = 1;
    else {
      const b = Math.log(ratio) - (checksPerYear ? BGK_BETA * sigma * Math.sqrt(1 / checksPerYear) : 0);
      out.probability = firstPassageProbability(b, -0.5 * sigma * sigma - driftPerYear, sigma, years);
    }
  }
  return out;
}

/**
 * Liquidation threshold and discount rate to assume when only the LTV is known: the rank whose
 * base LTV matches, else the rank with the smallest threshold above it (the most cautious reading).
 */
export function rankTermsForLtv(ltvBps, params = protocolDefaults()) {
  const { rankBaseLtvBps, rankDiscountRateBps } = params.valuation;
  const thr = params.loan.liqThresholdBps;
  let rank = [1, 2, 3].find((r) => rankBaseLtvBps[r] === ltvBps);
  if (!rank) {
    const above = [1, 2, 3].filter((r) => thr[r] > ltvBps).sort((a, b) => thr[a] - thr[b]);
    rank = above[0] ?? 1;
  }
  return { rank, liqThresholdBps: thr[rank], discountRateBps: rankDiscountRateBps[rank], exact: rankBaseLtvBps[rank] === ltvBps };
}
