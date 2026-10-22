// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Protocol defaults, copied from the deployed sources (packages/contracts/src at ef2e300).
 * Ranks are indexed 1..3 like the contracts; index 0 is unused.
 * If a contract default changes, change it here and the on-chain mirror tests will say
 * whether anything else must follow.
 */

export const BPS = 10_000;
export const YEAR_SECONDS = 365 * 24 * 3600;

export const VALUATION_DEFAULTS = Object.freeze({
  volatility: 50, //                  ValuationEngine.volatility (percent, one value for every token)
  rankBaseLtvBps: [0, 5000, 3500, 2000], // ValuationEngine.rankBaseLtvBps
  rankDiscountRateBps: [0, 200, 500, 1000], // ValuationEngine.rankDiscountRateBps (per year)
  drawdownPenaltyPerBps: 50, //       penalty bps per 100 bps of drawdown from ATH
  maxDrawdownPenaltyBps: 2000,
  rangeVolWeightBps: 2000, //         share of the ATH/ATL range ratio added to σ
  preTGEHaircutBps: 9000
});

export const LOAN_DEFAULTS = Object.freeze({
  originationFeeBps: 50, //           LoanManager.originationFeeBps
  reserveFactorBps: 1000, //          share of interest sent to insurance
  gracePeriodDays: 3,
  auctionDurationDays: 3,
  auctionStartPremiumBps: 12_000, //  120% of max(spot value, debt)
  auctionFloorBps: 1000, //           each round ends at 10% of its start price
  liqThresholdBps: [0, 6500, 5000, 3500]
});

export const POOL_DEFAULTS = Object.freeze({
  baseRateBps: 500, //                LendingPool rate model
  slope1Bps: 1000,
  slope2Bps: 6000,
  kinkBps: 8000
});

export function protocolDefaults() {
  return {
    valuation: { ...VALUATION_DEFAULTS, rankBaseLtvBps: [...VALUATION_DEFAULTS.rankBaseLtvBps], rankDiscountRateBps: [...VALUATION_DEFAULTS.rankDiscountRateBps] },
    loan: { ...LOAN_DEFAULTS, liqThresholdBps: [...LOAN_DEFAULTS.liqThresholdBps] },
    pool: { ...POOL_DEFAULTS }
  };
}
