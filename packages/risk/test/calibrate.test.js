// Layers 4–5: calibrated parameters meet the policy on unseen paths, respond to each token's
// circumstances in the right direction, and the monitor raises the right alarms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfile,
  calibrateToken,
  calibrationReport,
  fixtureHistory,
  syntheticHistory,
  tokenStressScenarios,
  monitorToken,
  riskParamsCall,
  DEFAULT_POLICY
} from '../src/index.js';

// Fewer paths than production so the suite stays fast; validation still uses a fresh seed.
const FAST = { paths: 1200, stressPaths: 400, validationPaths: 2400, horizonsYears: [0.5, 1] };

const profileFor = (model, more = {}) =>
  buildProfile(syntheticHistory({ symbol: more.symbol || 'T', days: 900, model, advUsd: more.advUsd ?? 5e6, unlocks: more.unlocks || [], circulating: more.circulating || 0, seed: more.seed || 'cal' }));

test('every fixture token gets parameters that pass out-of-sample validation', () => {
  for (const symbol of ['BLUE', 'MID', 'GAPPY']) {
    const c = calibrateToken(buildProfile(fixtureHistory(symbol)), { rank: 2, policy: FAST });
    assert.ok(c.recommendation.newCredit, symbol);
    assert.equal(c.validated, true, `${symbol}: ${JSON.stringify(c.validation)}`);
    assert.match(calibrationReport(c), /## Recommendation/);
  }
});

test('a gappier token never gets more credit than a calmer one', () => {
  const calm = calibrateToken(profileFor({ kind: 'jump-diffusion', sigma: 0.9 }), { rank: 2, policy: FAST });
  const gappy = calibrateToken(profileFor({ kind: 'jump-diffusion', sigma: 0.9, lambda: 12, jumpMean: -0.4, jumpStd: 0.2 }), { rank: 2, policy: FAST });
  assert.ok(gappy.recommendation.omegaBps <= calm.recommendation.omegaBps, `${gappy.recommendation.omegaBps} > ${calm.recommendation.omegaBps}`);
  assert.ok(gappy.recommendation.omegaBps < 10_000);
});

test('a stricter policy never yields more credit', () => {
  const p = profileFor({ kind: 'jump-diffusion', sigma: 1.0, lambda: 10, jumpMean: -0.35, jumpStd: 0.2 }, { seed: 'strict' });
  const loose = calibrateToken(p, { rank: 2, policy: FAST });
  const strict = calibrateToken(p, { rank: 2, policy: { ...FAST, maxCvar99: 0.02, maxExpectedLossPerYear: 0.001 } });
  assert.ok(strict.recommendation.omegaBps <= loose.recommendation.omegaBps);
});

test('a token too wild for any useful credit is refused', () => {
  const p = profileFor({ kind: 'jump-diffusion', sigma: 2.5, lambda: 40, jumpMean: -0.6, jumpStd: 0.3 }, { seed: 'wild' });
  const c = calibrateToken(p, { rank: 1, policy: { ...FAST, minOmegaBps: 3000 } });
  assert.equal(c.recommendation.newCredit, false);
  assert.equal(c.recommendation.omegaBps, 0);
});

test('the per-loan cap follows liquidity', () => {
  const deep = calibrateToken(profileFor({ kind: 'jump-diffusion', sigma: 0.8 }, { advUsd: 5e7, seed: 'liq' }), { rank: 2, policy: FAST });
  const thin = calibrateToken(profileFor({ kind: 'jump-diffusion', sigma: 0.8 }, { advUsd: 5e5, seed: 'liq' }), { rank: 2, policy: FAST });
  assert.ok(thin.recommendation.maxBorrowUsd < deep.recommendation.maxBorrowUsd / 50);
});

test('stresses scale with the token’s own tails, never below the floors', () => {
  const calm = tokenStressScenarios({ tail3d1pct: -0.05, tail14d1pct: -0.1 });
  assert.equal(calm['crash-3d'].drop, DEFAULT_POLICY.stressSeverity.crash3dFloor);
  assert.equal(calm['collapse-14d'].drop, DEFAULT_POLICY.stressSeverity.collapse14dFloor);
  const wild = tokenStressScenarios({ tail3d1pct: -0.5, tail14d1pct: -1.6 });
  assert.ok(Math.abs(wild['crash-3d'].drop - (1 - Math.exp(-1))) < 1e-12);
  assert.equal(wild['collapse-14d'].drop, DEFAULT_POLICY.stressSeverity.cap);
});

test('borrower guidance: the safe share of max falls as the horizon lengthens', () => {
  const c = calibrateToken(profileFor({ kind: 'jump-diffusion', sigma: 0.9 }), { rank: 2, policy: { ...FAST, horizonsYears: [0.25, 1, 2] } });
  const shares = c.borrower.map((b) => b.safeFractionOfMax['0.1']);
  assert.ok(shares[0] >= shares[1] && shares[1] >= shares[2], JSON.stringify(shares));
  assert.ok(c.borrower[1].pLiquidationAtMax > 0.4, 'at max, liquidation within a year is likely');
});

test('the monitor: calm → ok; volatility spike → act with a lower Ω; unlock overhang → recalibrate', () => {
  const h = syntheticHistory({ symbol: 'M', days: 600, model: { kind: 'jump-diffusion', sigma: 0.7 }, advUsd: 3e6, seed: 'mon' });
  const p = buildProfile(h);
  const snapshot = { spot: p.spot, impactVol: p.impactVol, advUsd: p.advUsd, omegaBps: 9000 };
  assert.equal(monitorToken(snapshot, h).status, 'ok');

  const wild = syntheticHistory({ symbol: 'M', days: 45, spot: p.spot, model: { kind: 'jump-diffusion', sigma: 2.4 }, advUsd: 3e6, seed: 'mon-wild' });
  const spiked = { ...h, prices: [...h.prices, ...wild.prices.slice(1)], volumesUsd: [...h.volumesUsd, ...wild.volumesUsd.slice(1)] };
  const m = monitorToken(snapshot, spiked);
  assert.equal(m.status, 'act');
  const spike = m.alerts.find((x) => x.code === 'vol-spike');
  assert.ok(spike.suggestedOmegaBps < 9000);

  const unlocking = { ...h, unlocks: [{ day: 30, amount: 80 }], circulating: 1000 };
  assert.ok(monitorToken(snapshot, unlocking).alerts.some((x) => x.code === 'unlock-overhang'));
});

test('telemetry call for ValuationEngine.updateRiskParams has the contract’s nine arguments as integers', () => {
  const p = buildProfile(fixtureHistory('MID'));
  const call = riskParamsCall('0x0000000000000000000000000000000000000001', p.market);
  assert.equal(call.args.length, 9);
  for (const a of call.args.slice(1)) assert.match(String(a), /^\d+$/);
});
