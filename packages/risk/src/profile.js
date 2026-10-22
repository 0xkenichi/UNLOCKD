// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { describeMarket, logReturns, unlockOverhang, DAYS_PER_YEAR } from './market.js';
import { pathGenerator } from './paths.js';
import { createRng } from './rng.js';

/*
 * A token profile is everything the simulator needs about one token, built from its own
 * history. Rebuild it whenever new data arrives; the calibration follows.
 */

/**
 * @param {object} history { symbol, prices[], volumesUsd[], unlocks[], circulating }
 * @param {object} [opts]  { onchainBounds: {ath, atl} | 'history' | null, rank }
 */
export function buildProfile(history, opts = {}) {
  const market = describeMarket(history);
  const returns = logReturns(history.prices);
  const models = [{ kind: 'jump-diffusion', ...market.jumpDiffusion }];
  if (returns.length >= 120) models.push({ kind: 'bootstrap', returns, block: 10 });
  const bounds = opts.onchainBounds === 'history' ? { ath: market.ath, atl: market.atl } : opts.onchainBounds || null;
  return {
    symbol: history.symbol,
    spot: market.spot,
    models,
    advUsd: market.advUsd,
    impactVol: Math.max(market.volTotal, market.volEwma),
    bounds,
    unlocks: history.unlocks || [],
    circulating: history.circulating || 0,
    market
  };
}

/** The profile as `simulateLoan` takes it, for one price model and one unlock date. */
export function tokenForLoan(profile, model, years) {
  return {
    spot: profile.spot,
    model,
    advUsd: profile.advUsd,
    impactVol: profile.impactVol,
    bounds: profile.bounds,
    overhangAtUnlock: unlockOverhang(profile.unlocks, profile.circulating, Math.round(years * DAYS_PER_YEAR))
  };
}

/**
 * Deterministic synthetic history from a known model. Used for fixtures and to prove
 * that the market layer recovers the parameters it was given.
 */
export function syntheticHistory({ symbol, days = 730, spot = 1, model, advUsd, unlocks = [], circulating = 0, seed = 1 }) {
  const prices = new Float64Array(days + 1);
  pathGenerator(model)(createRng(seed), prices, spot);
  const rng = createRng(`${seed}-volume`);
  const volumesUsd = Array.from({ length: days + 1 }, () => advUsd * Math.exp(0.35 * rng.normal() - 0.06125));
  return { symbol, prices: Array.from(prices), volumesUsd, unlocks, circulating };
}
