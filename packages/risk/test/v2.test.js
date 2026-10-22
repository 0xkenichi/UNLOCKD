// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  V2_DEFAULTS, normInv, safetyGap, tranchesAt, creditValue, maxBorrowV2, isLiquidatableV2
} from '../src/v2.js';
import { playLoan, backtestToken, STREAM_SHAPES, BACKTEST_DEFAULTS } from '../src/backtest.js';
import { createRng } from '../src/rng.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const deepMarket = (sigma, price = 1) => ({ price, sigma, advUsd: 1e15 }); // impact ≈ 0

test('normal quantiles used by the policy', () => {
  close(normInv(0.005), -2.5758293, 1e-6, 'z_0.005');
  close(normInv(0.05), -1.6448536, 1e-6, 'z_0.05');
  close(normInv(0.5), 0, 1e-9, 'median');
  close(normInv(0.975), 1.959964, 1e-6, 'z_0.975');
});

test('safety gap matches the yellow paper figures', () => {
  close(safetyGap(0.6, 1), 1.748, 0.001, 'σ 60%, 1 year');
  close(safetyGap(0.4, 0.25), 1.205, 0.001, 'σ 40%, 3 months');
  close(safetyGap(1.2, 1), 3.056, 0.001, 'σ 120%, 1 year');
});

test('tranches: every token is delivered exactly once', () => {
  const lin = { type: 'linear', start: 0, end: 365, total: 1000 };
  const sum = (xs) => xs.reduce((a, x) => a + x.qty, 0);
  close(sum(tranchesAt(lin, 0)), 1000, 1e-9, 'linear at start');
  close(sum(tranchesAt(lin, 100)), 1000, 1e-9, 'linear mid-stream');
  close(tranchesAt(lin, 100).find((x) => x.vested).qty, (1000 * 100) / 365, 1e-9, 'vested part is tranche 0');
  const cl = { type: 'cliff-linear', start: 0, cliff: 182, end: 730, total: 1000 };
  const t = tranchesAt(cl, 0);
  close(sum(t), 1000, 1e-9, 'cliff-linear');
  close(t[0].qty, (1000 * 182) / 730, 1e-9, 'cliff lump = vested at the cliff');
  assert.equal(t[0].day, 182);
  const cliff = { type: 'cliff', start: 0, end: 365, total: 1000 };
  assert.deepEqual(tranchesAt(cliff, 10).map((x) => [x.qty, x.day]), [[1000, 365]]);
  assert.equal(tranchesAt(cliff, 400)[0].vested, true);
});

test('zero volatility and deep markets: credit value is the spot value', () => {
  const lin = { type: 'linear', start: 0, end: 365, total: 1000 };
  for (const a of [0.005, 0.05, 0.5]) close(creditValue(lin, 0, a, deepMarket(0, 2)).value, 2000, 1e-6, `α=${a}`);
});

test('weekly tranches agree with daily tranches within 0.1% (yellow paper §2)', () => {
  const lin = { type: 'linear', start: 0, end: 365, total: 1e6 };
  for (const sigma of [0.3, 0.8, 1.5, 2.5]) {
    const weekly = creditValue(lin, 0, 0.005, deepMarket(sigma), V2_DEFAULTS).value;
    const daily = creditValue(lin, 0, 0.005, deepMarket(sigma), { ...V2_DEFAULTS, trancheDays: 1, maxTranches: 10_000 }).value;
    assert.ok(Math.abs(weekly / daily - 1) < 0.001, `σ=${sigma}: ${weekly} vs ${daily}`);
  }
});

test('higher volatility means less credit', () => {
  const lin = { type: 'linear', start: 0, end: 365, total: 1000 };
  let prev = Infinity;
  for (const sigma of [0.2, 0.5, 0.9, 1.4]) {
    const b = maxBorrowV2(lin, 0, 365, 0.15, deepMarket(sigma)).maxBorrow;
    assert.ok(b < prev, `σ=${sigma}`);
    prev = b;
  }
});

test('invariant 1: a maximum loan is not liquidatable at origination, nor at maturity at an unchanged price', () => {
  for (const sigma of [0.3, 0.7, 1.2]) {
    for (const shape of Object.keys(STREAM_SHAPES)) {
      const { stream, tm } = STREAM_SHAPES[shape](0, 1000);
      const m = { price: 1, sigma, advUsd: 5e5 };
      const { maxBorrow } = maxBorrowV2(stream, 0, tm, 0.15, m);
      assert.equal(isLiquidatableV2(maxBorrow, stream, 0, tm, m).liquidatable, false, `${shape} σ=${sigma} at origination`);
      const debtAtMaturity = maxBorrow * (1 + 0.15 * (tm / 365));
      assert.equal(isLiquidatableV2(debtAtMaturity * 0.9999, stream, tm, tm, m).liquidatable, false, `${shape} σ=${sigma} at maturity`);
    }
  }
});

// ── Backtest on constructed histories ───────────────────────────────────────

function history(days, f, volumeUsd = 5e7) {
  const prices = Array.from({ length: days }, (_, i) => f(i));
  return { prices, volumesUsd: prices.map(() => volumeUsd) };
}

function noisyFlat(days, sigmaDaily, seed = 7) {
  const rng = createRng(seed);
  let p = 1;
  const prices = [];
  for (let i = 0; i < days; i++) {
    prices.push(p);
    p *= Math.exp(sigmaDaily * rng.normal() - 0.5 * sigmaDaily * sigmaDaily);
  }
  return { prices, volumesUsd: prices.map(() => 5e7) };
}

test('backtest: a quiet market repays every loan with no lender loss', () => {
  const h = noisyFlat(900, 0.01);
  for (const model of ['v1', 'v2']) {
    const { summary } = backtestToken(h, { shape: 'linear-12m', model });
    assert.ok(summary.n > 10, `${model} loans`);
    assert.equal(summary.lossShare, 0, `${model} losses`);
  }
});

test('backtest: after an overnight 90% gap, v1 auctions at a loss while v2 pays down from vested tokens', () => {
  const quiet = noisyFlat(400, 0.06, 11).prices; // σ ≈ 115% a year
  const crashed = history(900, (i) => (i < 400 ? quiet[i] : quiet[399] * 0.1));
  const t0 = 300;
  const { stream, tm } = STREAM_SHAPES['linear-12m'](t0, 100_000 / crashed.prices[t0]);
  const v1 = playLoan({ ...crashed, t0, stream, tm, model: 'v1' });
  const v2 = playLoan({ ...crashed, t0, stream, tm, model: 'v2' });
  assert.ok(v2.principal < v1.principal, `v2 lends less: ${v2.principal} vs ${v1.principal}`);
  assert.ok(v1.liquidated && v1.lenderLoss > 0, 'v1: auctioned at a loss');
  // v2 sells already-vested tokens within the volume cap instead of auctioning the stream.
  assert.ok(v2.paidDown > 0, 'v2 paid the loan down from vested tokens');
  assert.equal(v2.lenderLoss, 0, 'v2 lenders lose nothing');
});

test('backtest: borrowers who repay keep the upside', () => {
  const up = history(900, (i) => Math.exp(i / 365));
  const { summary } = backtestToken(up, { shape: 'linear-12m', model: 'v2' }, { ...BACKTEST_DEFAULTS });
  assert.equal(summary.liquidatedShare, 0);
  assert.equal(summary.borrowerBeatsOtcShare, 1);
});
