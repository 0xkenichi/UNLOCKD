// Layer 3: the simulator is deterministic, exact where the answer is known, and agrees with closed forms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateLoan, liquidationProbability, STRESS_SCENARIOS } from '../src/index.js';

const token = (sigma, extra = {}) => ({ spot: 1, model: { kind: 'jump-diffusion', sigma, ...extra }, advUsd: 1e12, impactVol: sigma });
const loan = (years, more = {}) => ({ notionalUsd: 100_000, years, rank: 2, ...more });

test('same seed, same answer; different seed, different paths', () => {
  const a = simulateLoan({ token: token(0.9), loan: loan(1), paths: 500, seed: 11 });
  const b = simulateLoan({ token: token(0.9), loan: loan(1), paths: 500, seed: 11 });
  const c = simulateLoan({ token: token(0.9), loan: loan(1), paths: 500, seed: 12 });
  assert.deepEqual(a, b);
  assert.notEqual(a.pLiquidation, c.pLiquidation);
});

test('no volatility: never liquidated in a year, and lenders earn exactly the daily-compounded rate net of reserve', () => {
  const r = simulateLoan({ token: token(1e-9), loan: loan(1), paths: 50, seed: 1, assumptions: { borrowRateBps: 1500 } });
  assert.equal(r.pLiquidation, 0);
  assert.equal(r.expectedLoss, 0);
  const gross = Math.pow(1 + 0.15 / 365, 365) - 1;
  assert.ok(Math.abs(r.lenderNetReturn - gross * 0.9) < 1e-9, `${r.lenderNetReturn}`);
});

test('interest alone liquidates a loan on the day the closed form predicts', () => {
  // debt/value starts at 0.35/0.50 of the threshold and grows at (365·ln(1 + a/365) − r) per year
  const a = 0.75;
  const days = (Math.log(0.5 / 0.35) / (365 * Math.log(1 + a / 365) - 0.05)) * 365;
  const r = simulateLoan({ token: token(1e-9), loan: loan(2), paths: 20, seed: 1, assumptions: { borrowRateBps: 7500 } });
  assert.equal(r.pLiquidation, 1);
  assert.ok(Math.abs(r.meanDaysToLiquidation - Math.ceil(days)) <= 1, `${r.meanDaysToLiquidation} vs ${days}`);
  assert.equal(r.expectedLoss, 0); // the stream is still worth ~3× the debt
});

test('liquidation probability matches the first-passage formula', () => {
  for (const sigma of [0.5, 1.1]) {
    for (const years of [0.5, 1]) {
      const r = simulateLoan({ token: token(sigma), loan: loan(years), paths: 12_000, seed: `fp-${sigma}-${years}` });
      const health = r.pLiquidation - r.pLiquidationAtMaturity;
      const closed = liquidationProbability({ debt: r.principal, quantity: 100_000, spot: 1, years, rank: 2, sigma, borrowRateBps: 1500 }).probability;
      assert.ok(Math.abs(health - closed) < 0.02, `σ ${sigma}, T ${years}: simulated ${health} vs closed form ${closed}`);
    }
  }
});

test('lenders lose only when price gaps past the auction', () => {
  const calm = simulateLoan({ token: token(0.6), loan: loan(1), paths: 2000, seed: 3 });
  assert.equal(calm.expectedLoss, 0);
  const gap = simulateLoan({ token: token(0.6), loan: loan(1), paths: 500, seed: 3, scenario: STRESS_SCENARIOS['gap-1d'] });
  assert.ok(gap.pLoss > 0.95 && gap.expectedLoss > 0.2, `${gap.expectedLoss}`);
});

test('more credit means more loss on average — not on every path', () => {
  // Pathwise it can go the other way: a bigger loan is liquidated earlier, sometimes before
  // the gap that hurts a smaller one. Calibration's bisection relies on the average being
  // monotone, and out-of-sample validation guards the answer.
  const t = token(1.0, { lambda: 10, jumpMean: -0.35, jumpStd: 0.2 });
  const at = (omegaBps) => simulateLoan({ token: t, loan: loan(1, { omegaBps }), paths: 6000, seed: 5 });
  const small = at(2500);
  const large = at(10_000);
  assert.ok(large.expectedLoss > small.expectedLoss + 2 * (large.expectedLossStdErr + small.expectedLossStdErr), `${small.expectedLoss} → ${large.expectedLoss}`);
  let prev = at(2500);
  for (const omegaBps of [5000, 7500, 10_000]) {
    const r = at(omegaBps);
    const noise = 2 * (r.expectedLossStdErr + prev.expectedLossStdErr);
    assert.ok(r.expectedLoss >= prev.expectedLoss - noise, `Ω ${omegaBps}: ${r.expectedLoss} < ${prev.expectedLoss} beyond noise`);
    prev = r;
  }
});

test('an unlock overhang and thin liquidity both make outcomes worse', () => {
  const base = simulateLoan({ token: { ...token(0.8), advUsd: 5e6 }, loan: loan(0.5), paths: 3000, seed: 9 });
  const overhang = simulateLoan({ token: { ...token(0.8), advUsd: 5e6, overhangAtUnlock: 0.3 }, loan: loan(0.5), paths: 3000, seed: 9 });
  assert.ok(overhang.pLiquidation > base.pLiquidation);
  const deep = simulateLoan({ token: token(0.8), loan: loan(1, { notionalUsd: 5e7 }), paths: 2000, seed: 2 });
  const thin = simulateLoan({ token: { ...token(0.8), advUsd: 1e5 }, loan: loan(1, { notionalUsd: 5e7 }), paths: 2000, seed: 2 });
  assert.ok(thin.borrowerCostOfLiquidation > deep.borrowerCostOfLiquidation);
});

test('both price models give consistent answers on the same token', async () => {
  const { syntheticHistory, logReturns } = await import('../src/index.js');
  const h = syntheticHistory({ symbol: 'X', days: 1095, model: { kind: 'jump-diffusion', sigma: 0.8 }, advUsd: 1e12, seed: 'models' });
  const jd = simulateLoan({ token: token(0.8), loan: loan(1), paths: 6000, seed: 1 });
  const bs = simulateLoan({ token: { ...token(0.8), model: { kind: 'bootstrap', returns: logReturns(h.prices), block: 10 } }, loan: loan(1), paths: 6000, seed: 1 });
  assert.ok(Math.abs(jd.pLiquidation - bs.pLiquidation) < 0.04, `${jd.pLiquidation} vs ${bs.pLiquidation}`);
});
