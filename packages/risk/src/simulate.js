// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { BPS, protocolDefaults } from './params.js';
import {
  maxBorrow,
  liquidationValue,
  isLiquidatable,
  auctionStart,
  auctionPrice,
  auctionRestart,
  settle,
  netOfReserve
} from './onchain.js';
import { createRng } from './rng.js';
import { DAYS_PER_YEAR, priceImpact } from './market.js';
import { pathGenerator, scenarioShift, unlockShift } from './paths.js';

/*
 * Layer 3 — play a loan forward on many price paths under the exact contract rules
 * (layer 1) and the token's own market (layer 2), and measure what lenders lose.
 *
 * Per path, day by day:
 *   1. interest accrues on the debt at the assumed floating APR;
 *   2. the health check runs on liquidationValue (no Ω, no EWMA, as on chain);
 *   3. at maturity the borrower repays only if the stream is worth more than the debt —
 *      loans are non-recourse, so walking away is the rational choice otherwise;
 *   4. a liquidation runs the contract's Dutch auction hour by hour; it clears when the
 *      auction price falls to what a buyer would pay for the locked stream
 *      (spot, discounted at the buyer's required return until unlock, less the price impact
 *      of eventually selling the tokens);
 *   5. proceeds go through the contract's settlement waterfall.
 */

export const DEFAULT_ASSUMPTIONS = Object.freeze({
  borrowRateBps: 1500, //      floating APR assumed for the life of the loan (rateAt(kink) with defaults)
  buyerDiscountRate: 0.3, //   annual return an auction buyer demands for holding locked tokens
  borrowerDiscountRate: 0, //  how the borrower values their own stream when deciding to repay
  impactY: 1, //               square-root impact constant
  unlockShockKappa: 0.5, //    log-price drop per unit of supply overhang at unlock (assumption)
  maxAuctionRounds: 12,
  insuranceUsd: 0 //           insurance available to this loan; 0 measures the lenders' gross loss
});

const OUTCOME = { REPAID: 0, LIQUIDATED_HEALTH: 1, LIQUIDATED_MATURITY: 2 };

/**
 * @param {object} o
 * @param {object} o.token  { spot, model, advUsd, impactVol, bounds?, overhangAtUnlock? }
 * @param {object} o.loan   { notionalUsd, years, maturityYears?, rank, omegaBps?, borrowFraction?,
 *                            hardLtvCapBps?, maxBorrowUsd? }
 * @param {object} [o.assumptions]
 * @param {object} [o.params]      protocol parameters (defaults = deployed)
 * @param {number} [o.paths]
 * @param {number|string} [o.seed]
 * @param {object} [o.scenario]    one of STRESS_SCENARIOS
 */
export function simulateLoan({ token, loan, assumptions = {}, params = protocolDefaults(), paths = 4000, seed = 1, scenario = null }) {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const rank = loan.rank;
  const years = loan.years;
  const maturityYears = Math.min(loan.maturityYears ?? years, years);
  const quantity = loan.notionalUsd / token.spot;
  const thrBps = params.loan.liqThresholdBps[rank];
  const graceDays = params.loan.gracePeriodDays;

  // Origination exactly as LoanManager.borrow would allow it, at today's price.
  const open = maxBorrow(
    {
      quantity,
      prices: { spot: token.spot, twap: token.spot, ewma: token.spot },
      years,
      rank,
      bounds: token.bounds,
      omegaBps: loan.omegaBps ?? BPS,
      hardLtvCapBps: loan.hardLtvCapBps ?? 0,
      maxBorrowUsd: loan.maxBorrowUsd ?? 0
    },
    params
  );
  const principal = open.maxBorrow * (loan.borrowFraction ?? 1);
  if (!(principal > 0)) throw new Error('nothing can be borrowed against this collateral');

  const unlockDay = Math.round(years * DAYS_PER_YEAR);
  const maturityDay = Math.max(1, Math.round(maturityYears * DAYS_PER_YEAR));
  const lastCheckDay = maturityDay + graceDays;
  const length = lastCheckDay + params.loan.auctionDurationDays * a.maxAuctionRounds + 2;

  const gen = pathGenerator(token.model);
  const rng = createRng(seed);
  const shift = scenarioShift(scenario, length, unlockDay);
  const shock = unlockShift(length, unlockDay, token.overhangAtUnlock ?? 0, a.unlockShockKappa);
  const path = new Float64Array(length);
  const dailyRate = a.borrowRateBps / BPS / DAYS_PER_YEAR;
  const impactParams = { advUsd: token.advUsd, sigmaAnnual: token.impactVol, impactY: a.impactY };

  const losses = new Float64Array(paths);
  const outcome = new Uint8Array(paths);
  const liqDay = new Float64Array(paths);
  const pnl = new Float64Array(paths); // lenders' result per path, fraction of principal
  let recoverySum = 0;
  let borrowerCostSum = 0; // stream value given up at liquidation, net of surplus returned, per $ of stream

  const priceOn = (day) => path[Math.min(length - 1, Math.max(0, Math.floor(day)))];
  const yearsLeft = (day) => Math.max(0, years - day / DAYS_PER_YEAR);
  const buyerValue = (day) => {
    const s = priceOn(day);
    const gross = quantity * s;
    return gross * Math.exp(-a.buyerDiscountRate * yearsLeft(day)) * (1 - priceImpact(gross, impactParams));
  };

  for (let p = 0; p < paths; p++) {
    gen(rng, path, token.spot);
    for (let d = 1; d < length; d++) path[d] *= Math.exp(shift[d] + shock[d]);

    let debt = principal;
    let liquidateOn = -1;
    let kind = OUTCOME.REPAID;

    for (let d = 1; d <= lastCheckDay; d++) {
      debt *= 1 + dailyRate;
      const s = path[d];
      const value = liquidationValue({ quantity, prices: { spot: s, twap: s }, years: yearsLeft(d), rank, bounds: token.bounds }, params);
      if (isLiquidatable({ debt, value, rank }, params)) {
        liquidateOn = d;
        kind = OUTCOME.LIQUIDATED_HEALTH;
        break;
      }
      if (d === maturityDay) {
        const gross = quantity * s;
        const worth = gross * Math.exp(-a.borrowerDiscountRate * yearsLeft(d)) * (1 - priceImpact(gross, impactParams));
        if (worth >= debt) break; // repaid
        // Walks away; the loan becomes liquidatable once the grace period ends.
        liquidateOn = lastCheckDay;
        kind = OUTCOME.LIQUIDATED_MATURITY;
        debt *= Math.pow(1 + dailyRate, graceDays);
        break;
      }
    }

    outcome[p] = kind;
    if (kind === OUTCOME.REPAID) {
      pnl[p] = (netOfReserve(debt, principal, params) - principal) / principal;
      continue;
    }

    // Dutch auction, hour by hour, until a buyer's valuation meets the price.
    let auction = auctionStart({ debt, spot: quantity * priceOn(liquidateOn) }, params);
    let price = 0;
    search: for (let round = 0; round < a.maxAuctionRounds; round++) {
      const roundStart = liquidateOn + round * auction.durationDays;
      for (let h = 0; h <= auction.durationDays * 24; h++) {
        const t = h / 24;
        const ask = auctionPrice(auction, t);
        if (ask <= buyerValue(roundStart + t)) {
          price = ask;
          break search;
        }
      }
      auction = auctionRestart(auction, params);
    }
    const s = settle({ price, debt, principal, insuranceBalance: a.insuranceUsd }, params);
    losses[p] = s.lenderLoss / principal;
    pnl[p] = (s.toLenders - principal) / principal;
    liqDay[p] = liquidateOn;
    recoverySum += s.toLenders / s.claim;
    // A borrower who could have repaid keeps Q·S (the price is a martingale); liquidated, they get price − debt.
    const streamValue = quantity * priceOn(liquidateOn);
    if (streamValue > 0) borrowerCostSum += Math.max(0, streamValue - price) / streamValue;
  }

  return summarise({ losses, outcome, liqDay, pnl, recoverySum, borrowerCostSum, principal, open, maturityYears, paths });
}

function summarise({ losses, outcome, liqDay, pnl, recoverySum, borrowerCostSum, principal, open, maturityYears, paths }) {
  let liq = 0;
  let liqMaturity = 0;
  let lossCount = 0;
  let sum = 0;
  let sumSq = 0;
  let netSum = 0;
  let daySum = 0;
  for (let i = 0; i < paths; i++) {
    const l = losses[i];
    sum += l;
    sumSq += l * l;
    if (l > 1e-12) lossCount++;
    if (outcome[i] !== OUTCOME.REPAID) {
      liq++;
      daySum += liqDay[i];
      if (outcome[i] === OUTCOME.LIQUIDATED_MATURITY) liqMaturity++;
    }
    netSum += pnl[i];
  }
  const el = sum / paths;
  const variance = Math.max(0, sumSq / paths - el * el);
  const sorted = Float64Array.from(losses).sort();
  const cvar = (q) => {
    const k = Math.max(1, Math.round(paths * (1 - q)));
    let s = 0;
    for (let i = paths - k; i < paths; i++) s += sorted[i];
    return s / k;
  };
  return {
    paths,
    principal,
    pv: open.pv,
    ltvBps: open.ltvBps,
    pLiquidation: liq / paths,
    pLiquidationAtMaturity: liqMaturity / paths,
    pLoss: lossCount / paths,
    expectedLoss: el, //                 fraction of principal, over the life of the loan
    expectedLossStdErr: Math.sqrt(variance / paths),
    expectedLossPerYear: el / Math.max(maturityYears, 1 / DAYS_PER_YEAR),
    cvar95: cvar(0.95),
    cvar99: cvar(0.99),
    worstLoss: sorted[paths - 1],
    meanRecovery: liq ? recoverySum / liq : null,
    borrowerCostOfLiquidation: liq ? borrowerCostSum / liq : null,
    meanDaysToLiquidation: liq ? daySum / liq : null,
    lenderNetReturn: netSum / paths, //   what lenders end up with, net of reserve and losses, fraction of principal
    lenderNetReturnPerYear: netSum / paths / Math.max(maturityYears, 1 / DAYS_PER_YEAR)
  };
}
