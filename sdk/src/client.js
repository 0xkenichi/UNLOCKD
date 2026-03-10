// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

const { ethers } = require('ethers');
const { CONTRACT_ABIS, CONSTANTS } = require('./constants');

class VestraClient {
    /**
     * Initialize the Vestra SDK Client
     * @param {Object} config - Configuration object
     * @param {ethers.Signer | ethers.Provider} config.providerOrSigner - Ethers signer or provider
     * @param {string} config.lendingPoolAddress - Address of the LendingPool contract
     * @param {string} config.loanManagerAddress - Address of the LoanManager contract
     * @param {string} [config.builderFeeAddress] - Address that should receive builder referral fees setup via the SDK
     * @param {number} [config.builderFeeBps] - Builder fee in basis points (default 10)
     */
    constructor({ providerOrSigner, lendingPoolAddress, loanManagerAddress, builderFeeAddress, builderFeeBps }) {
        if (!providerOrSigner || !lendingPoolAddress || !loanManagerAddress) {
            throw new Error("Missing required configuration for VestraClient");
        }

        this.signerOrProvider = providerOrSigner;
        this.lendingPool = new ethers.Contract(lendingPoolAddress, CONTRACT_ABIS.LENDING_POOL, providerOrSigner);
        this.loanManager = new ethers.Contract(loanManagerAddress, CONTRACT_ABIS.LOAN_MANAGER, providerOrSigner);

        // Fee configurations for external builders
        this.builderFeeAddress = builderFeeAddress || ethers.ZeroAddress;
        this.builderFeeBps = builderFeeBps || CONSTANTS.DEFAULT_BUILDER_FEE_BPS;
    }

    /**
     * Supply assets to the Lending Pool.
     * Note: The protocol implicitly captures yield from active loans over time.
     * @param {string} tokenAddress - Address of the ERC20 token to supply
     * @param {string | ethers.BigNumberish} amount - Amount to supply
     * @returns {Promise<ethers.ContractTransactionResponse>}
     */
    async supply(tokenAddress, amount) {
        return this.lendingPool.deposit(tokenAddress, amount);
    }

    /**
     * Create a new loan backed by collateral.
     * @param {string | ethers.BigNumberish} collateralId - ID of the collateral NFT / Vesting stream
     * @param {string | ethers.BigNumberish} amount - Loan amount requested
     * @param {string | ethers.BigNumberish} duration - Duration of the loan in seconds
     * @returns {Promise<ethers.ContractTransactionResponse>}
     */
    async createLoan(collateralId, amount, duration) {
        // If the builder configured a fee address, they could capture a routing fee here
        // Note: The actual on-chain routing fee logic must be supported by the Vestra LoanManager 
        // or wrapped in an external router. For the SDK, we directly forward to the LoanManager.
        return this.loanManager.createLoan(collateralId, amount, duration);
    }

    /**
     * Repay an active loan.
     * @param {string | ethers.BigNumberish} loanId - Internal Loan ID
     * @returns {Promise<ethers.ContractTransactionResponse>}
     */
    async repayLoan(loanId) {
        return this.loanManager.repayLoan(loanId);
    }

    /**
     * Fetch active loan data
     * @param {string | ethers.BigNumberish} loanId
     * @returns {Promise<Object>}
     */
    async getLoan(loanId) {
        const data = await this.loanManager.loans(loanId);
        return {
            borrower: data.borrower,
            principal: data.principal,
            interest: data.interest,
            collateralId: data.collateralId,
            collateralAmount: data.collateralAmount,
            unlockTime: data.unlockTime,
            active: data.active
        };
    }

    /**
     * Returns the total number of loans created.
     * @returns {Promise<number>}
     */
    async getLoanCount() {
        const count = await this.loanManager.loanCount();
        return Number(count);
    }
}

module.exports = { VestraClient };
