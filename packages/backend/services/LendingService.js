// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

const { ethers } = require('ethers');

/**
 * LendingService
 * Computes advanced metrics for lenders, including accrued yield, APY projections, 
 * and early withdrawal penalty simulations.
 */
class LendingService {
  constructor(provider, contracts) {
    this.provider = provider;
    this.contracts = contracts; // { pool, ... }
    this.BPS_DENOMINATOR = 10000;
  }

  /**
   * Get comprehensive dashboard data for a lender.
   */
  async getLenderDashboard(walletAddress, persistedDeposits) {
    // 1. Fetch live pool state
    const [totalDeposits, totalBorrowed, variableApyBps, utilizationBps] = await Promise.all([
      this.contracts.pool.totalDeposits(),
      this.contracts.pool.totalBorrowed(),
      this.contracts.pool.getVariableApyBps(),
      this.contracts.pool.utilizationRateBps()
    ]);

    // 2. Fetch live on-chain positions
    // This is more reliable than persistence if we want real-time accuracy.
    const onChainPositions = [];
    try {
        let i = 0;
        while (true) {
            try {
                const pos = await this.contracts.pool.lenderPositions(walletAddress, i);
                if (pos.id === 0 && i > 0) break; // Stopper if needed, but contract uses index
                onChainPositions.push({
                    id: pos.id.toString(),
                    amount: pos.amount.toString(),
                    depositType: Number(pos.depositType), // 0: VARIABLE, 1: FIXED
                    startTime: Number(pos.startTime),
                    lockDays: Number(pos.lockDays),
                    lockEndTime: Number(pos.lockEndTime),
                    fixedApyBps: Number(pos.fixedApyBps),
                    isActive: pos.isActive
                });
                i++;
            } catch (e) {
                break; // End of array
            }
        }
    } catch (err) {
        console.warn(`[LendingService] Failed to fetch on-chain positions for ${walletAddress}: ${err.message}`);
    }

    // 3. Enrich positions with yield and penalties
    const enriched = onChainPositions.map(pos => {
      const now = Math.floor(Date.now() / 1000);
      const elapsedSeconds = now - pos.startTime;
      const elapsedDays = elapsedSeconds / 86400;
      
      const apyBps = pos.depositType === 1 ? pos.fixedApyBps : Number(variableApyBps);
      const yieldAmt = (BigInt(pos.amount) * BigInt(apyBps) * BigInt(Math.floor(elapsedSeconds))) / (BigInt(this.BPS_DENOMINATOR) * BigInt(365 * 24 * 60 * 60));
      
      let penaltyAmt = BigInt(0);
      if (pos.depositType === 1 && now < pos.lockEndTime) {
        penaltyAmt = (BigInt(pos.amount) * BigInt(1000)) / BigInt(this.BPS_DENOMINATOR); // 10% penalty
      }

      return {
        ...pos,
        currentApyBps: apyBps,
        accruedYield: yieldAmt.toString(),
        totalValue: (BigInt(pos.amount) + yieldAmt).toString(),
        earlyWithdrawalPenalty: penaltyAmt.toString(),
        canWithdrawWithoutPenalty: pos.depositType === 0 || now >= pos.lockEndTime
      };
    });

    const totalActiveValue = enriched.reduce((sum, p) => sum + (p.isActive ? BigInt(p.totalValue) : BigInt(0)), BigInt(0));
    const totalYield = enriched.reduce((sum, p) => sum + BigInt(p.accruedYield), BigInt(0));

    return {
      walletAddress,
      totalActiveValue: totalActiveValue.toString(),
      totalYield: totalYield.toString(),
      poolStats: {
        totalDeposits: totalDeposits.toString(),
        totalBorrowed: totalBorrowed.toString(),
        utilizationBps: utilizationBps.toString(),
        variableApyBps: variableApyBps.toString()
      },
      positions: enriched
    };
  }

  /**
   * Simulate projections for a deposit.
   */
  async getProjections(amount, apyBps) {
    const amt = BigInt(amount);
    const apy = BigInt(apyBps);

    const calculate = (days) => {
      return (amt * apy * BigInt(days)) / (BigInt(this.BPS_DENOMINATOR) * BigInt(365));
    };

    return {
      '30d': calculate(30).toString(),
      '90d': calculate(90).toString(),
      '1y': calculate(365).toString()
    };
  }
}

module.exports = LendingService;
