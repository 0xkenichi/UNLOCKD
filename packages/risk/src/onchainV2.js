// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * The v2 credit value exactly as the contracts compute it (packages/contracts/src/v2/CreditMath.sol),
 * in floating point. It is the bridge between the proven model (src/v2.js) and the Solidity:
 * test/onchainV2.test.js checks it against v2.js, and the contract tests check the Solidity
 * against it.
 *
 * What differs from v2.js, and why:
 *   - Linear vesting is integrated with two 8-point Gauss–Legendre panels instead of up to 156
 *     weekly Simpson tranches: ~32 exponentials on-chain instead of ~470. The error is almost all
 *     on the conservative side (−0.4% to +0.04% hold; up to +0.12% at blend mode's kink), and the
 *     0.25% origination buffer covers the upside, so the contract never lends more than v2.js.
 *   - Schedules are Sablier Lockup Linear (start, cliff, end): a cliff lump, then linear.
 *   - The drift cap uses 4 intervals instead of 120. By the interval bound (docs/RISK_PROOFS.md,
 *     T7) this is still sound; it costs at most r·T/4 of the loan.
 *   - Unlock drift is one posted factor for the whole position (`drag`), not a calendar, so
 *     credit value stays monotone in time and the 4-interval bound stays valid.
 */

const YEAR = 365 * 86400;

// 8-point Gauss–Legendre on [−1, 1].
export const GL_X = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
export const GL_W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

/** Tier curves as stored on-chain. z = Φ⁻¹(α). */
export const ONCHAIN_TIERS = Object.freeze({
  standard: { blend: false, zOrig: -2.053748910631823, zLiq: -1.2815515655446004, kOrig: 0, kLiq: 0 },
  optIn: { blend: true, zOrig: -2.5758293035489004, zLiq: -1.6448536269514729, kOrig: 1.5, kLiq: 0.75 }
});

export const ONCHAIN_PARAMS = Object.freeze({ latency: 5 * 86400, sellDays: 10, eta: 1, cMax: 0.5, intervals: 4, bufferBps: 25, panels: 2 });

/** Tokens vested by time s on a Lockup Linear schedule. */
export function vestedAt(s, { start, cliff, end, total }) {
  if (s < cliff) return 0;
  if (s >= end) return total;
  return (total * (s - start)) / (end - start);
}

/** Multiplier for a delivery `w` seconds away (τ = w + L). */
function mult(wSec, sigma, z, k, blend, L) {
  const tau = (wSec + L) / YEAR;
  const hold = Math.exp(-0.5 * sigma * sigma * tau + z * sigma * Math.sqrt(tau));
  if (!blend) return hold;
  const lY = L / YEAR;
  const sell = Math.exp(-0.5 * sigma * sigma * lY + z * sigma * Math.sqrt(lY) - k * (wSec / YEAR));
  return Math.max(hold, sell);
}

/**
 * Credit value in USD at time t (seconds).
 *   sched  { start, cliff, end, total, consumed }   consumed = withdrawn before escrow + sold in paydowns
 *   market { price, sigma, adv, drag }              USD/token, annual σ, USD daily volume, factor in (0, 1]
 *   curve  { blend, z, k }
 */
export function creditValueOnchain(sched, t, market, curve, params = ONCHAIN_PARAMS) {
  const { start, cliff, end, total, consumed } = sched;
  const { price, sigma, adv, drag = 1 } = market;
  const L = params.latency;
  const m = (w) => mult(w, sigma, curve.z, curve.k, curve.blend, L);
  // Consumed tokens are the earliest-vesting ones: taken first from what has vested, then from
  // the cliff lump, then from the start of the linear remainder (found by the security review:
  // an earlier version valued the whole total for streams recorded as one cliff at the end).
  const vNow = vestedAt(t, sched);
  let left = consumed;
  let w = 0;
  if (vNow > left) { w += (vNow - left) * m(0); left = 0; } else left -= vNow;
  if (t < cliff) {
    const lump = vestedAt(cliff, sched);
    if (lump > left) { w += (lump - left) * m(cliff - t); left = 0; } else left -= lump;
  }
  let a = Math.max(t, cliff);
  if (a < end) {
    const remaining = (total * (end - a)) / (end - start);
    if (remaining > left) {
      if (left > 0) a += (left * (end - start)) / total;
      if (a < end) {
        // `panels` equal panels of 8 nodes each; the average multiplier over [a, end].
        const P = params.panels;
        const width = (end - a) / P;
        let avg = 0;
        for (let j = 0; j < P; j++) {
          const lo = a + width * j;
          for (let i = 0; i < 8; i++) avg += (GL_W[i] / 2 / P) * m(lo + (width / 2) * (GL_X[i] + 1) - t);
        }
        w += (remaining - left) * avg;
      }
    }
  }
  const q = Math.max(0, total - consumed);
  const positionUsd = q * price;
  const c = adv > 0 ? Math.min(params.cMax, params.eta * (sigma / Math.sqrt(365)) * Math.sqrt(positionUsd / (adv * params.sellDays))) : params.cMax;
  return w * price * (1 - c) * drag;
}

/** Largest loan at t0 maturing at tm, simple rate r, as LoanManagerV2.maxBorrow computes it. */
export function maxBorrowOnchain(sched, t0, tm, rate, market, tier, omega = 1, params = ONCHAIN_PARAMS) {
  const orig = creditValueOnchain(sched, t0, market, { blend: tier.blend, z: tier.zOrig, k: tier.kOrig }, params);
  const liq = (t) => creditValueOnchain(sched, t, market, { blend: tier.blend, z: tier.zLiq, k: tier.kLiq }, params);
  const growth = (t) => 1 + (rate * (t - t0)) / YEAR;
  let cap = liq(tm) / growth(tm);
  const K = params.intervals;
  for (let j = 0; j < K; j++) {
    const g = t0 + Math.floor(((tm - t0) * j) / K);
    const g2 = t0 + Math.floor(((tm - t0) * (j + 1)) / K);
    cap = Math.min(cap, liq(g) / growth(g2));
  }
  return omega * Math.min(orig, cap) * (1 - params.bufferBps / 10_000);
}
