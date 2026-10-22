// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { syntheticHistory } from './profile.js';

/*
 * Synthetic tokens for tests and the audit command. They are generated from stated
 * parameters with fixed seeds — they are not market data and make no claim about any
 * real token. Real histories load through `loadHistoryCsv` in the CLI.
 */

export const FIXTURE_SPECS = Object.freeze({
  BLUE: {
    description: 'Large cap: moderate volatility, rare small jumps, deep liquidity',
    model: { kind: 'jump-diffusion', sigma: 0.55, lambda: 1, jumpMean: -0.08, jumpStd: 0.05 },
    advUsd: 50_000_000,
    circulating: 1_000_000_000,
    unlocks: [{ day: 400, amount: 10_000_000 }],
    rank: 1
  },
  MID: {
    description: 'Mid cap: high volatility, a few sharp drops a year',
    model: { kind: 'jump-diffusion', sigma: 0.85, lambda: 4, jumpMean: -0.15, jumpStd: 0.08 },
    advUsd: 5_000_000,
    circulating: 400_000_000,
    unlocks: [{ day: 365, amount: 32_000_000 }],
    rank: 2
  },
  SMALL: {
    description: 'Small cap: very volatile, thin liquidity, a 25% supply unlock in six months',
    model: { kind: 'jump-diffusion', sigma: 1.2, lambda: 8, jumpMean: -0.22, jumpStd: 0.12 },
    advUsd: 400_000,
    circulating: 120_000_000,
    unlocks: [{ day: 180, amount: 30_000_000 }],
    rank: 3
  },
  GAPPY: {
    description: 'Gap-prone: frequent large overnight drops',
    model: { kind: 'jump-diffusion', sigma: 1.0, lambda: 10, jumpMean: -0.35, jumpStd: 0.2 },
    advUsd: 1_500_000,
    circulating: 900_000_000,
    unlocks: [],
    rank: 2
  }
});

export function fixtureHistory(symbol, days = 730) {
  const spec = FIXTURE_SPECS[symbol];
  if (!spec) throw new Error(`unknown fixture ${symbol}`);
  return syntheticHistory({ symbol, days, model: spec.model, advUsd: spec.advUsd, unlocks: spec.unlocks, circulating: spec.circulating, seed: symbol });
}
