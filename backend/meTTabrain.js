// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/**
 * MeTTabrain Engine
 * Central algorithmic engine for Vestra Protocol loan dynamics.
 * Autonomous formulas for Health, APR, and Vesting tracking using high precision math.
 */

const Big = require('big.js');
const { create, all } = require('mathjs');
const math = create(all, { precision: 64 });

class MeTTabrain {
  constructor() {
    this.BPS_DENOMINATOR = new Big('10000');
    this.SECONDS_PER_YEAR = new Big('31536000');
    this.DAYS_PER_YEAR = new Big('365');
  }

  /**
   * Calculate Dynamic APR
   * @param {Object} params - The inputs for the APR calculation
   * @param {string} params.baseRateBps - Base interest rate in basis points
   * @param {string} params.utilizationRatio - Current pool utilization (0.0 to 1.0)
   * @param {string} params.volatilityIndex - Asset volatility (0.0 to 1.0)
   * @param {string} params.userCreditScore - Identity score (0 to 1000)
   * @returns {string} Calculated APR in percentage
   */
  calculateDynamicAPR({ baseRateBps, utilizationRatio, volatilityIndex, userCreditScore }) {
    try {
      // Convert to Big
      const base = new Big(baseRateBps).div(this.BPS_DENOMINATOR);
      const util = new Big(utilizationRatio);
      const vol = new Big(volatilityIndex);
      const score = new Big(userCreditScore);

      // k = curve steepness based on volatility
      const k = vol.times(2).plus(1);

      // Yield Multiplier = (utilization^k * volatility)
      const multiplier = new Big(math.pow(util.toNumber(), k.toNumber())).times(vol);

      // Score Discount = max(0, (score - 500) / 1000) * 0.5 (max 50% discount)
      let discount = new Big(0);
      if (score.gt(500)) {
        discount = score.minus(500).div(1000).times(0.5);
      }

      // Final APR = base + (base * multiplier)
      let apr = base.plus(base.times(multiplier));
      
      // Apply discount
      apr = apr.times(new Big(1).minus(discount));

      // Return percentage
      return apr.times(100).toFixed(4);
    } catch (e) {
      console.error('MeTTabrain APR calculation error:', e);
      return (new Big(baseRateBps).div(100)).toFixed(4); // fallback to base
    }
  }

  /**
   * Evaluate Loan Health Score
   * @param {Object} loanData - Vestra Loan parameters
   * @param {string} loanData.principal - Loan principal in USDC
   * @param {string} loanData.interestAccrued - Interest accrued in USDC
   * @param {string} loanData.collateralValueUsd - Collateral value locked in USD
   * @param {string} loanData.durationDays - Total loan duration
   * @param {string} loanData.elapsedDays - Days elapsed since origination
   * @returns {number} Health Factor (HF < 1 = Liquidation)
   */
  evaluateLoanHealth({ principal, interestAccrued, collateralValueUsd, durationDays, elapsedDays }) {
    try {
      const p = new Big(principal);
      const i = new Big(interestAccrued);
      const c = new Big(collateralValueUsd);
      const duration = new Big(durationDays);
      const elapsed = new Big(elapsedDays);

      const totalDebt = p.plus(i);
      if (totalDebt.eq(0)) return Infinity;

      // Time risk penalty: Health deteriorates faster globally as maturity approaches
      let timeRisk = new Big(1);
      if (duration.gt(0)) {
         const timeRatio = elapsed.div(duration);
         // Exponential decay factor on collateral effectiveness based on impending deadline
         // At t=0 -> x1, at t=100% -> x0.8
         timeRisk = new Big(1).minus(timeRatio.times(0.2)); 
      }

      const effectiveCollateral = c.times(timeRisk);
      const healthFactor = effectiveCollateral.div(totalDebt);

      return healthFactor.toNumber();
    } catch (e) {
      console.error('MeTTabrain Health calculation error:', e);
      return 1.0; // fallback health
    }
  }

  /**
   * Project Linear Vesting Remaining
   * @param {number} totalAllocation - Total tokens originally allocated
   * @param {number} startTime - Epoch timestamp of vest start
   * @param {number} endTime - Epoch timestamp of vest end
   * @param {number} currentTime - Current Epoch timestamp
   * @returns {number} The quantity of tokens still locked
   */
  calculateLockedVestedAmount(totalAllocation, startTime, endTime, currentTime) {
    if (currentTime >= endTime) return 0;
    if (currentTime <= startTime) return totalAllocation;

    const totalDuration = endTime - startTime;
    const elapsed = currentTime - startTime;
    const unlockedRatio = elapsed / totalDuration;

    const alloc = new Big(totalAllocation);
    const locked = alloc.times(new Big(1).minus(unlockedRatio));

    return locked.toNumber();
  }
}

module.exports = new MeTTabrain();
