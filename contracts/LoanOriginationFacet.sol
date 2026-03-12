// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./LoanManagerStorage.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";


/**
 * @title LoanOriginationFacet
 * @notice V7.0 Citadel Pivot: Handles all Loan Creation logic to bypass EIP-170 limits.
 */
contract LoanOriginationFacet is LoanManagerStorage {
    using SafeERC20 for IERC20;

    constructor(address _initialGovernor) VestraAccessControl(_initialGovernor) {}

    function createLoan(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 durationDays
    ) external whenNotPaused nonReentrant {
        _createLoanInternal(collateralId, vestingContract, borrowAmount, 0, durationDays, false);
    }

    function createLoanWithCollateralAmount(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount,
        uint256 durationDays
    ) external whenNotPaused nonReentrant {
        _createLoanInternal(collateralId, vestingContract, borrowAmount, collateralAmount, durationDays, false);
    }

    function createPrivateLoan(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 durationDays
    ) external whenNotPaused nonReentrant {
        _createLoanInternal(collateralId, vestingContract, borrowAmount, 0, durationDays, true);
    }

    function createPrivateLoanWithCollateralAmount(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount,
        uint256 durationDays
    ) external whenNotPaused nonReentrant {
        _createLoanInternal(collateralId, vestingContract, borrowAmount, collateralAmount, durationDays, true);
    }

    /**
     * @notice Internal entry point for loan creation.
     */
    function _createLoanInternal(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount,
        uint256 durationDays,
        bool isPrivate
    ) internal {
        // M4: Technical Due Diligence Hardening. 
        if (!sanctionsPass[msg.sender]) revert Unauthorized();
        
        if (borrowAmount == 0) revert ZeroAmount();
        if (durationDays == 0) revert ZeroAmount();

        adapter.escrow(collateralId, vestingContract, msg.sender);
        (uint256 quantity, address token, uint256 unlockTime) = adapter.getDetails(collateralId);
        if (quantity == 0) revert ZeroAmount();
        
        // V5.0 Flash Pump Pre-Crime Defense
        if (valuation.isFlashPumpFrozen(token)) revert CircuitBreakerTripped();
        
        if (block.timestamp + (durationDays * 1 days) > unlockTime) revert LoanOutlastsVesting();
        uint256 pledgedQuantity = collateralAmount == 0 ? quantity : collateralAmount;
        if (pledgedQuantity > quantity) revert ExceedsLTV();

        (uint256 pv, uint256 ltvBps) = valuation.computeDPV(pledgedQuantity, token, unlockTime, vestingContract);
        if (identityLinked[msg.sender] && identityBoostBps > 0) {
            ltvBps = ltvBps + identityBoostBps;
            if (ltvBps > BPS_DENOMINATOR) {
                ltvBps = BPS_DENOMINATOR;
            }
        }
        
        // Check permissions instead of _hasAutoRepayPermissions internally since it's just router approval
        bool autoRepayEligible = autoRepayOptIn[msg.sender]; // Router checks the token approvals.
        if (autoRepayEligible && autoRepayLtvBoostBps > 0) {
            ltvBps = ltvBps + autoRepayLtvBoostBps;
            if (ltvBps > BPS_DENOMINATOR) {
                ltvBps = BPS_DENOMINATOR;
            }
        }
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint256 normalizedPv = pv;
        if (tokenDecimals > 6) {
            normalizedPv = pv / (10 ** (tokenDecimals - 6));
        } else if (tokenDecimals < 6) {
            normalizedPv = pv * (10 ** (6 - tokenDecimals));
        }
        uint256 maxBorrow = (normalizedPv * ltvBps) / BPS_DENOMINATOR;
        
        
        if (borrowAmount > maxBorrow) revert ExceedsLTV();

        uint8 rank = adapter.registry().getRank(vestingContract);
        
        // V6.0 Citadel - Route to Isolated Tiered Pools
        IsolatedLendingPool isolatedPool = isolatedPools[rank];
        uint256 interestRateBps;
        
        if (address(isolatedPool) != address(0)) {
            interestRateBps = isolatedPool.getInterestRateBps(0);
        } else {
            // Fall back to MeTTa-driven systemic rate
            interestRateBps = dynamicBorrowRateBps;
        }

        if (autoRepayEligible && autoRepayInterestDiscountBps > 0) {
            if (interestRateBps > autoRepayInterestDiscountBps) {
                interestRateBps = interestRateBps - autoRepayInterestDiscountBps;
            } else {
                interestRateBps = 0;
            }
        }
        
        uint256 interest = (borrowAmount * interestRateBps) / BPS_DENOMINATOR;
        uint256 originationFee = (borrowAmount * originationFeeBps) / BPS_DENOMINATOR;
        interest += originationFee;
        
        uint256 hedgeAmount = 0;
        if (rank == 3 && address(insuranceVault) != address(0) && autoHedgeBps > 0) {
            hedgeAmount = (borrowAmount * autoHedgeBps) / BPS_DENOMINATOR;
        }

        // V6.0 Citadel - Pre-TGE Global Exposure Cap check
        uint256 cap = valuation.preTGECaps(token);
        if (cap > 0 && currentGlobalExposure[token] + borrowAmount > cap) {
            revert GlobalExposureCapExceeded();
        }
        currentGlobalExposure[token] += borrowAmount;

        // V9.0 Sovereign - On-Chain Invariant Guard
        // Revert instantly if protocol-wide bad debt has breached the ceiling.
        if (totalBadDebt > badDebtCeiling) revert CircuitBreakerTripped();

        uint256 loanId = loanCount;
        if (isPrivate) {
            privateLoans[loanId] = PrivateLoan({
                vault: msg.sender,
                principal: borrowAmount,
                interest: interest,
                collateralId: collateralId,
                collateralAmount: pledgedQuantity,
                loanDuration: durationDays * 1 days,
                unlockTime: unlockTime,
                hedgeAmount: hedgeAmount,
                active: true
            });
            emit PrivateLoanCreated(loanId, msg.sender, borrowAmount);
        } else {
            loans[loanId] = Loan({
                borrower: msg.sender,
                principal: borrowAmount,
                interest: interest,
                collateralId: collateralId,
                collateralAmount: pledgedQuantity,
                loanDuration: durationDays * 1 days,
                unlockTime: unlockTime,
                hedgeAmount: hedgeAmount,
                active: true
            });
            emit LoanCreated(loanId, msg.sender, borrowAmount);

            // V9.0 - Mint On-Chain Proof (NFT)
            // if (address(loanNFT) != address(0)) {
            //     loanNFT.mintProof(
            //         msg.sender,
            //         loanId,
            //         borrowAmount,
            //         pledgedQuantity,
            //         ltvBps,
            //         valuation.tokenOmegaBps(token),
            //         "ipfs://VESTRA-TERMS-V1", // Real legal hash in prod
            //         "https://vestra.finance/proofs/" // Dynamic URI
            //     );
            // }
        }
        loanCount += 1;

        if (address(isolatedPool) != address(0)) {
            isolatedPool.lend(msg.sender, borrowAmount);
        } else {
            pool.lend(msg.sender, borrowAmount);
        }
        
        if (hedgeAmount > 0 && address(insuranceVault) != address(0)) {
            usdc.safeTransfer(address(insuranceVault), hedgeAmount);
            emit AutoHedgeDiverted(loanId, hedgeAmount);
        }
    }
}
