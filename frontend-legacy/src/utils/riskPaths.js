// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { pathGenerator } from '../../../packages/risk/src/paths.js';
import { createRng } from '../../../packages/risk/src/rng.js';
import { rankTermsForLtv } from '../../../packages/risk/src/analytic.js';

/**
 * Simulated health-factor paths for a loan at the maximum LTV, from the risk engine
 * (packages/risk): a martingale price with volatility `sigma`, debt accruing at
 * `borrowRateBps`, collateral value unwinding the rank's time discount. A path ends
 * flat at the point a loan would be liquidated (health factor < 1).
 *
 * Returned worst-first, so the first 5% are the 5th-percentile paths. Each path is
 * `points` triples [x, y, 0] with y = health factor / 2.2 (1.0 ≈ the 2.2 ceiling shown).
 * The volatility is an assumption of the preview, not a measured value: pages that
 * show these paths must say so.
 */
export function generateRiskPaths({
  pv = 1,
  ltvBps = 3500,
  sigma = 1,
  years = 1,
  borrowRateBps = 1500,
  count = 100,
  points = 20,
  seed = 'risk-preview'
} = {}) {
  const ltv = Math.max(Number(ltvBps) || 0, 1) / 10_000;
  const { liqThresholdBps, discountRateBps } = rankTermsForLtv(Number(ltvBps) || 0);
  const hf0 = liqThresholdBps / 10_000 / ltv;
  const r = discountRateBps / 10_000;
  const a = borrowRateBps / 10_000;
  const days = Math.max(points, Math.round(years * 365));
  const gen = pathGenerator({ kind: 'jump-diffusion', sigma });
  const rng = createRng(`${seed}-${Math.round(Number(pv) || 0)}-${ltvBps}-${sigma}`);
  const prices = new Float64Array(days + 1);

  const out = [];
  for (let p = 0; p < count; p++) {
    gen(rng, prices, 1);
    // Health is checked every day, as a keeper would; the plot samples `points` of those days.
    const hf = new Float64Array(days + 1);
    let liquidated = false;
    let worst = hf0;
    hf[0] = hf0;
    for (let d = 1; d <= days; d++) {
      hf[d] = liquidated ? hf[d - 1] : (hf0 * prices[d] * Math.exp((r * d) / 365)) / Math.pow(1 + a / 365, d);
      if (hf[d] < 1) liquidated = true;
      worst = Math.min(worst, hf[d]);
    }
    const path = [];
    for (let i = 0; i < points; i++) {
      const d = Math.round((i / (points - 1)) * days);
      path.push([i * 0.4 - 3.5, Math.min(hf[d], 2.2) / 2.2, 0]);
    }
    out.push({ worst, path });
  }
  out.sort((x, y) => x.worst - y.worst);
  return out.map((x) => x.path);
}
