// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

const persistence = require('../persistence');
const { calculateIdentityCreditScore } = require('../identityCreditScore');

/**
 * LoanExecutionService
 * Off-chain helpers around loan origination on LoanManager:
 *  - prepareLoanExecution: reports the borrower's off-chain VCS score. Credit terms
 *    (LTV, rate) are set on-chain by ValuationEngine and the pool's floating rate,
 *    so nothing is written on-chain here.
 *  - finalizeLoan: verifies a borrow() transaction and syncs the loan to persistence.
 */
class LoanExecutionService {
  constructor(provider, relayerWallet, contracts) {
    this.provider = provider;
    this.relayer = relayerWallet;
    this.contracts = contracts; // { loanManager, valuationEngine, ... }
  }

  async prepareLoanExecution(walletAddress) {
    const profile = await persistence.getIdentityProfileByWallet(walletAddress);
    if (!profile) {
      return { ok: true, scored: false, reason: 'Identity profile not found' };
    }

    const attestations = await persistence.listIdentityAttestations(walletAddress);
    const financials = await persistence.getVcsScore(walletAddress);

    const scoreData = await calculateIdentityCreditScore(walletAddress, {
      gitcoin: attestations.find(a => a.provider === 'gitcoin_passport'),
      financials: financials,
      history: []
    });

    return {
      ok: true,
      scored: true,
      score: scoreData.score,
      tier: scoreData.tier,
      creditBps: scoreData.maxCreditBps
    };
  }

  /**
   * Finalize an originated loan: find LoanOpened in the borrow() receipt,
   * read the loan from LoanManager and sync it to the DB.
   */
  async finalizeLoan(walletAddress, txHash) {
    const receipt = await this.provider.waitForTransaction(txHash);
    if (!receipt || receipt.status === 0) {
      throw new Error('Transaction failed or not found');
    }

    const loanManager = this.contracts.loanManager;
    const loanManagerAddress = String(loanManager.target || loanManager.address).toLowerCase();
    const event = receipt.logs
      .filter(log => String(log.address).toLowerCase() === loanManagerAddress)
      .map(log => {
        try { return loanManager.interface.parseLog(log); } catch (e) { return null; }
      })
      .find(e => e && e.name === 'LoanOpened');

    if (!event) {
      throw new Error('LoanOpened event not found in transaction receipt');
    }

    const { loanId, borrower, token, principal, pv } = event.args;
    if (String(borrower).toLowerCase() !== String(walletAddress).toLowerCase()) {
      throw new Error('Loan borrower does not match wallet');
    }

    const loan = await loanManager.getLoan(loanId);
    const { chainId } = await this.provider.getNetwork();
    const ltvBps = pv > 0n ? Number((principal * 10000n) / pv) : 0;

    await persistence.syncLoanFromEvent({
      loanId: loanId.toString(),
      borrower,
      amount: principal.toString(),
      ltvBps,
      dpvAtOpen: pv.toString(),
      collateralToken: token,
      streamId: loan.streamId.toString(),
      unlockTime: Number(loan.unlockTime),
      txHash,
      blockNumber: receipt.blockNumber,
      chainId: Number(chainId)
    });

    return { ok: true, loanId: loanId.toString(), escrowId: event.args.escrowId.toString() };
  }
}

module.exports = LoanExecutionService;
