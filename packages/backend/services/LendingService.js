// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/**
 * LendingService
 * Lender metrics for the ERC-4626 LendingPool. There are no fixed-term positions,
 * lock-ups or withdrawal penalties: a lender holds pool shares whose value grows as
 * borrow interest accrues, and every lender earns the same floating rate.
 */
class LendingService {
  constructor(provider, contracts) {
    this.provider = provider;
    this.contracts = contracts; // { pool, loanManager? }
    this.BPS_DENOMINATOR = 10000n;
    // LoanManager default; used only if the contract is not wired or the read fails.
    this.DEFAULT_RESERVE_FACTOR_BPS = 1000n;
  }

  async getReserveFactorBps() {
    if (!this.contracts.loanManager) return this.DEFAULT_RESERVE_FACTOR_BPS;
    try {
      return BigInt(await this.contracts.loanManager.reserveFactorBps());
    } catch {
      return this.DEFAULT_RESERVE_FACTOR_BPS;
    }
  }

  /**
   * Current supply rate: borrow APR × utilization × (1 − reserve factor).
   * This is the instantaneous variable rate, not a promised yield.
   */
  supplyRateBps(borrowRateBps, utilizationBps, reserveFactorBps) {
    const b = BigInt(borrowRateBps);
    const u = BigInt(utilizationBps);
    const r = BigInt(reserveFactorBps);
    return (b * u * (this.BPS_DENOMINATOR - r)) / (this.BPS_DENOMINATOR * this.BPS_DENOMINATOR);
  }

  async getPoolStats() {
    const { pool } = this.contracts;
    const [totalAssets, totalSupply, totalBorrowed, availableLiquidity, utilizationBps, borrowRateBps, reserveFactorBps] =
      await Promise.all([
        pool.totalAssets(),
        pool.totalSupply(),
        pool.totalBorrowed(),
        pool.availableLiquidity(),
        pool.utilizationBps(),
        pool.borrowRateBps(),
        this.getReserveFactorBps()
      ]);

    return {
      totalAssets: totalAssets.toString(),
      totalSupply: totalSupply.toString(),
      totalBorrowed: totalBorrowed.toString(),
      availableLiquidity: availableLiquidity.toString(),
      utilizationBps: utilizationBps.toString(),
      borrowRateBps: borrowRateBps.toString(),
      supplyRateBps: this.supplyRateBps(borrowRateBps, utilizationBps, reserveFactorBps).toString(),
      reserveFactorBps: reserveFactorBps.toString()
    };
  }

  /**
   * Dashboard data for a lender: share balance, its current value in USDC and
   * how much of it can be withdrawn right now (bounded by idle liquidity).
   */
  async getLenderDashboard(walletAddress) {
    const { pool } = this.contracts;
    const [poolStats, shares, maxWithdraw] = await Promise.all([
      this.getPoolStats(),
      pool.balanceOf(walletAddress),
      pool.maxWithdraw(walletAddress)
    ]);
    const assets = shares > 0n ? await pool.convertToAssets(shares) : 0n;

    return {
      walletAddress,
      shares: shares.toString(),
      assets: assets.toString(),
      maxWithdraw: maxWithdraw.toString(),
      poolStats
    };
  }

  /**
   * Simple-interest projection at a given rate. The pool rate floats with
   * utilization, so this is an illustration, not a quote.
   */
  async getProjections(amount, apyBps) {
    const amt = BigInt(amount);
    const apy = BigInt(apyBps);

    const calculate = (days) => (amt * apy * BigInt(days)) / (this.BPS_DENOMINATOR * 365n);

    return {
      '30d': calculate(30).toString(),
      '90d': calculate(90).toString(),
      '1y': calculate(365).toString()
    };
  }
}

module.exports = LendingService;
