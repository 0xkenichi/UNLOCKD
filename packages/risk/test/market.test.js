// Layer 2: the market statistics recover the parameters that generated a history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syntheticHistory,
  logReturns,
  realisedVol,
  ewmaVol,
  fitJumpDiffusion,
  totalVol,
  maxDrawdown,
  tailReturn,
  priceImpact,
  maxPositionForImpact,
  unlockOverhang,
  describeMarket
} from '../src/index.js';

const within = (x, target, rel) => assert.ok(Math.abs(x - target) <= rel * target, `${x} not within ${rel * 100}% of ${target}`);

test('realised volatility recovers σ from a 3-year GBM history', () => {
  for (const sigma of [0.4, 0.8, 1.5]) {
    const h = syntheticHistory({ symbol: 'T', days: 1095, model: { kind: 'jump-diffusion', sigma }, advUsd: 1e6, seed: `gbm-${sigma}` });
    within(realisedVol(logReturns(h.prices)), sigma, 0.06);
  }
});

test('the jump-diffusion fit preserves total variance and finds the jumps', () => {
  const model = { kind: 'jump-diffusion', sigma: 0.8, lambda: 8, jumpMean: -0.3, jumpStd: 0.1 };
  const h = syntheticHistory({ symbol: 'J', days: 1460, model, advUsd: 1e6, seed: 'jumps' });
  const fit = fitJumpDiffusion(logReturns(h.prices));
  within(totalVol(fit), totalVol(model), 0.12);
  assert.ok(fit.lambda > 3, `found ${fit.lambda} jumps/yr`);
  assert.ok(fit.jumpMean < -0.15);
  // Without jumps, almost nothing is classed as a jump.
  const calm = syntheticHistory({ symbol: 'C', days: 1460, model: { kind: 'jump-diffusion', sigma: 0.8 }, advUsd: 1e6, seed: 'calm' });
  assert.ok(fitJumpDiffusion(logReturns(calm.prices)).lambda < 1);
});

test('EWMA volatility follows a regime change within weeks', () => {
  const calm = syntheticHistory({ symbol: 'A', days: 500, model: { kind: 'jump-diffusion', sigma: 0.4 }, advUsd: 1, seed: 'calm-a' }).prices;
  const wild = syntheticHistory({ symbol: 'B', days: 60, spot: calm[calm.length - 1], model: { kind: 'jump-diffusion', sigma: 1.6 }, advUsd: 1, seed: 'wild-b' }).prices;
  const r = logReturns([...calm, ...wild.slice(1)]);
  assert.ok(realisedVol(r) < 0.8, 'the long-run figure barely moves');
  within(ewmaVol(r), 1.6, 0.3);
});

test('drawdown, tails, impact and overhang', () => {
  assert.equal(maxDrawdown([1, 2, 1, 3, 0.75, 1]), 0.75);
  assert.ok(Math.abs(tailReturn([1, 1, 1, 0.5, 0.5, 0.5], 1, 0) - Math.log(0.5)) < 1e-12);
  const p = { advUsd: 1e6, sigmaAnnual: Math.sqrt(365) * 0.05 }; // 5% daily
  assert.ok(Math.abs(priceImpact(1e6, p) - 0.05) < 1e-12); // selling one day's volume ≈ one daily σ
  assert.ok(Math.abs(maxPositionForImpact(0.1, p) - 4e6) < 1e-3); // and the inverse
  assert.equal(priceImpact(1e12, p), 0.95);
  assert.equal(unlockOverhang([{ day: 100, amount: 5 }, { day: 200, amount: 7 }], 100, 110, 30), 0.05);
});

test('describeMarket on a real-shaped series', () => {
  const h = syntheticHistory({ symbol: 'M', days: 400, model: { kind: 'jump-diffusion', sigma: 0.9 }, advUsd: 2e6, seed: 'm' });
  const m = describeMarket(h);
  assert.equal(m.observations, 400);
  assert.ok(m.ath >= m.spot && m.atl <= m.spot);
  within(m.advUsd, 2e6, 0.25);
  assert.ok(m.tail3d1pct < 0 && m.tail14d1pct < m.tail3d1pct);
});
