// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { DAYS_PER_YEAR } from './market.js';

/*
 * Daily price paths. Two models, so a result never rests on one set of assumptions:
 *   - jump-diffusion (Merton): diffusion σ plus Poisson jumps fitted to the token's worst days;
 *   - block bootstrap: the token's own daily returns, resampled in blocks so volatility
 *     clustering and crash sequences survive.
 * Both are martingales in price (no assumed drift up or down). Unlock supply shocks and
 * stress scenarios are layered on top as deterministic log-price shifts.
 */

const DT = 1 / DAYS_PER_YEAR;

export function pathGenerator(model) {
  if (model.kind === 'jump-diffusion') return jumpDiffusion(model);
  if (model.kind === 'bootstrap') return bootstrap(model);
  throw new Error(`unknown price model: ${model.kind}`);
}

function jumpDiffusion({ sigma, lambda = 0, jumpMean = 0, jumpStd = 0 }) {
  // Compensator keeps E[S_t] = S_0 when jumps are present.
  const kappa = lambda > 0 ? Math.exp(jumpMean + 0.5 * jumpStd * jumpStd) - 1 : 0;
  const drift = (-0.5 * sigma * sigma - lambda * kappa) * DT;
  const diff = sigma * Math.sqrt(DT);
  const lambdaDt = lambda * DT;
  return (rng, out, s0) => {
    let logS = Math.log(s0);
    out[0] = s0;
    for (let i = 1; i < out.length; i++) {
      let x = drift + diff * rng.normal();
      const k = lambdaDt > 0 ? rng.poisson(lambdaDt) : 0;
      for (let j = 0; j < k; j++) x += jumpMean + jumpStd * rng.normal();
      logS += x;
      out[i] = Math.exp(logS);
    }
    return out;
  };
}

function bootstrap({ returns, block = 10 }) {
  if (!returns || returns.length < block * 2) throw new Error('bootstrap needs a longer return history');
  // Demean, then subtract half the variance: a martingale built from the token's own shocks.
  const m = returns.reduce((a, r) => a + r, 0) / returns.length;
  const centred = returns.map((r) => r - m);
  const v = centred.reduce((a, r) => a + r * r, 0) / centred.length;
  const shocks = centred.map((r) => r - 0.5 * v);
  const n = shocks.length;
  return (rng, out, s0) => {
    let logS = Math.log(s0);
    out[0] = s0;
    let i = 1;
    while (i < out.length) {
      const start = rng.int(n - block);
      for (let j = 0; j < block && i < out.length; j++, i++) {
        logS += shocks[start + j];
        out[i] = Math.exp(logS);
      }
    }
    return out;
  };
}

/**
 * Stress scenarios: a cumulative log-price shift by day, laid over the model's noise.
 * Shapes, not replays of particular events. `at` is the first day of the stress;
 * 'unlock' anchors the stress to end on the unlock day instead.
 */
export const STRESS_SCENARIOS = Object.freeze({
  'gap-1d': { label: 'Overnight gap −80%', drop: 0.8, days: 1, at: 7 },
  'crash-3d': { label: 'Crash −70% over 3 days', drop: 0.7, days: 3, at: 7 },
  'collapse-14d': { label: 'Collapse −95% over 14 days', drop: 0.95, days: 14, at: 7 },
  'bear-180d': { label: 'Bear market −75% over 180 days', drop: 0.75, days: 180, at: 7 },
  'grind-365d': { label: 'Grind −40% over a year', drop: 0.4, days: 365, at: 1 },
  'unlock-dump': { label: 'Unlock dump −35% over the 5 days before unlock', drop: 0.35, days: 5, at: 'unlock' }
});

/** Cumulative log shift for `scenario` on each day of a path of `length` days. */
export function scenarioShift(scenario, length, unlockDay) {
  const shift = new Float64Array(length);
  if (!scenario) return shift;
  const total = Math.log(1 - scenario.drop);
  const start = scenario.at === 'unlock' ? Math.max(1, unlockDay - scenario.days) : scenario.at;
  for (let d = 0; d < length; d++) {
    if (d < start) continue;
    const progress = Math.min(1, (d - start + 1) / scenario.days);
    shift[d] = total * progress;
  }
  return shift;
}

/**
 * Unlock supply shock: a log-price drop of `kappa · overhang` spread over the 5 days
 * before `unlockDay`. `kappa` is an explicit assumption (see README), not a fitted value.
 */
export function unlockShift(length, unlockDay, overhang, kappa) {
  const shift = new Float64Array(length);
  const total = -kappa * overhang;
  if (!(total < 0) || unlockDay <= 0) return shift;
  const start = Math.max(1, unlockDay - 5);
  for (let d = start; d < length; d++) shift[d] = total * Math.min(1, (d - start + 1) / 5);
  return shift;
}
