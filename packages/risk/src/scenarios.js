// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Price-path families for the stress grid. Every generator returns { prices, volumesUsd } on a
 * daily axis: `preDays` of calm history (what the model sees when it prices the loan), then
 * the scenario. The model is never told which family it is in — the history before origination
 * looks the same for a token that is about to drift and one that is about to collapse.
 *
 * Liquidity follows the price: in every crash family volume dries up by `volumeCrash`, which
 * is what makes selling into a fall expensive.
 */

const DAYS = 365;

function base(rng, { preDays, days, sigma, advUsd }) {
  const n = preDays + days;
  const prices = new Array(n);
  const volumesUsd = new Array(n);
  let px = 1;
  const sd = sigma / Math.sqrt(DAYS);
  for (let d = 0; d < n; d++) {
    prices[d] = px;
    volumesUsd[d] = advUsd * Math.exp(0.35 * rng.normal() - 0.06);
    if (d < n - 1) px *= Math.exp(sd * rng.normal() - 0.5 * sd * sd);
  }
  return { prices, volumesUsd };
}

/** Multiply prices from `from` onward by f(d - from), and volumes by v(d - from). */
function overlay(path, from, f, v = () => 1) {
  for (let d = from; d < path.prices.length; d++) {
    path.prices[d] *= f(d - from);
    path.volumesUsd[d] *= v(d - from);
  }
  return path;
}

/**
 * The families. `o` holds the shared knobs:
 *   preDays, days, sigma (annual, calm), advUsd (median daily volume in USD), t0 = preDays,
 *   shockDay (days after origination), size (fractional drop), volumeCrash (volume multiplier after a shock)
 */
export const FAMILIES = Object.freeze({
  /** Geometric Brownian motion at the calm σ: nothing happens. */
  gbm: (rng, o) => base(rng, o),

  /** GBM at a higher σ after origination: the token gets much more volatile than its history says. */
  volBurst: (rng, o) => {
    const p = base(rng, o);
    // Independent extra noise so the total σ is 2.5× the calm one: √(2.5² − 1) ≈ 2.29.
    const sd = (o.sigma * Math.sqrt(5.25)) / Math.sqrt(DAYS);
    let extra = 1;
    return overlay(p, o.preDays + 1, () => (extra *= Math.exp(sd * rng.normal() - 0.5 * sd * sd)));
  },

  /** Merton jumps: Poisson(6/yr) drops of ~25% with 15% dispersion on top of GBM. */
  jumps: (rng, o) => {
    const p = base(rng, o);
    let level = 1;
    return overlay(p, o.preDays + 1, () => {
      if (rng.uniform() < 6 / DAYS) level *= Math.exp(Math.log(0.75) + 0.15 * rng.normal());
      return level;
    }, () => level < 0.5 ? 0.5 : 1);
  },

  /** One overnight gap of `size` on `shockDay` after origination (unlock day, cliff day, any day). */
  gap: (rng, o) => overlay(base(rng, o), o.preDays + o.shockDay, () => 1 - o.size, () => o.volumeCrash),

  /** A slow bleed: the price loses `size` evenly over the loan year, volume fading with it. */
  bleed: (rng, o) => overlay(base(rng, o), o.preDays + 1, (k) => Math.max(1 - o.size, 1 - (o.size * k) / DAYS), (k) => 1 - (1 - o.volumeCrash) * Math.min(1, k / DAYS)),

  /** V: falls `size` over 20 days from `shockDay`, recovers over the next 60. */
  vShape: (rng, o) => overlay(base(rng, o), o.preDays + o.shockDay, (k) => {
    if (k <= 20) return 1 - (o.size * k) / 20;
    if (k <= 80) return 1 - o.size + (o.size * (k - 20)) / 60;
    return 1;
  }, (k) => (k <= 80 ? o.volumeCrash : 1)),

  /** Pump then dump: +150% over 30 days from origination, then −(size) of the peak overnight on shockDay. */
  pumpDump: (rng, o) => overlay(base(rng, o), o.preDays + 1, (k) => {
    const pump = 1 + 1.5 * Math.min(1, k / 30);
    return k >= Math.max(31, o.shockDay) ? 2.5 * (1 - o.size) : pump;
  }, (k) => (k >= Math.max(31, o.shockDay) ? o.volumeCrash : 1 + Math.min(1, k / 30))),

  /** Regime switch on shockDay: σ triples and the drift turns to −100%/yr until the end. */
  regime: (rng, o) => {
    const p = base(rng, o);
    const sd = (o.sigma * 2) / Math.sqrt(DAYS);
    let level = 1;
    return overlay(p, o.preDays + o.shockDay, () => (level *= Math.exp(sd * rng.normal() - 1 / DAYS)), () => o.volumeCrash);
  }
});

/**
 * Block bootstrap of real histories: stitch random `block`-day runs of real daily log-returns
 * (and their volumes, rescaled to `advUsd`) from the given histories. Keeps fat tails and
 * volatility clustering inside each block.
 */
export function bootstrapPath(rng, histories, { preDays, days, advUsd, block = 30 }) {
  const n = preDays + days;
  const prices = [1];
  const volumesUsd = [];
  while (volumesUsd.length < n) {
    const h = histories[rng.int(histories.length)];
    if (h.prices.length < block + 2) continue;
    const start = 1 + rng.int(h.prices.length - block - 1);
    const med = [...h.volumesUsd].sort((a, b) => a - b)[h.volumesUsd.length >> 1] || 1;
    for (let k = 0; k < block && volumesUsd.length < n; k++) {
      const r = Math.log(h.prices[start + k] / h.prices[start + k - 1]);
      volumesUsd.push((advUsd * h.volumesUsd[start + k]) / med);
      if (prices.length < n) prices.push(prices.at(-1) * Math.exp(Number.isFinite(r) ? r : 0));
    }
  }
  return { prices, volumesUsd };
}

/** One path of a family. `histories` is needed only for 'bootstrap'. */
export function scenarioPath(family, rng, o, histories = []) {
  if (family === 'bootstrap') return bootstrapPath(rng, histories, o);
  const g = FAMILIES[family];
  if (!g) throw new Error(`unknown family ${family}`);
  return g(rng, o);
}

export const FAMILY_NAMES = Object.freeze([...Object.keys(FAMILIES), 'bootstrap']);
