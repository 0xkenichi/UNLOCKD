// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * The two loan tiers, as calibrated by the stress test (bin/stress.js, data/STRESS.md).
 *
 *   standard  the default loan. No project backstop. One rule for every stream shape.
 *   optIn     a higher-LTV loan the borrower chooses knowingly: breach alerts and a cure window,
 *             and a project first-loss backstop of `backstopShare` of principal escrowed before
 *             the loan opens. The never-cure forced-liquidation rate is disclosed at signing.
 *
 * Both pass every acceptance criterion in bin/stress.js on two independent seeds; the margins
 * chosen leave room on each one (see FINDINGS.md §7). Changing these numbers means rerunning
 * the stress test.
 */

import { V2_DEFAULTS } from './v2.js';

export const TIERS = Object.freeze({
  standard: Object.freeze({
    key: 'standard',
    v2: Object.freeze({ ...V2_DEFAULTS, valuationMode: 'hold', alphaOrig: 0.02, alphaLiq: 0.10 }),
    backstopShare: 0
  }),
  optIn: Object.freeze({
    key: 'optIn',
    v2: Object.freeze({ ...V2_DEFAULTS, valuationMode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, marketabilityRateOrig: 1.5, marketabilityRateLiq: 0.75 }),
    // The largest per-shape requirement (linear streams, worst 1% realistic loss 15.5%), rounded up.
    backstopShare: 0.16
  })
});

/** Pool structure the tiers were tested against. */
export const POOL_STRUCTURE = Object.freeze({ junior: 0.15, insurance: 0.02, tokenConcentrationCap: 0.10 });
