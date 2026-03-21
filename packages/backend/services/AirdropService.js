class AirdropService {
  constructor(persistence) {
    this.persistence = persistence;
  }

  calculateBorrowPoints(amountUsd, isPrivate = false) {
    const borrowPoints = Math.floor(amountUsd / 10); // 100 points per $1000 PV
    const privacyBonus = isPrivate ? Math.floor(borrowPoints * 0.2) : 0;
    return { borrow: borrowPoints, privacy: privacyBonus };
  }

  calculateLendPoints(amountUsd) {
    return { lend: Math.floor(amountUsd / 6.66) }; // ~150 points per $1000 liquidity
  }

  async recordActivityPoints(wallet, pointsData) {
    if (!wallet || !pointsData) return;
    return this.persistence.updatePoints(wallet, pointsData);
  }

  async getWalletPoints(wallet) {
    if (!wallet) return null;
    return this.persistence.getPoints(wallet);
  }

  async getLeaderboard(params = {}) {
    const { windowDays = 30, limit = 100, phase = 'testnet' } = params;
    return this.persistence.getAirdropLeaderboard({ windowDays, limit, phase });
  }

  async processEventForPoints(event) {
    if (!event || !event.params) return;

    // This logic previously lived inside the indexer loop in server.js
    const { type, params } = event;
    
    // Note: This requires amountUsd to be calculated/passed. 
    // In server.js it was calculated before calling persistence.
    // For now, we'll keep the calculation logic here and expect the caller to provide amountUsd if available.
    if (event.amountUsd) {
      if (type === 'LoanCreated' || type === 'PrivateLoanCreated') {
        const points = this.calculateBorrowPoints(event.amountUsd, type === 'PrivateLoanCreated');
        await this.recordActivityPoints(params.borrower, points);
      } else if (type === 'LiquidityAdded') {
        const points = this.calculateLendPoints(event.amountUsd);
        await this.recordActivityPoints(params.contributor, points);
      }
    }
  }
}

module.exports = AirdropService;
