// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./LoanManagerStorage.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";


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
        uint256 durationDays,
        string calldata tokenURI
    ) external whenNotPaused nonReentrant {
        _createLoanInternal(CreateLoanParams({
            collateralId: collateralId,
            vestingContract: vestingContract,
            borrowAmount: borrowAmount,
            collateralAmount: 0,
            durationDays: durationDays,
            isPrivate: false,
            tokenURI: tokenURI
        }));
    }

    function createLoanWithCollateralAmount(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount,
        uint256 durationDays,
        string calldata tokenURI
    ) external whenNotPaused nonReentrant {
        _createLoanInternal(CreateLoanParams({
            collateralId: collateralId,
            vestingContract: vestingContract,
            borrowAmount: borrowAmount,
            collateralAmount: collateralAmount,
            durationDays: durationDays,
            isPrivate: false,
            tokenURI: tokenURI
        }));
    }

    function createPrivateLoan(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 durationDays,
        string calldata tokenURI
    ) external whenNotPaused nonReentrant {
        _createLoanInternal(CreateLoanParams({
            collateralId: collateralId,
            vestingContract: vestingContract,
            borrowAmount: borrowAmount,
            collateralAmount: 0,
            durationDays: durationDays,
            isPrivate: true,
            tokenURI: tokenURI
        }));
    }

    function createPrivateLoanWithCollateralAmount(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount,
        uint256 durationDays,
        string calldata tokenURI
    ) external whenNotPaused nonReentrant {
        _createLoanInternal(CreateLoanParams({
            collateralId: collateralId,
            vestingContract: vestingContract,
            borrowAmount: borrowAmount,
            collateralAmount: collateralAmount,
            durationDays: durationDays,
            isPrivate: true,
            tokenURI: tokenURI
        }));
    }

    /**
     * @notice Internal entry point for loan creation.
     */
    struct CreateLoanParams {
        uint256 collateralId;
        address vestingContract;
        uint256 borrowAmount;
        uint256 collateralAmount;
        uint256 durationDays;
        bool isPrivate;
        string tokenURI;
    }

    function _createLoanInternal(CreateLoanParams memory params) internal {
        // M4: Technical Due Diligence Hardening. 
        if (!sanctionsPass[msg.sender]) revert Unauthorized();
        
        if (params.borrowAmount == 0) revert ZeroAmount();
        if (params.durationDays == 0) revert ZeroAmount();

        adapter.escrow(params.collateralId, params.vestingContract, msg.sender);
        (uint256 quantity, address token, uint256 unlockTime) = adapter.getDetails(params.collateralId);
        if (quantity == 0) revert ZeroAmount();
        
        // V5.0 Flash Pump Pre-Crime Defense
        if (valuation.isFlashPumpFrozen(token)) revert CircuitBreakerTripped();
        
        if (block.timestamp + (params.durationDays * 1 days) > unlockTime) revert LoanOutlastsVesting();
        uint256 pledgedQuantity = params.collateralAmount == 0 ? quantity : params.collateralAmount;
        if (pledgedQuantity > quantity) revert ExceedsLTV();

        (uint256 pv, uint256 ltvBps) = valuation.computeDPV(pledgedQuantity, token, unlockTime, params.vestingContract);
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
        
        uint8 rank = valuation.registry().getRank(params.vestingContract);
        
        // V10.0 Sovereign - 25% TWAP Cap
        uint256 twap = valuation.getTWAP(token);
        address feedAddress = valuation.getPriceFeedForToken(token);
        require(feedAddress != address(0), "No oracle for token");
        uint8 twapDecimals = AggregatorV3Interface(feedAddress).decimals();

        // Calculate total USDC value of collateral using the TWAP price
        // Result normalized to 6 decimals (USDC)
        uint256 twapValue = (pledgedQuantity * twap * 1e6) / (10 ** tokenDecimals * 10 ** twapDecimals);
        
        // Capped at 25% of the TWAP value
        uint256 twapMaxBorrow = (twapValue * 2500) / BPS_DENOMINATOR;

        if (maxBorrow > twapMaxBorrow) {
            maxBorrow = twapMaxBorrow;
        }
        
        if (params.borrowAmount > maxBorrow) revert ExceedsLTV();

        // Rate: 8% base + 3% per concurrent slice
        uint256 concurrentSlices = activeLoansCount[msg.sender];
        uint256 interestRateBps = 800 + (concurrentSlices * 300);

        if (autoRepayEligible && autoRepayInterestDiscountBps > 0) {
            if (interestRateBps > autoRepayInterestDiscountBps) {
                interestRateBps = interestRateBps - autoRepayInterestDiscountBps;
            } else {
                interestRateBps = 0;
            }
        }
        
        uint256 interest = (params.borrowAmount * interestRateBps) / BPS_DENOMINATOR;
        uint256 originationFee = (params.borrowAmount * originationFeeBps) / BPS_DENOMINATOR;
        interest += originationFee;
        
        uint256 hedgeAmount = 0;
        if (rank == 3 && address(insuranceVault) != address(0) && autoHedgeBps > 0) {
            hedgeAmount = (params.borrowAmount * autoHedgeBps) / BPS_DENOMINATOR;
        }

        // V6.0 Citadel - Pre-TGE Global Exposure Cap check
        uint256 cap = valuation.preTGECaps(token);
        if (cap > 0 && currentGlobalExposure[token] + params.borrowAmount > cap) {
            revert GlobalExposureCapExceeded();
        }
        currentGlobalExposure[token] += params.borrowAmount;

        // V9.0 Sovereign - On-Chain Invariant Guard
        // Revert instantly if protocol-wide bad debt has breached the ceiling.
        if (totalBadDebt > badDebtCeiling) revert CircuitBreakerTripped();

        uint256 loanId = loanCount;
        if (params.isPrivate) {
            privateLoans[loanId] = PrivateLoan({
                vault: msg.sender,
                token: token,
                principal: params.borrowAmount,
                interest: interest,
                collateralId: params.collateralId,
                collateralAmount: pledgedQuantity,
                loanDuration: params.durationDays * 1 days,
                unlockTime: unlockTime,
                hedgeAmount: hedgeAmount,
                active: true
            });
            emit PrivateLoanCreated(loanId, msg.sender, params.borrowAmount);
        } else {
            loans[loanId] = Loan({
                borrower: msg.sender,
                token: token,
                principal: params.borrowAmount,
                interest: interest,
                collateralId: params.collateralId,
                collateralAmount: pledgedQuantity,
                loanDuration: params.durationDays * 1 days,
                unlockTime: unlockTime,
                hedgeAmount: hedgeAmount,
                active: true
            });
            emit LoanCreated(loanId, msg.sender, params.borrowAmount);

            // V9.0 - Mint On-Chain Proof (NFT)
            if (address(loanNFT) != address(0)) {
                loanNFT.mintProof(
                    msg.sender,
                    loanId,
                    params.borrowAmount,
                    pledgedQuantity,
                    ltvBps,
                    valuation.tokenOmegaBps(token),
                    "ipfs://VESTRA-TERMS-V1", // Real legal hash in prod
                    params.tokenURI
                );
            }
        }
        loanCount += 1;
        // Optimization: O(1) active loan count
        if (params.isPrivate) {
            activeLoansCount[msg.sender] += 1;
        } else {
            activeLoansCount[msg.sender] += 1;
        }

        if (address(isolatedPools[rank]) != address(0)) {
            isolatedPools[rank].lend(msg.sender, params.borrowAmount);
        } else {
            pool.lend(msg.sender, params.borrowAmount);
        }
        
        if (hedgeAmount > 0 && address(insuranceVault) != address(0)) {
            usdc.safeTransfer(address(insuranceVault), hedgeAmount);
            emit AutoHedgeDiverted(loanId, hedgeAmount);
        }
    }
}
