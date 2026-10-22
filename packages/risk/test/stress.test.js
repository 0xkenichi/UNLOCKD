// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coveringArray, waterfall, oraclePath, FACTORS, buildCells, runCell } from '../src/stress.js';
import { scenarioPath, FAMILY_NAMES } from '../src/scenarios.js';
import { createRng } from '../src/rng.js';

test('the covering array contains every 3-way combination of levels', () => {
  const levels = Object.values(FACTORS).map((x) => x.length);
  const rows = coveringArray(levels, 3);
  const k = levels.length;
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) for (let c = b + 1; c < k; c++) {
    const seen = new Set(rows.map((r) => `${r[a]},${r[b]},${r[c]}`));
    assert.equal(seen.size, levels[a] * levels[b] * levels[c], `factors ${a},${b},${c}`);
  }
  assert.ok(rows.length < levels.reduce((x, y) => x * y, 1) / 100, 'far smaller than the full factorial');
});

test('the waterfall pays layers in order and conserves the loss', () => {
  const rng = createRng(3);
  for (let i = 0; i < 10_000; i++) {
    const loss = rng.uniform() * 1.5;
    const layers = { backstop: rng.uniform() * 0.5, insurance: rng.uniform() * 0.1, junior: rng.uniform() * 0.3 };
    const w = waterfall(loss, layers);
    assert.ok(Math.abs(w.backstop + w.insurance + w.junior + w.senior - loss) < 1e-12);
    for (const k of Object.keys(layers)) assert.ok(w[k] <= layers[k] + 1e-15);
    if (w.insurance > 0) assert.ok(Math.abs(w.backstop - layers.backstop) < 1e-12, 'insurance only after the backstop is used up');
    if (w.junior > 0) assert.ok(Math.abs(w.insurance - layers.insurance) < 1e-12, 'junior only after insurance');
    if (w.senior > 0) assert.ok(Math.abs(w.junior - layers.junior) < 1e-12, 'senior only after junior');
  }
});

test('every family produces a full, positive path; shocks land where and as large as asked', () => {
  const hist = [{ prices: Array.from({ length: 400 }, (_, i) => 1 + 0.1 * Math.sin(i / 9)), volumesUsd: Array(400).fill(1e6) }];
  const o = { preDays: 120, days: 420, sigma: 0.8, advUsd: 1e6, shockDay: 100, size: 0.8, volumeCrash: 0.3 };
  for (const f of FAMILY_NAMES) {
    const p = scenarioPath(f, createRng(1), o, hist);
    assert.equal(p.prices.length, 540, f);
    assert.equal(p.volumesUsd.length, 540, f);
    assert.ok(p.prices.every((x) => x > 0 && Number.isFinite(x)), `${f} prices`);
    assert.ok(p.volumesUsd.every((x) => x > 0 && Number.isFinite(x)), `${f} volumes`);
  }
  // Same seed, gap vs no gap: the ratio is exactly 1 − size from the shock day on.
  const calm = scenarioPath('gbm', createRng(5), o);
  const gap = scenarioPath('gap', createRng(5), o);
  assert.ok(Math.abs(gap.prices[219] / calm.prices[219] - 1) < 1e-12);
  assert.ok(Math.abs(gap.prices[220] / calm.prices[220] - 0.2) < 1e-12);
  assert.ok(Math.abs(gap.volumesUsd[300] / calm.volumesUsd[300] - 0.3) < 1e-12);
});

test('oracle variants: stale lags two days, spike only moves origination day', () => {
  const prices = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(oraclePath(prices, 'stale2', 2), [1, 1, 1, 2, 3, 4]);
  assert.deepEqual(oraclePath(prices, 'spike30', 2), [1, 2, 3.9000000000000004, 4, 5, 6]);
  assert.equal(oraclePath(prices, 'clean', 2), prices);
});

test('a stress cell is reproducible: same cell, same losses', () => {
  const cell = buildCells({ paths: 3 }).find((c) => c.design === 'covering' && c.family !== 'bootstrap');
  assert.deepEqual(runCell(cell), runCell(cell));
});

test('unlock schedules align to price-history days', async () => {
  const { alignUnlocks } = await import('../src/backtest.js');
  const sched = [{ date: '2024-01-02', unlocked: 10 }, { date: '2024-01-04', unlocked: 30 }];
  assert.deepEqual(alignUnlocks(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-09'], sched), [10, 10, 10, 30, 30]);
  assert.equal(alignUnlocks(['2024-01-01'], []), null);
});

test('a price-feed freeze repeats the last price before it', async () => {
  const { freeze } = await import('../src/stress.js');
  assert.deepEqual(freeze([1, 2, 3, 4, 5, 6], [[2, 3]]), [1, 2, 2, 2, 5, 6]);
  assert.deepEqual(freeze([1, 2, 3], []), [1, 2, 3]);
});

test('chaos paths stack events and sometimes freeze the oracle', () => {
  const o = { preDays: 120, days: 420, sigma: 0.8, advUsd: 1e6, shockDay: 100, unlockDay: 182, size: 0.8, volumeCrash: 0.3 };
  let frozen = 0;
  for (let i = 0; i < 200; i++) {
    const p = scenarioPath('chaos', createRng(1000 + i), o);
    assert.ok(p.prices.every((x) => x > 0 && Number.isFinite(x)) && p.volumesUsd.every((x) => x > 0));
    if (p.freezes.length) frozen++;
  }
  assert.ok(frozen > 20 && frozen < 180, `freezes in ${frozen} of 200 paths`);
});

test('a rational borrower cures on the alert and avoids the forced sale an adversarial one suffers', async () => {
  const { playLoan, STREAM_SHAPES, BACKTEST_DEFAULTS } = await import('../src/backtest.js');
  // Noisy history (so v2 lends ~26%), then a 55% step down for 40 days that recovers: health
  // breaks, but the stream stays well above 1.25× the debt, so it is worth saving.
  const prices = Array.from({ length: 700 }, (_, d) => (1 + 0.06 * Math.sin(d)) * (d >= 160 && d < 200 ? 0.45 : 1));
  const volumesUsd = prices.map(() => 5e6);
  const t0 = 100;
  const { stream, tm } = STREAM_SHAPES['linear-12m'](t0, 1e5);
  const adv = playLoan({ prices, volumesUsd, t0, stream, tm, model: 'v2' }, { ...BACKTEST_DEFAULTS, borrower: 'adversarial' });
  const rat = playLoan({ prices, volumesUsd, t0, stream, tm, model: 'v2' }, { ...BACKTEST_DEFAULTS, borrower: 'rational' });
  assert.ok(rat.cures >= 1 && rat.curedUsd > 0, 'cured');
  assert.equal(rat.reason, 'repaid');
  assert.equal(rat.lenderLoss, 0);
  assert.equal(adv.reason, 'health', 'the adversarial borrower is force-sold');
});
