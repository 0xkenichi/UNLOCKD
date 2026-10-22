// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { BPS, protocolDefaults } from './params.js';
import { discountMultiplier } from './onchain.js';
import { simulateLoan } from './simulate.js';
import { STRESS_SCENARIOS } from './paths.js';

/** The enforced stress set for one token: crashes scaled to its own history, the rest fixed. */
export function tokenStressScenarios(market, severity = DEFAULT_POLICY.stressSeverity) {
  const depth = (tailLog, floor) => Math.min(severity.cap, Math.max(floor, 1 - Math.exp(severity.tailMultiple * Math.min(0, tailLog))));
  const crash = depth(market.tail3d1pct, severity.crash3dFloor);
  const collapse = Math.max(crash, depth(market.tail14d1pct, severity.collapse14dFloor));
  return {
    'crash-3d': { label: `Crash −${Math.round(crash * 100)}% over 3 days (2× own worst 1%)`, drop: crash, days: 3, at: 7 },
    'collapse-14d': { label: `Collapse −${Math.round(collapse * 100)}% over 14 days (2× own worst 1%)`, drop: collapse, days: 14, at: 7 },
    'bear-180d': STRESS_SCENARIOS['bear-180d'],
    'grind-365d': STRESS_SCENARIOS['grind-365d'],
    'unlock-dump': STRESS_SCENARIOS['unlock-dump']
  };
}
import { tokenForLoan } from './profile.js';
import { maxPositionForImpact } from './market.js';
import { liquidationProbability, debtForLiquidationProbability } from './analytic.js';

/*
 * Layer 4 — per-token parameters that meet a written policy, re-derived from the token's
 * current market every time it is run.
 *
 * The contract offers these per-token levers (ValuationEngine): Ω (guardian, new loans only),
 * a hard LTV cap and a per-loan value cap (governor). σ, ranks and thresholds are global.
 * The calibration therefore solves for Ω: the largest value at which every policy limit
 * holds under every price model and every enforced stress, and then checks that answer
 * again on paths it has never seen.
 */

export const DEFAULT_POLICY = Object.freeze({
  maxExpectedLossPerYear: 0.005, //  base models: mean lender loss ≤ 0.5% of principal per year
  maxCvar99: 0.1, //                 base models: mean of the worst 1% of outcomes ≤ 10% of principal
  stressMaxExpectedLoss: Object.freeze({
    'crash-3d': 0.1,
    'collapse-14d': 0.1,
    'bear-180d': 0.05,
    'grind-365d': 0.02,
    'unlock-dump': 0.1
  }),
  // Enforced crashes are scaled to the token's own tails: twice its worst-1% move over the
  // same window, never milder than the floor (short or calm histories understate tails).
  stressSeverity: Object.freeze({ tailMultiple: 2, crash3dFloor: 0.4, collapse14dFloor: 0.6, cap: 0.95 }),
  maxLiquidationImpact: 0.15, //    a forced sale may move the price at most 15%
  horizonsYears: Object.freeze([0.25, 0.5, 1, 2]),
  borrowerLiquidationTargets: Object.freeze([0.1, 0.25]),
  minOmegaBps: 500,
  paths: 3000,
  stressPaths: 1000,
  validationPaths: 6000,
  seed: 20261022
});

/**
 * @param {object} profile   from buildProfile()
 * @param {object} o         { rank, policy?, params?, assumptions?, notionalUsd?, horizonsYears? }
 */
export function calibrateToken(profile, o = {}) {
  const policy = { ...DEFAULT_POLICY, ...(o.policy || {}) };
  const params = o.params || protocolDefaults();
  const rank = o.rank ?? 2;
  const assumptions = o.assumptions || {};
  const horizons = o.horizonsYears || policy.horizonsYears;
  const notionalUsd = o.notionalUsd ?? 100_000;
  const enforced = tokenStressScenarios(profile.market, policy.stressSeverity);

  const run = (model, years, omegaBps, extra = {}) =>
    simulateLoan({
      token: tokenForLoan(profile, model, years),
      loan: { notionalUsd, years, rank, omegaBps },
      assumptions,
      params,
      paths: extra.paths ?? policy.paths,
      seed: extra.seed ?? policy.seed,
      scenario: extra.scenario ?? null
    });

  // More credit means more loss on average (not on every path — see test/simulate.test.js), so
  // bisect each constraint on Ω with common random numbers; validation re-checks the answer.
  const constraints = [];
  for (const years of horizons) {
    for (const model of profile.models) {
      constraints.push({
        id: `${model.kind} · ${years}y`,
        years,
        ok: (omega) => {
          const r = run(model, years, omega);
          return r.expectedLossPerYear <= policy.maxExpectedLossPerYear && r.cvar99 <= policy.maxCvar99;
        }
      });
    }
    for (const [name, limit] of Object.entries(policy.stressMaxExpectedLoss)) {
      constraints.push({
        id: `stress ${name} · ${years}y`,
        years,
        ok: (omega) =>
          run(profile.models[0], years, omega, { scenario: enforced[name], paths: policy.stressPaths }).expectedLoss <= limit
      });
    }
  }

  const binding = [];
  let omegaBps = BPS;
  for (const c of constraints) {
    if (omegaBps === 0) break; // no credit satisfies every limit
    if (c.ok(omegaBps)) continue; // already satisfied at the current (lower) Ω
    let lo = 0;
    let hi = omegaBps;
    while (hi - lo > 50) {
      const mid = Math.round((lo + hi) / 2);
      if (c.ok(mid)) lo = mid;
      else hi = mid;
    }
    omegaBps = lo;
    binding.push({ constraint: c.id, omegaBps: lo });
  }
  const credit = omegaBps >= policy.minOmegaBps;
  if (!credit) omegaBps = 0;

  // Out-of-sample: a fresh seed and twice the paths, at the chosen Ω.
  const validation = [];
  if (credit) {
    for (const years of horizons) {
      for (const model of profile.models) {
        const r = run(model, years, omegaBps, { seed: policy.seed + 7919, paths: policy.validationPaths });
        const margin = 2 * r.expectedLossStdErr / Math.max(years, 1 / 365);
        validation.push({
          model: model.kind,
          years,
          expectedLossPerYear: r.expectedLossPerYear,
          cvar99: r.cvar99,
          pLiquidation: r.pLiquidation,
          lenderNetReturnPerYear: r.lenderNetReturnPerYear,
          meanRecovery: r.meanRecovery,
          borrowerCostOfLiquidation: r.borrowerCostOfLiquidation,
          passed: r.expectedLossPerYear <= policy.maxExpectedLossPerYear + margin && r.cvar99 <= policy.maxCvar99 * 1.25
        });
      }
    }
  }

  // Stress table at the chosen Ω: the enforced (token-scaled) set, then the uniform library
  // for comparison across tokens. The overnight gap is sized for insurance, not for LTV.
  const stress = [];
  const stressOmega = credit ? omegaBps : BPS;
  const stressYears = horizons.includes(1) ? 1 : horizons[horizons.length - 1];
  const addStress = (name, scenario, enforcedHere) => {
    const r = run(profile.models[0], stressYears, stressOmega, { scenario, paths: policy.stressPaths });
    stress.push({
      scenario: name,
      label: scenario.label,
      years: stressYears,
      expectedLoss: r.expectedLoss,
      cvar99: r.cvar99,
      pLiquidation: r.pLiquidation,
      enforced: enforcedHere,
      limit: enforcedHere ? policy.stressMaxExpectedLoss[name] : null
    });
  };
  for (const [name, scenario] of Object.entries(enforced)) addStress(name, scenario, name in policy.stressMaxExpectedLoss);
  for (const name of ['gap-1d', 'crash-3d', 'collapse-14d']) addStress(`uniform ${name}`, STRESS_SCENARIOS[name], false);

  // Per-loan value cap from liquidity: the largest position whose forced sale stays within the impact limit.
  const maxNotional = maxPositionForImpact(policy.maxLiquidationImpact, { advUsd: profile.advUsd, sigmaAnnual: profile.impactVol });
  const longest = horizons[horizons.length - 1];
  const multLongest = discountMultiplier({ price: profile.spot, years: longest, rank, bounds: profile.bounds }, params.valuation).multiplier;
  const maxBorrowUsd = Number.isFinite(maxNotional) ? (maxNotional * multLongest * omegaBps) / BPS : 0;

  // What a borrower faces at the chosen Ω (closed form; the simulator agrees with it).
  const sigma = profile.impactVol;
  const borrower = horizons.map((years) => {
    const quantity = notionalUsd / profile.spot;
    const mult = discountMultiplier({ price: profile.spot, years, rank, bounds: profile.bounds }, params.valuation).multiplier;
    const pv = (quantity * profile.spot * mult * omegaBps) / BPS;
    const maxDebt = (pv * params.valuation.rankBaseLtvBps[rank]) / BPS;
    const args = { quantity, spot: profile.spot, years, rank, sigma, borrowRateBps: assumptions.borrowRateBps ?? 1500 };
    const atMax = maxDebt > 0 ? liquidationProbability({ ...args, debt: maxDebt }, params) : null;
    return {
      years,
      pLiquidationAtMax: atMax ? atMax.probability : null,
      dropToTrigger: atMax ? atMax.dropToTrigger : null,
      safeFractionOfMax: Object.fromEntries(
        policy.borrowerLiquidationTargets.map((t) => [
          t,
          maxDebt > 0 ? Math.min(1, debtForLiquidationProbability(t, args, params) / maxDebt) : 0
        ])
      )
    };
  });

  // The per-token σ the contract would need for the same haircut, were σ per token on chain.
  const sigmaGlobal = params.valuation.volatility / 100;
  const sigmaEquivalent = Math.min(1, Math.max(0, 2 - 2 * (omegaBps / BPS) * (1 - sigmaGlobal / 2)));

  return {
    symbol: profile.symbol,
    rank,
    policy,
    recommendation: {
      omegaBps,
      newCredit: credit,
      maxBorrowUsd: Math.round(maxBorrowUsd),
      sigmaEquivalentPct: Math.round(sigmaEquivalent * 100),
      binding
    },
    validation,
    validated: credit ? validation.every((v) => v.passed) : null,
    stress,
    borrower,
    market: profile.market
  };
}
