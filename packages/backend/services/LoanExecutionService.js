// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

const { ethers } = require('ethers');
const persistence = require('../persistence');
const { calculateIdentityCreditScore } = require('../identityCreditScore');

/**
 * LoanExecutionService
 * Handles on-chain actions required for loan origination (e.g., setting VCS tier)
 * and monitors the lifecycle of a loan once originated on-chain.
 */
class LoanExecutionService {
  constructor(provider, relayerWallet, contracts) {
    this.provider = provider;
    this.relayer = relayerWallet;
    this.contracts = contracts; // { loanManager, valuationEngine, ... }
  }

  /**
   * Pre-origination: Set the user's VCS tier on-chain if needed.
   * This allows the user to get the correct interest rate and credit limit.
   */
  async prepareLoanExecution(walletAddress) {
    console.log(`[LoanExecutionService] Preparing execution for ${walletAddress}`);

    // 1. Fetch latest VCS data
    const profile = await persistence.getIdentityProfileByWallet(walletAddress);
    if (!profile) {
      throw new Error('Identity profile not found. Please refresh VCS score.');
    }

    // 2. Fetch specific VCS components for raw score
    const attestations = await persistence.listIdentityAttestations(walletAddress);
    const financials = await persistence.getVcsScore(walletAddress); // This has the financial metrics

    const scoreData = await calculateIdentityCreditScore(walletAddress, {
      gitcoin: attestations.find(a => a.provider === 'gitcoin_passport'),
      financials: financials,
      history: [] // internal history fetch if needed
    });

    const tierInt = scoreData.tier; // 0: STANDARD, 1: PREMIUM, 2: TITAN
    const creditBps = scoreData.maxCreditBps;

    console.log(`[LoanExecutionService] VCS Score: ${scoreData.score} | Tier: ${tierInt} | Credit: ${creditBps} bps`);

    // 3. Check current tier on-chain
    const currentTier = await this.contracts.loanManager.vcsTier(walletAddress);
    const currentCredit = await this.contracts.loanManager.maxCreditBps(walletAddress);

    if (Number(currentTier) !== tierInt || Number(currentCredit) !== creditBps) {
      console.log(`[LoanExecutionService] Updating on-chain tier for ${walletAddress} to ${tierInt}...`);
      
      const tx = await this.contracts.loanManager.setVcsTier(walletAddress, tierInt, creditBps);
      const receipt = await tx.wait(1);
      
      console.log(`[LoanExecutionService] Tier update confirmed: ${receipt.hash}`);
      return { ok: true, txHash: receipt.hash, tier: tierInt, creditBps };
    }

    console.log(`[LoanExecutionService] On-chain tier already correct for ${walletAddress}.`);
    return { ok: true, alreadySet: true, tier: tierInt, creditBps };
  }

  /**
   * Finalize an originated loan: verify on-chain status and sync to DB.
   */
  async finalizeLoan(walletAddress, txHash) {
    console.log(`[LoanExecutionService] Finalizing loan for ${walletAddress} via ${txHash}`);
    
    // Wait for transaction
    const receipt = await this.provider.waitForTransaction(txHash);
    if (!receipt || receipt.status === 0) {
      throw new Error('Transaction failed or not found');
    }

    // Look for LoanOriginated event in receipt
    // In production, the IndexerService handles this asynchronously,
    // but we can do a proactive sync here for better UX.
    const event = receipt.logs.map(log => {
        try { return this.contracts.loanManager.interface.parseLog(log); } catch(e) { return null; }
    }).find(e => e && e.name === 'LoanOriginated');

    if (!event) {
        throw new Error('LoanOriginated event not found in transaction receipt');
    }

    const { loanId, borrower, streamId, borrowedUsdc, dpvAtOrigination, nftTokenId } = event.args;

    // Sync to persistence
    await persistence.syncLoanFromEvent({
      loanId: loanId.toString(),
      borrower: borrower,
      amount: borrowedUsdc.toString(),
      dpv: dpvAtOrigination.toString(),
      nftTokenId: nftTokenId.toString(),
      txHash: txHash,
      timestamp: Math.floor(Date.now() / 1000)
    });

    return { ok: true, loanId: loanId.toString(), nftTokenId: nftTokenId.toString() };
  }
}

module.exports = LoanExecutionService;
