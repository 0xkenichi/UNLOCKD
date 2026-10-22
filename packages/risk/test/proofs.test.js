// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * The theorems the papers rely on, each checked on thousands of random combinations of every
 * input (seeded, so failures reproduce). The argument for each is in docs/RISK_PROOFS.md; these
 * tests are what makes the argument hold for the code as written, not just for the formula.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { V2_DEFAULTS, tranchesAt, creditValue, creditValueOf, remainingTranches, maxBorrowV2, isLiquidatableV2 } from '../src/v2.js';
import { playLoan, STREAM_SHAPES } from '../src/backtest.js';
import { createRng } from '../src/rng.js';

// PROOF_SEED=n reruns every theorem on a fresh set of draws.
const rng = createRng(Number(process.env.PROOF_SEED) || 20261022);
const U = (a, b) => a + (b - a) * rng.uniform();
const LU = (a, b) => Math.exp(U(Math.log(a), Math.log(b))); // log-uniform
const pick = (xs) => xs[Math.floor(rng.uniform() * xs.length)];
const EPS = 1e-9;

function randomStream() {
  const total = LU(1, 1e12);
  const type = pick(['cliff', 'linear', 'cliff-linear', 'tranched']);
  const start = 0;
  if (type === 'cliff') return { type, start, end: Math.round(U(7, 1460)), total };
  if (type === 'linear') return { type, start, end: Math.round(U(30, 1460)), total };
  if (type === 'cliff-linear') {
    const cliff = Math.round(U(7, 400));
    return { type, start, cliff, end: cliff + Math.round(U(30, 1095)), total };
  }
  const n = 1 + Math.floor(U(1, 16));
  const step = Math.round(U(15, 120));
  const steps = Array.from({ length: n }, (_, i) => ({ day: step * (i + 1), qty: total / n }));
  return { type, start, end: steps.at(-1).day, steps, total };
}
function randomParams() {
  const a1 = LU(0.0005, 0.3);
  const a2 = Math.min(0.49, a1 * LU(1.01, 20));
  return {
    ...V2_DEFAULTS,
    alphaOrig: a1,
    alphaLiq: a2,
    latencyDays: Math.round(U(1, 20)),
    sellDays: Math.round(U(1, 30)),
    valuationMode: pick(['hold', 'blend']),
    marketabilityRateOrig: U(0.3, 3),
    marketabilityRateLiq: U(0.1, 1.5)
  };
}
const randomMarket = () => ({ price: LU(1e-6, 1e5), sigma: U(0.05, 3), advUsd: LU(1e3, 1e11) });
const cv = (s, t, a, m, p) => creditValue(s, t, a, m, p).value;

test('T1 bounds: 0 ≤ CV ≤ spot value of what remains (10 000 cases)', () => {
  for (let i = 0; i < 10_000; i++) {
    const s = randomStream(), p = randomParams(), m = randomMarket();
    const t = Math.round(U(0, s.end + 30));
    const remaining = tranchesAt(s, t, p).reduce((a, x) => a + x.qty, 0);
    const v = cv(s, t, p.alphaLiq, m, p);
    assert.ok(v >= 0, `negative CV case ${i}`);
    assert.ok(v <= remaining * m.price * (1 + EPS), `CV above spot, case ${i}: ${v} > ${remaining * m.price}`);
  }
});

test('T2 tranches conserve quantity at every day (10 000 cases)', () => {
  for (let i = 0; i < 10_000; i++) {
    const s = randomStream(), p = randomParams();
    const t = Math.round(U(0, s.end + 30));
    const sum = tranchesAt(s, t, p).reduce((a, x) => a + x.qty, 0);
    assert.ok(Math.abs(sum / s.total - 1) < 1e-9, `case ${i}: ${sum} vs ${s.total}`);
    assert.ok(tranchesAt(s, t, p).every((x) => x.qty > 0 && x.day >= t - EPS), `case ${i}: bad tranche`);
  }
});

test('T3 stricter confidence never lends more: α₁ < α₂ ⇒ CV_α₁ ≤ CV_α₂ (5 000 cases)', () => {
  for (let i = 0; i < 5_000; i++) {
    const s = randomStream(), p = randomParams(), m = randomMarket();
    const t = Math.round(U(0, s.end));
    const lo = LU(0.0005, 0.25), hi = Math.min(0.49, lo * LU(1.01, 10));
    // Both levels must use the same marketability rate for the comparison to be like for like.
    const q = { ...p, marketabilityRateOrig: p.marketabilityRateLiq, alphaOrig: 1e-9 };
    assert.ok(cv(s, t, lo, m, q) <= cv(s, t, hi, m, q) * (1 + EPS), `case ${i}`);
  }
});

test('T4 more volatility never lends more (5 000 cases)', () => {
  for (let i = 0; i < 5_000; i++) {
    const s = randomStream(), p = randomParams(), m = randomMarket();
    const t = Math.round(U(0, s.end));
    const s2 = m.sigma * LU(1.01, 3);
    assert.ok(cv(s, t, p.alphaLiq, { ...m, sigma: s2 }, p) <= cv(s, t, p.alphaLiq, m, p) * (1 + EPS), `case ${i}`);
  }
});

test('T5 at an unchanged price, credit value never falls as time passes (5 000 cases)', () => {
  for (let i = 0; i < 5_000; i++) {
    const s = randomStream(), p = randomParams(), m = randomMarket();
    const t = Math.round(U(0, s.end));
    const dt = Math.round(U(1, 60));
    for (const a of [p.alphaOrig, p.alphaLiq]) {
      assert.ok(cv(s, t + dt, a, m, p) >= cv(s, t, a, m, p) * (1 - 1e-9), `case ${i} α=${a}: falls from day ${t} to ${t + dt}`);
    }
  }
});

test('T6 size and price are penalised, never rewarded: CV(λx) ≤ λ·CV(x) for λ > 1 (5 000 cases)', () => {
  for (let i = 0; i < 5_000; i++) {
    const s = randomStream(), p = randomParams(), m = randomMarket();
    const t = Math.round(U(0, s.end));
    const lam = LU(1.01, 100);
    const base = cv(s, t, p.alphaLiq, m, p);
    assert.ok(cv({ ...s, total: s.total * lam, steps: s.steps?.map((x) => ({ ...x, qty: x.qty * lam })) }, t, p.alphaLiq, m, p) <= lam * base * (1 + EPS), `quantity, case ${i}`);
    assert.ok(cv(s, t, p.alphaLiq, { ...m, price: m.price * lam }, p) <= lam * base * (1 + EPS), `price, case ${i}`);
  }
});

test('T7 a loan at the maximum is never liquidatable on ANY day if the price does not move (800 cases)', () => {
  for (let i = 0; i < 800; i++) {
    const s = randomStream(), p = randomParams(), m = randomMarket();
    const t0 = 0;
    const tm = Math.max(1, Math.round(U(1, s.end)));
    const rate = U(0, 1);
    const { maxBorrow } = maxBorrowV2(s, t0, tm, rate, m, p);
    for (let t = t0; t <= tm; t++) {
      const debt = maxBorrow * (1 + (rate * (t - t0)) / 365);
      const r = isLiquidatableV2(debt * (1 - 1e-6), s, t, tm, m, {}, p);
      assert.equal(r.liquidatable, false, `case ${i}: liquidatable on day ${t} of ${tm} (${s.type}, σ ${m.sigma.toFixed(2)}, r ${rate.toFixed(2)}, ${p.valuationMode})`);
    }
  }
});

test('T8 the maximum is never above the stricter credit value, so origination is never at the line (5 000 cases)', () => {
  for (let i = 0; i < 5_000; i++) {
    const s = randomStream(), p = randomParams(), m = randomMarket();
    const tm = Math.max(1, Math.round(U(1, s.end)));
    const r = maxBorrowV2(s, 0, tm, U(0, 1), m, p);
    assert.ok(r.maxBorrow <= r.orig * (1 + EPS), `case ${i}`);
    assert.ok(r.maxBorrow <= cv(s, 0, p.alphaLiq, m, p) * (1 + EPS), `case ${i}: above the liquidation line at origination`);
  }
});

test('T9 paydowns only remove vested tokens and never touch future tranches (5 000 cases)', () => {
  for (let i = 0; i < 5_000; i++) {
    const s = randomStream(), p = randomParams();
    const t = Math.round(U(1, s.end + 30));
    const all = tranchesAt(s, t, p);
    const vested = all.filter((x) => x.vested).reduce((a, x) => a + x.qty, 0);
    const sold = vested * U(0, 1);
    const rem = remainingTranches(s, t, sold, p);
    const future = (xs) => xs.filter((x) => !x.vested).reduce((a, x) => a + x.qty, 0);
    assert.ok(Math.abs(future(rem) - future(all)) <= 1e-9 * s.total, `case ${i}: future tranches changed`);
    const remTotal = rem.reduce((a, x) => a + x.qty, 0);
    assert.ok(Math.abs(remTotal - (s.total - sold)) <= 1e-9 * s.total, `case ${i}: quantity not conserved`);
  }
});

test('T10 settlement conserves value and never both loses and pays a surplus (1 500 random loans on random paths)', () => {
  let liquidated = 0;
  for (let i = 0; i < 1_500; i++) {
    const shape = pick(Object.keys(STREAM_SHAPES));
    const days = 900;
    const sigmaD = U(0.005, 0.12);
    const gapDay = rng.uniform() < 0.3 ? Math.round(U(100, 600)) : -1;
    const gap = U(0.05, 0.95);
    let px = 1;
    const prices = [];
    for (let d = 0; d < days; d++) {
      prices.push(px);
      px *= Math.exp(sigmaD * rng.normal() - 0.5 * sigmaD * sigmaD);
      if (d === gapDay) px *= 1 - gap;
    }
    const volumesUsd = prices.map(() => LU(1e4, 1e9));
    const t0 = Math.round(U(90, 300));
    const { stream, tm } = STREAM_SHAPES[shape](t0, LU(1, 1e9) / prices[t0]);
    for (const model of ['v1', 'v2']) {
      const r = playLoan({ prices, volumesUsd, t0, stream, tm, model });
      if (!r || r.skipped) continue;
      assert.ok(r.lenderLoss >= 0 && r.lenderLoss <= r.principal * (1 + 0.15 * 3) + EPS, `case ${i} ${model}: loss out of range`);
      assert.ok(r.borrowerValue >= 0, `case ${i} ${model}: negative borrower value`);
      assert.ok(!(r.lenderLoss > 0 && r.borrowerValue > 0), `case ${i} ${model}: loss and surplus together`);
      assert.ok(r.paidDown >= 0, `case ${i} ${model}: negative paydown`);
      if (r.liquidated) { liquidated++; assert.ok(['health', 'maturity'].includes(r.reason), `case ${i}: bad reason`); }
    }
  }
  assert.ok(liquidated > 50, 'the random paths must actually exercise liquidation');
});

test('T11 the coarse drift cap is sound (never above the daily minimum) and tight (within r·step/365) (400 cases)', () => {
  for (let i = 0; i < 400; i++) {
    const s = randomStream(), p = randomParams(), m = randomMarket();
    const tm = Math.max(1, Math.round(U(1, s.end)));
    const rate = U(0, 1);
    const coarse = maxBorrowV2(s, 0, tm, rate, m, p);
    let daily = Infinity;
    for (let t = 0; t <= tm; t++) daily = Math.min(daily, creditValue(s, t, p.alphaLiq, m, p).value / (1 + (rate * t) / 365));
    const step = Math.max(1, Math.ceil(tm / 120));
    assert.ok(coarse.driftCap <= daily * (1 + EPS), `case ${i}: grid above the daily minimum (${coarse.driftCap} vs ${daily})`);
    assert.ok(coarse.driftCap >= (daily / (1 + (rate * step) / 365)) * (1 - EPS), `case ${i}: grid looser than the bound`);
  }
});

test('T7u with an unlock calendar, a loan at the maximum is still never liquidatable at an unchanged price (300 cases)', () => {
  for (let i = 0; i < 300; i++) {
    const s = randomStream(), p = randomParams();
    const tm = Math.max(1, Math.round(U(1, Math.min(s.end, 730))));
    const rate = U(0, 1);
    // Random cliffs of up to 80% of circulating supply, on random days around the loan.
    const circulating = LU(1e6, 1e10);
    const unlocks = Array.from({ length: 1 + Math.floor(U(0, 8)) }, () => ({ day: Math.round(U(-30, tm + 60)), amount: circulating * U(0, 0.8) }));
    const m = { ...randomMarket(), circulating, unlocks };
    const { maxBorrow } = maxBorrowV2(s, 0, tm, rate, m, p);
    for (let t = 0; t <= tm; t++) {
      const r = isLiquidatableV2(maxBorrow * (1 + (rate * t) / 365) * (1 - 1e-9), s, t, tm, m, {}, p);
      assert.equal(r.liquidatable, false, `case ${i}: liquidatable on day ${t} of ${tm}`);
    }
  }
});
