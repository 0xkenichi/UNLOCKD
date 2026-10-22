// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * The stress grid. A cell fixes every factor of the world (price-path family, stream shape,
 * shock size, calm σ, how much of the maximum is borrowed, liquidity, auction buyers'
 * required return, oracle behaviour, rate); each path in a cell is played under every
 * lending setting, so settings are compared on identical paths.
 *
 * Cells come from three designs:
 *   factorial   every combination of family × shape × severity, other factors at baseline
 *   covering    a 3-wise covering array over all nine factors: every combination of levels
 *               of any three factors appears in at least one cell
 *   timing      a single overnight gap of every size on every week of the loan's life
 */

import { createRng, hashString } from './rng.js';
import { scenarioPath, FAMILY_NAMES } from './scenarios.js';
import { playLoan, STREAM_SHAPES, BACKTEST_DEFAULTS } from './backtest.js';
import { V2_DEFAULTS } from './v2.js';

export const FACTORS = Object.freeze({
  family: FAMILY_NAMES,
  shape: Object.keys(STREAM_SHAPES),
  severity: [0.5, 0.8, 0.95], //       size of the shock in families that have one
  sigma: [0.5, 1.0, 1.5], //           calm annual σ the model sees before origination
  borrowShare: [1, 0.5], //            share of the maximum the borrower takes
  advRatio: [0.01, 0.2, 2], //         position size in days of median volume
  buyerReturn: [0.3, 0.6, 1.0], //     auction buyers' required return per year
  oracle: ['clean', 'stale2', 'spike30'],
  rate: [0.1, 0.15, 0.25],
  borrower: ['adversarial', 'rational'] // never cures vs cures on the alert when the stream is worth saving
});
export const BASELINE = Object.freeze({ severity: 0.8, sigma: 1.0, borrowShare: 1, advRatio: 0.2, buyerReturn: 0.6, oracle: 'clean', rate: 0.15, borrower: 'adversarial' });

/** Every setting the grid knows; bin/stress.js --settings picks which to run. */
export const CATALOG = Object.freeze([
  { key: 'v1', label: 'v1 (testnet)', model: 'v1' },
  { key: 'paper', label: 'v2 hold α 0.5%/5%', model: 'v2', v2: { valuationMode: 'hold', alphaOrig: 0.005, alphaLiq: 0.05 } },
  { key: 'hold2', label: 'v2 hold α 2%/10%', model: 'v2', v2: { valuationMode: 'hold', alphaOrig: 0.02, alphaLiq: 0.10 } },
  { key: 'hold5', label: 'v2 hold α 5%/20%', model: 'v2', v2: { valuationMode: 'hold', alphaOrig: 0.05, alphaLiq: 0.20 } },
  { key: 'blend200', label: 'v2 blend k 200%/100%', model: 'v2', v2: { valuationMode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, marketabilityRateOrig: 2.0, marketabilityRateLiq: 1.0 } },
  { key: 'hold3', label: 'v2 hold α 3%/15%', model: 'v2', v2: { valuationMode: 'hold', alphaOrig: 0.03, alphaLiq: 0.15 } },
  { key: 'blendA', label: 'v2 blend α 2%/10%, k 300%/150%', model: 'v2', v2: { valuationMode: 'blend', alphaOrig: 0.02, alphaLiq: 0.10, marketabilityRateOrig: 3.0, marketabilityRateLiq: 1.5 } },
  { key: 'blendB', label: 'v2 blend α 2%/10%, k 400%/200%', model: 'v2', v2: { valuationMode: 'blend', alphaOrig: 0.02, alphaLiq: 0.10, marketabilityRateOrig: 4.0, marketabilityRateLiq: 2.0 } },
  { key: 'blendC', label: 'v2 blend α 0.5%/5%, k 250%/125%', model: 'v2', v2: { valuationMode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, marketabilityRateOrig: 2.5, marketabilityRateLiq: 1.25 } },
  { key: 'blend100', label: 'v2 blend k 100%/50%', model: 'v2', v2: { valuationMode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, marketabilityRateOrig: 1.0, marketabilityRateLiq: 0.5 } },
  { key: 'blend150', label: 'v2 blend k 150%/75%', model: 'v2', v2: { valuationMode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, marketabilityRateOrig: 1.5, marketabilityRateLiq: 0.75 } }
]);

const PRE_DAYS = 120;
const NOTIONAL = 100_000;

/** Greedy t-wise covering array (AETG-style): every t-combination of levels appears at least once. */
export function coveringArray(levels, t = 3, seed = 7) {
  const k = levels.length;
  const rng = createRng(seed);
  const combos = [];
  const rec = (start, acc) => {
    if (acc.length === t) { combos.push(acc.slice()); return; }
    for (let i = start; i < k; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  const key = (c, vals) => c.map((f, j) => `${f}:${vals[j]}`).join('|');
  const uncovered = new Set();
  for (const c of combos) {
    const sizes = c.map((f) => levels[f]);
    const total = sizes.reduce((a, b) => a * b, 1);
    for (let n = 0; n < total; n++) {
      let r = n;
      const vals = sizes.map((s) => { const v = r % s; r = Math.floor(r / s); return v; });
      uncovered.add(key(c, vals));
    }
  }
  const covers = (row) => combos.reduce((a, c) => a + (uncovered.has(key(c, c.map((f) => row[f]))) ? 1 : 0), 0);
  const rows = [];
  while (uncovered.size) {
    // Seed each candidate with one uncovered tuple, fill the rest greedily, keep the best of 20.
    const first = uncovered.values().next().value.split('|').map((p) => p.split(':').map(Number));
    let best = null, bestScore = -1;
    for (let cand = 0; cand < 20; cand++) {
      const row = new Array(k).fill(-1);
      for (const [f, v] of first) row[f] = v;
      const order = [...Array(k).keys()].filter((f) => row[f] < 0).sort(() => rng.uniform() - 0.5);
      for (const f of order) {
        let bv = 0, bs = -1;
        for (let v = 0; v < levels[f]; v++) {
          row[f] = v;
          const s = combos.reduce((a, c) => a + (c.includes(f) && c.every((g) => row[g] >= 0) && uncovered.has(key(c, c.map((g) => row[g]))) ? 1 : 0), 0);
          if (s > bs) { bs = s; bv = v; }
        }
        row[f] = bv;
      }
      const sc = covers(row);
      if (sc > bestScore) { bestScore = sc; best = row; }
    }
    for (const c of combos) uncovered.delete(key(c, c.map((f) => best[f])));
    rows.push(best);
  }
  return rows;
}

/** All cells of the three designs. */
export function buildCells({ paths = 64, timingPaths = 4 } = {}) {
  const names = Object.keys(FACTORS);
  const cells = [];
  for (const family of FACTORS.family) for (const shape of FACTORS.shape) for (const severity of FACTORS.severity) {
    cells.push({ design: 'factorial', ...BASELINE, family, shape, severity, paths });
  }
  for (const row of coveringArray(names.map((n) => FACTORS[n].length), 3)) {
    const c = { design: 'covering', paths };
    names.forEach((n, i) => { c[n] = FACTORS[n][row[i]]; });
    cells.push(c);
  }
  const days = [...new Set([...Array.from({ length: 53 }, (_, i) => 1 + 7 * i), 182, 183, 364, 365])].sort((a, b) => a - b);
  for (const shape of FACTORS.shape) for (const severity of [0.3, 0.5, 0.8, 0.95]) for (const shockDay of days) {
    cells.push({ design: 'timing', ...BASELINE, sigma: 0.6, family: 'gap', shape, severity, shockDay, paths: timingPaths });
  }
  return cells.map((c, id) => ({ id, ...c }));
}

export const DEFAULT_SETTINGS = Object.freeze(['v1', 'paper', 'hold2', 'hold5', 'blend200', 'blend100', 'blend150']);
export const SETTINGS = Object.freeze(DEFAULT_SETTINGS.map((k) => CATALOG.find((s) => s.key === k)));
export const settingsFor = (keys) => keys.map((k) => CATALOG.find((s) => s.key === k) ?? (() => { throw new Error(`unknown setting ${k}`); })());

/** Play every path of one cell under every setting. Returns compact per-loan rows. */
export function runCell(cell, histories = [], settings = SETTINGS) {
  const out = [];
  const cfg = { ...BACKTEST_DEFAULTS, rate: cell.rate, buyerReturn: cell.buyerReturn, borrowShare: cell.borrowShare, borrower: cell.borrower ?? 'adversarial' };
  const days = 365 + cfg.graceDays + cfg.auctionDays + V2_DEFAULTS.sellDays + 30;
  const t0 = PRE_DAYS;
  for (let p = 0; p < cell.paths; p++) {
    const rng = createRng(hashString(`${cell.design}|${cell.id}|${p}${process.env.STRESS_SEED ? `|${process.env.STRESS_SEED}` : ''}`));
    const shockDay = cell.shockDay ?? 1 + rng.int(365);
    const advUsd = NOTIONAL / cell.advRatio;
    const { stream: shape0 } = STREAM_SHAPES[cell.shape](0, 1);
    const unlockDay = shape0.cliff ?? (shape0.type === 'cliff' ? shape0.end : null);
    const path = scenarioPath(cell.family, rng, { preDays: PRE_DAYS, days, sigma: cell.sigma, advUsd, shockDay, unlockDay, size: cell.severity, volumeCrash: 0.3 }, histories);
    const oracle = freeze(oraclePath(path.prices, cell.oracle, t0), path.freezes);
    const { stream, tm } = STREAM_SHAPES[cell.shape](t0, NOTIONAL / path.prices[t0]);
    for (const s of settings) {
      const r = playLoan({ prices: path.prices, volumesUsd: path.volumesUsd, oracle, t0, stream, tm, model: s.model }, cfg, { ...V2_DEFAULTS, ...(s.v2 || {}) });
      if (!r || r.skipped) continue;
      checkInvariants(r, cfg, cell, s, p);
      out.push({ cell: cell.id, setting: s.key, path: p, ltv: r.ltv, liquidated: r.liquidated ? 1 : 0, forced: r.reason === 'health' ? 1 : 0, cured: r.cures ? 1 : 0, loss: r.lenderLossPct, paid: r.paidDown > 0 ? 1 : 0, beatsOtc: r.borrowerAdvantage >= 0 ? 1 : 0 });
    }
  }
  return out;
}

/** What the protocol's oracle reports: the truth, two days stale, or a 30% spike on origination day. */
export function oraclePath(prices, kind, t0) {
  if (kind === 'clean') return prices;
  if (kind === 'stale2') return prices.map((_, d) => prices[Math.max(0, d - 2)]);
  if (kind === 'spike30') return prices.map((x, d) => (d === t0 ? x * 1.3 : x));
  throw new Error(`unknown oracle ${kind}`);
}

/** A price-feed outage: over each [from, to] the oracle keeps repeating the last price before it. */
export function freeze(oracle, freezes) {
  if (!freezes?.length) return oracle;
  const out = oracle.slice();
  for (const [from, to] of freezes) for (let d = Math.max(1, from); d <= Math.min(to, out.length - 1); d++) out[d] = out[from - 1];
  return out;
}

/** Every loan, in every cell, must satisfy these; a breach aborts the run. */
function checkInvariants(r, cfg, cell, s, p) {
  const where = `cell ${cell.id} (${cell.design} ${cell.family} ${cell.shape}) ${s.key} path ${p}`;
  const maxDebt = 1 + cfg.rate * (365 + cfg.graceDays) / 365;
  if (!(r.lenderLoss >= 0) || r.lenderLossPct > maxDebt + 1e-9) throw new Error(`loss out of range at ${where}`);
  if (!(r.borrowerValue >= 0)) throw new Error(`negative borrower value at ${where}`);
  if (r.lenderLoss > 0 && r.borrowerValue > 0) throw new Error(`loss and surplus together at ${where}`);
  if (!(r.ltv > 0) || !Number.isFinite(r.ltv)) throw new Error(`bad LTV at ${where}`);
}

/**
 * Who absorbs a loss, in order: the project's backstop (first loss), the insurance fund, the
 * junior tranche, then senior lenders. All amounts are shares of principal.
 */
export function waterfall(loss, { backstop = 0, insurance = 0, junior = 0 } = {}) {
  let left = Math.max(0, loss);
  const take = (cap) => { const x = Math.min(left, Math.max(0, cap)); left -= x; return x; };
  return { backstop: take(backstop), insurance: take(insurance), junior: take(junior), senior: left };
}

export function lossStats(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const losses = rows.map((r) => r.loss).sort((a, b) => a - b);
  const q = (p) => losses[Math.min(n - 1, Math.floor(p * n))];
  const mean = (f) => rows.reduce((a, r) => a + f(r), 0) / n;
  return {
    n,
    ltv: mean((r) => r.ltv),
    liquidated: mean((r) => r.liquidated),
    forced: mean((r) => r.forced || 0),
    lossShare: mean((r) => (r.loss > 0 ? 1 : 0)),
    lossMean: mean((r) => r.loss),
    p95: q(0.95),
    p99: q(0.99),
    p999: q(0.999),
    max: losses[n - 1],
    beatsOtc: mean((r) => r.beatsOtc)
  };
}
