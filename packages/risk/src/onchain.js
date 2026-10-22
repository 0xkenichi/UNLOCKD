// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { BPS, YEAR_SECONDS, protocolDefaults } from './params.js';

/*
 * Layer 1 — a line-for-line mirror of the deployed maths, in USD floats.
 *
 * Integer steps that can move a threshold (σ in whole percent, penalties in whole bps,
 * floor divisions in the rate model and the auction) are reproduced exactly; USDC
 * rounding (6 decimals) is not, so results agree with the chain to well under a cent.
 *
 * Sources (packages/contracts/src, ef2e300):
 *   ValuationEngine._discountedValue / _volAndDrawdown / computeDPV / liquidationValue / spotValue / _price
 *   LoanManager.borrow / isLiquidatable / healthFactorBps / startLiquidation / restartAuction /
 *               currentPrice / _settle / _indexAfter / _netOfReserve
 *   LendingPool.rateAt
 */

const floor = Math.floor;

/** σ actually used (whole percent) and the drawdown penalty (bps). ValuationEngine._volAndDrawdown */
export function effectiveVolatility(price, bounds, v = protocolDefaults().valuation) {
  let effVol = v.volatility;
  let penalty = 0;
  if (bounds && bounds.ath > 0 && bounds.atl > 0) {
    const { ath, atl } = bounds;
    if (price < ath) {
      const drawdownBps = floor(((ath - price) * BPS) / ath);
      penalty = floor((drawdownBps * v.drawdownPenaltyPerBps) / 100);
      if (penalty > v.maxDrawdownPenaltyBps) penalty = v.maxDrawdownPenaltyBps;
    }
    const rangeRatioBps = floor(((ath - atl) * BPS) / (ath + atl));
    effVol += floor((rangeRatioBps * v.rangeVolWeightBps) / (BPS * 100));
  }
  if (effVol > 100) effVol = 100;
  return { effVol, penaltyBps: penalty };
}

/** Product of the three discounts applied to Q·P. ValuationEngine._discountedValue */
export function discountMultiplier({ price, years, rank, bounds }, v = protocolDefaults().valuation) {
  const timeFactor = years > 0 ? Math.exp(-(v.rankDiscountRateBps[rank] / BPS) * years) : 1;
  const { effVol, penaltyBps } = effectiveVolatility(price, bounds, v);
  const volFactor = (200 - effVol) / 200;
  const drawdownFactor = (BPS - penaltyBps) / BPS;
  return { multiplier: timeFactor * volFactor * drawdownFactor, timeFactor, volFactor, drawdownFactor, effVol, penaltyBps };
}

/**
 * Valuation price. Origination uses min(spot, TWAP, fresh EWMA); health checks use
 * min(spot, TWAP). Pre-TGE tokens use the synthetic price less the haircut. ValuationEngine._price
 */
export function valuationPrice({ spot, twap, ewma, synthetic }, useEwma, v = protocolDefaults().valuation) {
  if (synthetic != null) return (synthetic * (BPS - v.preTGEHaircutBps)) / BPS;
  let p = spot;
  if (twap > 0 && twap < p) p = twap;
  if (useEwma && ewma > 0 && ewma < p) p = ewma;
  return p;
}

/**
 * Origination valuation. ValuationEngine.computeDPV
 * @returns {{pv:number, ltvBps:number, detail:object}}
 */
export function computeDPV(
  { quantity, prices, years, rank, bounds, omegaBps = BPS, maxBorrowUsd = 0, hardLtvCapBps = 0 },
  params = protocolDefaults()
) {
  if (!(quantity > 0)) throw new Error('quantity=0');
  if (!(years > 0)) throw new Error('already unlocked');
  if (!(rank >= 1 && rank <= 3)) throw new Error('unverified contract');
  const v = params.valuation;
  const price = valuationPrice(prices, true, v);
  const d = discountMultiplier({ price, years, rank, bounds }, v);
  let pv = quantity * price * d.multiplier;
  pv = (pv * omegaBps) / BPS;
  if (prices.synthetic != null && !(maxBorrowUsd > 0)) throw new Error('pre-TGE cap required');
  if (maxBorrowUsd > 0 && pv > maxBorrowUsd) pv = maxBorrowUsd;
  let ltvBps = v.rankBaseLtvBps[rank];
  if (hardLtvCapBps > 0 && ltvBps > hardLtvCapBps) ltvBps = hardLtvCapBps;
  return { pv, ltvBps, detail: { price, ...d } };
}

/** Health valuation: no Ω, freeze, cap or EWMA; works after unlock. ValuationEngine.liquidationValue */
export function liquidationValue({ quantity, prices, years, rank, bounds }, params = protocolDefaults()) {
  const v = params.valuation;
  const price = valuationPrice(prices, false, v);
  return quantity * price * discountMultiplier({ price, years: Math.max(0, years), rank, bounds }, v).multiplier;
}

/** Undiscounted market value. ValuationEngine.spotValue */
export function spotValue(quantity, prices, v = protocolDefaults().valuation) {
  return quantity * valuationPrice(prices, false, v);
}

/** Largest loan the contract accepts. LoanManager.quoteMaxBorrow / borrow */
export function maxBorrow(args, params = protocolDefaults()) {
  const { pv, ltvBps } = computeDPV(args, params);
  if (!(ltvBps < params.loan.liqThresholdBps[args.rank])) throw new Error('ltv >= liquidation threshold');
  return { maxBorrow: (pv * ltvBps) / BPS, pv, ltvBps };
}

export function originationFee(amount, params = protocolDefaults()) {
  return (amount * params.loan.originationFeeBps) / BPS;
}

/** LoanManager.healthFactorBps (≥ 10 000 is healthy) */
export function healthFactorBps(debt, value, rank, params = protocolDefaults()) {
  if (debt <= 0) return Infinity;
  return (value * params.loan.liqThresholdBps[rank]) / debt;
}

/** LoanManager.isLiquidatable */
export function isLiquidatable({ debt, value, rank, pastGrace = false }, params = protocolDefaults()) {
  if (pastGrace) return true;
  return debt * BPS > value * params.loan.liqThresholdBps[rank];
}

/** Floating borrow APR (bps) at utilisation u (bps). LendingPool.rateAt */
export function rateAt(u, pool = protocolDefaults().pool) {
  const { baseRateBps, slope1Bps, slope2Bps, kinkBps } = pool;
  if (u <= kinkBps) return baseRateBps + floor((u * slope1Bps) / kinkBps);
  return baseRateBps + slope1Bps + floor(((u - kinkBps) * slope2Bps) / (BPS - kinkBps));
}

/** Lenders' approximate supply APR (bps), as documented for LendingPool. */
export function supplyRateBps(u, params = protocolDefaults()) {
  return (rateAt(u, params.pool) * u * (BPS - params.loan.reserveFactorBps)) / (BPS * BPS);
}

/** Borrow index after dt seconds at rateBps (one accrual step). LoanManager._indexAfter */
export function indexAfter(index, rateBps, dtSeconds) {
  return index + (index * rateBps * dtSeconds) / (YEAR_SECONDS * BPS);
}

/** Lenders' claim: principal plus interest net of the reserve factor. LoanManager._netOfReserve */
export function netOfReserve(debt, principal, params = protocolDefaults()) {
  const interest = debt > principal ? debt - principal : 0;
  return principal + interest - (interest * params.loan.reserveFactorBps) / BPS;
}

/** Opening state of a Dutch auction. LoanManager.startLiquidation */
export function auctionStart({ debt, spot }, params = protocolDefaults()) {
  const l = params.loan;
  const startPrice = spot == null ? debt * 4 : (Math.max(spot, debt) * l.auctionStartPremiumBps) / BPS;
  return { startPrice, floorPrice: (startPrice * l.auctionFloorBps) / BPS, durationDays: l.auctionDurationDays };
}

/** Price `elapsedDays` into a round: linear from start to floor, then the floor. LoanManager.currentPrice */
export function auctionPrice({ startPrice, floorPrice, durationDays }, elapsedDays) {
  if (elapsedDays >= durationDays) return floorPrice;
  return floorPrice + ((startPrice - floorPrice) * (durationDays - elapsedDays)) / durationDays;
}

/** Next round after one ends without a bid. LoanManager.restartAuction */
export function auctionRestart(a, params = protocolDefaults()) {
  return { ...a, startPrice: a.floorPrice, floorPrice: (a.floorPrice * params.loan.auctionFloorBps) / BPS };
}

/**
 * Where an auction's proceeds go. LoanManager._settle
 * `insuranceBalance` is what the insurance vault can pay (InsuranceVault.cover pays up to its balance).
 */
export function settle({ price, debt, principal, insuranceBalance = 0 }, params = protocolDefaults()) {
  const claim = netOfReserve(debt, principal, params);
  const toDebt = Math.min(price, debt);
  const surplus = price - toDebt;
  let covered = 0;
  if (toDebt < debt) covered = Math.min(debt - toDebt, Math.max(0, insuranceBalance));
  const received = toDebt + covered;
  const toLenders = Math.min(received, claim);
  const toReserve = received - toLenders;
  const lenderLoss = claim - toLenders;
  return { claim, toDebt, surplus, covered, received, toLenders, toReserve, lenderLoss };
}
