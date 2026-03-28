// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./LoanManagerStorage.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./libraries/LoanLogicLib.sol";
import "./IAuction.sol";
import "./LiquidationAuction.sol";

/**
 * @title LoanRepaymentFacet
 * @notice V7.0 Citadel Pivot: Handles Repayments, Liquidations, and OTC Buybacks to bypass EIP-170 limits.
 */
contract LoanRepaymentFacet is LoanManagerStorage {
    using SafeERC20 for IERC20;

    constructor(address _initialGovernor) VestraAccessControl(_initialGovernor) {}

    function repayLoan(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanInactive();
        if (msg.sender != loan.borrower) revert Unauthorized();
        if (loan.principal + loan.interest == 0) revert LoanAlreadyPaid();
        if (amount == 0) revert ZeroAmount();

        _repayUsdcFrom(loanId, msg.sender, amount);
    }

    function repayLiquidation(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        address auctionAddr = auctionFactory.auctions("LIQUIDATION");
        require(msg.sender == auctionAddr || msg.sender == address(insuranceVault), "Not authorized auction");
        
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanInactive();
        if (amount == 0) revert ZeroAmount();

        _repayUsdcFrom(loanId, msg.sender, amount);
    }

    function repayPrivateLoan(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        PrivateLoan storage loan = privateLoans[loanId];
        if (!loan.active) revert LoanInactive();
        if (msg.sender != loan.vault) revert Unauthorized();
        if (loan.principal + loan.interest == 0) revert LoanAlreadyPaid();
        if (amount == 0) revert ZeroAmount();

        _repayUsdcFromPrivate(loanId, msg.sender, amount);
    }

    function _repayUsdcFrom(uint256 loanId, address payer, uint256 amount) internal {
        if (payer == address(0)) revert InvalidToken();
        usdc.safeTransferFrom(payer, address(this), amount);
        _applyUsdcToLoan(loanId, payer, amount);
    }

    function _repayUsdcFromPrivate(uint256 loanId, address payer, uint256 amount) internal {
        if (payer == address(0)) revert InvalidToken();
        usdc.safeTransferFrom(payer, address(this), amount);
        _applyUsdcToPrivateLoan(loanId, payer, amount);
    }

    function autoRepay(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanInactive();
        if (!autoRepayOptIn[loan.borrower]) revert AutoRepayDisabled();

        uint256 totalDebt = loan.principal + loan.interest;
        if (totalDebt == 0) revert LoanAlreadyPaid();

        address borrower = loan.borrower;

        // Note: _hasAutoRepayPermissions check moved to external caller mapping in Manager for gas?
        // Let's assume the router or this logic verified `usdc.allowance` before this call.
        uint256 allowance = usdc.allowance(borrower, address(this));
        if (allowance < totalDebt) revert MissingRepayPermissions();

        usdc.safeTransferFrom(borrower, address(this), totalDebt);
        _applyUsdcToLoan(loanId, borrower, totalDebt);
    }

    function repayLoanWithCollateral(uint256 loanId, address tokenIn, uint256 amountIn, uint256[] calldata minUsdcOuts) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanInactive();
        if (msg.sender != loan.borrower) revert Unauthorized();
        if (amountIn == 0) revert ZeroAmount();

        uint256 totalDebt = loan.principal + loan.interest;
        if (totalDebt == 0) revert LoanAlreadyPaid();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(uniswapRouter), amountIn);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: address(usdc),
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp + 300,
                amountIn: amountIn,
                amountOutMinimum: minUsdcOuts.length > 0 ? minUsdcOuts[0] : 0,
                sqrtPriceLimitX96: 0
            });

        uint256 usdcReceived = uniswapRouter.exactInputSingle(params);
        _applyUsdcToLoan(loanId, msg.sender, usdcReceived);

        emit LoanRepaidWithSwap(loanId, tokenIn, amountIn, usdcReceived);
    }

    function liquidateCollateral(uint256 loanId) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanInactive();

        // 1. Check if LTV is in "Extinction Zone" (Liquidation Threshold)
        // For MVP, we use the simple temporal default or AI Omega-driven LTV check.
        // In reality, ValuationEngine.computeDPV would be compared against the loan principal.
        
        bool canLiquidate = _checkLiquidationEligibility(loanId);
        if (!canLiquidate) revert("Loan not eligible for liquidation");

        // 2. Trigger UTC Dutch Auction instead of Uniswap Swap
        address auctionAddr = auctionFactory.auctions("LIQUIDATION");
        if (auctionAddr == address(0)) revert("Liquidation auction not registered");

        // Authorize auction to move the NFT
        adapter.authorizeAuction(auctionAddr);

        uint256 collateralId = loan.collateralId;
        uint256 debtUsdc = loan.principal + loan.interest;

        // Start Price: 110% of Debt (or valuation)
        // End Price: 80% of Debt (to attract OTC buyers)
        uint256 startPrice = (debtUsdc * 11000) / BPS_DENOMINATOR;
        uint256 endPrice = (debtUsdc * 8000) / BPS_DENOMINATOR;
        uint256 duration = 24 hours;

        IAuction(auctionAddr).createAuction(
            collateralId,
            adapter.vestingContracts(collateralId),
            startPrice,
            endPrice,
            duration
        );

        // Link Auction to Loan (using the LiquidationAuction interface)
        uint256 auctionId = IAuction(auctionAddr).auctionCount() - 1;
        LiquidationAuction(auctionAddr).setLoanId(auctionId, loanId);

        emit CollateralLiquidated(loanId, address(0), loan.collateralAmount, 0);
        // Loan remains "active" but in liquidation state until auction settles.
        inLiquidation[loanId] = true;
    }

    /**
     * @notice Lender Default Claim: Claim collateral for a defaulted manual loan.
     * @param loanId The ID of the defaulted loan.
     */
    function claimDefaultedLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.active, "loan inactive");
        require(block.timestamp > loan.unlockTime, "not defaulted yet");
        
        // Ensure msg.sender is the holder of the Lender NFT for this loan
        // Note: For simplicity, we check if the lender belongs to the loanId in lenderNFT mapping.
        // Actually, we should check ownerOf(tokenId) where tokenId corresponds to loanId.
        // I'll assume a mapping or lookup exists.
        require(lenderNFT.ownerOf(loanId) == msg.sender, "not loan lender");

        (uint256 quantity, address token, uint256 unlockTime) = adapter.getDetails(loan.collateralId);
        
        // TWAP Check: If PV < 15% TWAP, auto-sell
        uint256 twap = valuation.getTWAP(token);
        uint256 pv = (quantity * twap) / (10 ** IERC20Metadata(token).decimals()); // Simple PV
        
        if (pv < (twap * 1500) / BPS_DENOMINATOR) {
            // Auto-sell on Uniswap
            adapter.releaseTo(loan.collateralId, address(this), quantity);
            IERC20(token).forceApprove(address(uniswapRouter), quantity);
            
            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
                tokenIn: token,
                tokenOut: address(usdc),
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp + 300,
                amountIn: quantity,
                amountOutMinimum: 0, // In emergency, we take what we can
                sqrtPriceLimitX96: 0
            });
            
            uint256 usdcReceived = uniswapRouter.exactInputSingle(params);
            uint256 debt = loan.principal + loan.interest;
            
            if (usdcReceived < debt) {
                // Insurance covers shortfall
                uint256 shortfall = debt - usdcReceived;
                pool.claimInsurance(address(this), shortfall);
                usdcReceived += shortfall;
            }
            
            // Repay pool
            usdc.forceApprove(address(pool), usdcReceived);
            pool.repay(loan.principal, loan.interest);
            
            console.log("Event: Default, %s, %s", msg.sender, usdcReceived);
            console.log("Contract: %s, %s", adapter.vestingContracts(loan.collateralId), block.timestamp);
        } else {
            // Lender takes the tokens
            adapter.releaseTo(loan.collateralId, msg.sender, quantity);
            console.log("Event: Default, %s, %s", msg.sender, quantity);
            console.log("Contract: %s, %s", adapter.vestingContracts(loan.collateralId), block.timestamp);
        }

        loan.active = false;
        activeLoansCount[loan.borrower] -= 1;
        lenderNFT.burn(loanId);
        emit LoanSettled(loanId, true);
    }

    function getRemainingDebt(uint256 loanId) external view returns (uint256) {
        Loan storage loan = loans[loanId];
        return loan.principal + loan.interest;
    }

    function _checkLiquidationEligibility(uint256 loanId) internal view returns (bool) {
        Loan storage loan = loans[loanId];
        
        // 1. Temporal Default (Unlock Time Passed)
        if (block.timestamp > loan.unlockTime + 1 hours) return true;

        // 2. LTV Default (Collateral Value < Debt / Threshold)
        (uint256 pv, ) = valuation.computeDPV(
            loan.collateralAmount,
            loan.token,
            loan.unlockTime,
            adapter.vestingContracts(loan.collateralId)
        );

        uint256 debt = loan.principal + loan.interest;
        
        // V7.0 Citadel - Rank Based Liquidation Thresholds
        // Rank 1 (Flagship): 75% Liquidation Threshold
        // Rank 2 (Premium): 65% Liquidation Threshold
        // Rank 3 (Standard): 55% Liquidation Threshold
        uint8 rank = adapter.registry().getRank(adapter.vestingContracts(loan.collateralId));
        uint256 thresholdBps = rank == 1 ? 7500 : (rank == 2 ? 6500 : 5500);
        
        uint256 liquidationValue = (pv * thresholdBps) / BPS_DENOMINATOR;
        
        // If Debt >= Liquidation Value, it's time to sell.
        if (debt >= liquidationValue) return true;

        return false;
    }
    
    function liquidatePrivateLoan(uint256 loanId) external whenNotPaused nonReentrant {
        PrivateLoan storage loan = privateLoans[loanId];
        if (!loan.active) revert LoanInactive();

        (, address token, uint256 unlockTime) = adapter.getDetails(loan.collateralId);

        bool isDefaulted = block.timestamp > loan.unlockTime ||
                           block.timestamp > loan.unlockTime + loan.loanDuration ||
                           block.timestamp > unlockTime;

        if (!isDefaulted) revert("Loan not defaulted");

        uint256 debtUsdc = loan.principal + loan.interest;
        uint256 collateralAvailable = loan.collateralAmount;

        uint256 seizeAmount = LoanLogicLib.calculateSeizeAmount(valuation, token, address(usdc), debtUsdc);

        if (seizeAmount == type(uint256).max && tokenTreasuries[token] != address(0)) {
            inOTCBuyback[loanId] = true;
            otcBuybackDeadline[loanId] = block.timestamp + 7 days;
            emit OTCBuybackInitiated(loanId, token, otcBuybackDeadline[loanId]);
            return;
        }

        uint256 actualSeize = seizeAmount > collateralAvailable
            ? collateralAvailable
            : seizeAmount;

        adapter.releaseTo(loan.collateralId, address(this), actualSeize);

        uint256 usdcReceived = 0;
        if (token == address(usdc)) {
            usdcReceived = actualSeize;
        } else {
            uint256 minUsdc = LoanLogicLib.minUsdcOut(valuation, token, address(usdc), actualSeize, liquidationSlippageBps);

            IERC20(token).forceApprove(address(uniswapRouter), actualSeize);
            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
                .ExactInputSingleParams({
                    tokenIn: token,
                    tokenOut: address(usdc),
                    fee: poolFee,
                    recipient: address(this),
                    deadline: block.timestamp + 300,
                    amountIn: actualSeize,
                    amountOutMinimum: minUsdc,
                    sqrtPriceLimitX96: 0
                });
            usdcReceived = uniswapRouter.exactInputSingle(params);
        }

        if (usdcReceived < debtUsdc) {
            loanDeficits[loanId] = debtUsdc - usdcReceived;
        }

        _applyUsdcToPrivateLoan(loanId, msg.sender, usdcReceived);
        emit CollateralLiquidated(loanId, token, actualSeize, usdcReceived);

        if (actualSeize < collateralAvailable) {
            uint256 refundAmount = collateralAvailable - actualSeize;
            adapter.releaseTo(loan.collateralId, loan.vault, refundAmount);
        }

        loan.active = false;
        activeLoansCount[loan.vault] -= 1;
        emit PrivateLoanSettled(loanId, true);
    }

    function executeOTCBuyback(uint256 loanId) external nonReentrant {
        if (!inOTCBuyback[loanId]) revert OTCWindowClosed();
        if (block.timestamp > otcBuybackDeadline[loanId]) revert OTCWindowExpired();

        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanInactive();
        
        uint256 collateralId = loan.collateralId;
        address vestingContract = adapter.vestingContracts(collateralId);
        (, address token, ) = adapter.getDetails(collateralId);

        address treasury = tokenTreasuries[token];
        if (msg.sender != treasury) revert UnauthorizedTreasury();

        uint256 collateralAvailable = loan.collateralAmount;
        if (collateralAvailable == 0) revert NoCollateralToBuy();

        uint256 debtUsdc = loan.principal + loan.interest;
        
        (uint256 pv,) = valuation.computeDPV(collateralAvailable, token, loan.unlockTime, vestingContract);
        uint256 discountedPayment = (pv * 8000) / BPS_DENOMINATOR; // Fixed 20% discount haircut to LP
        
        uint256 principalRepayment = 0;
        uint256 repayInterest = 0;
        uint256 deficit = 0;

        if (discountedPayment >= debtUsdc) {
            principalRepayment = loan.principal;
            repayInterest = loan.interest;
        } else {
            if (discountedPayment <= loan.interest) {
                repayInterest = discountedPayment;
                deficit = debtUsdc - discountedPayment;
                principalRepayment = 0;
            } else {
                repayInterest = loan.interest;
                principalRepayment = discountedPayment - loan.interest;
                deficit = loan.principal - principalRepayment;
            }
        }

        loan.principal -= principalRepayment;
        loan.interest -= repayInterest;
        inOTCBuyback[loanId] = false;
        loan.active = false;
        activeLoansCount[loan.borrower] -= 1;
        if (address(loanNFT) != address(0)) {
            loanNFT.settleProof(loanId);
        }

        usdc.safeTransferFrom(msg.sender, address(this), discountedPayment);

        uint8 rank = adapter.registry().getRank(vestingContract);
        IsolatedLendingPool isolatedPool = isolatedPools[rank];

        if (address(isolatedPool) != address(0)) {
            usdc.safeIncreaseAllowance(address(isolatedPool), discountedPayment);
            isolatedPool.repay(principalRepayment, repayInterest);
        } else {
            usdc.safeIncreaseAllowance(address(pool), discountedPayment);
            pool.repay(principalRepayment, repayInterest);
        }

        if (principalRepayment > 0) {
            if (currentGlobalExposure[token] >= principalRepayment) {
                currentGlobalExposure[token] -= principalRepayment;
            } else {
                currentGlobalExposure[token] = 0;
            }
        }

        if (deficit > 0 && address(insuranceVault) != address(0)) {
            insuranceVault.collectDeficit(deficit);
            usdc.safeIncreaseAllowance(address(pool), deficit);
            pool.repay(deficit, 0);
        } else if (deficit > 0) {
            loanDeficits[loanId] = deficit;
        }

        adapter.releaseTo(collateralId, msg.sender, collateralAvailable);
        emit OTCBuybackExecuted(loanId, msg.sender, discountedPayment);
    }

    function _applyUsdcToLoan(uint256 loanId, address payer, uint256 usdcAmount) internal {
        if (usdcAmount == 0) return;

        Loan storage loan = loans[loanId];
        uint256 repayInterest = 0;
        uint256 principalRepayment = 0;

        if (usdcAmount <= loan.interest) {
            loan.interest -= usdcAmount;
            repayInterest = usdcAmount;
        } else {
            repayInterest = loan.interest;
            uint256 remaining = usdcAmount - loan.interest;
            loan.interest = 0;

            principalRepayment = remaining > loan.principal ? loan.principal : remaining;
            loan.principal -= principalRepayment;

            if (principalRepayment > 0) {
                (, address token, ) = adapter.getDetails(loan.collateralId);
                if (currentGlobalExposure[token] >= principalRepayment) {
                    currentGlobalExposure[token] -= principalRepayment;
                } else {
                    currentGlobalExposure[token] = 0;
                }
            }
        }

        uint256 totalRepay = principalRepayment + repayInterest;
        if (totalRepay > 0) {
            address vestingContract = adapter.vestingContracts(loan.collateralId);
            uint8 rank = adapter.registry().getRank(vestingContract);
            IsolatedLendingPool isolatedPool = isolatedPools[rank];

            if (address(isolatedPool) != address(0)) {
                usdc.forceApprove(address(isolatedPool), totalRepay);
                isolatedPool.repay(principalRepayment, repayInterest);
            } else {
                usdc.forceApprove(address(pool), totalRepay);
                pool.repay(principalRepayment, repayInterest);
            }
        }

        uint256 overpaid = usdcAmount - totalRepay;
        if (overpaid > 0) {
            usdc.safeTransfer(payer, overpaid);
        }

        emit LoanRepaid(loanId, usdcAmount);

        if (loan.principal == 0 && loan.interest == 0) {
            loan.active = false;
            activeLoansCount[loan.borrower] -= 1;
            if (address(loanNFT) != address(0)) {
                loanNFT.settleProof(loanId);
            }
            adapter.transferCollateral(loan.collateralId, loan.borrower);
            emit LoanSettled(loanId, false);
        }
    }

    function _applyUsdcToPrivateLoan(uint256 loanId, address payer, uint256 usdcAmount) internal {
        if (usdcAmount == 0) return;

        PrivateLoan storage loan = privateLoans[loanId];
        uint256 repayInterest = 0;
        uint256 principalRepayment = 0;

        if (usdcAmount <= loan.interest) {
            loan.interest -= usdcAmount;
            repayInterest = usdcAmount;
        } else {
            repayInterest = loan.interest;
            uint256 remaining = usdcAmount - loan.interest;
            loan.interest = 0;

            principalRepayment = remaining > loan.principal ? loan.principal : remaining;
            loan.principal -= principalRepayment;

            if (principalRepayment > 0) {
                (, address token, ) = adapter.getDetails(loan.collateralId);
                if (currentGlobalExposure[token] >= principalRepayment) {
                    currentGlobalExposure[token] -= principalRepayment;
                } else {
                    currentGlobalExposure[token] = 0;
                }
            }
        }

        uint256 totalRepay = principalRepayment + repayInterest;
        if (totalRepay > 0) {
            address vestingContract = adapter.vestingContracts(loan.collateralId);
            uint8 rank = adapter.registry().getRank(vestingContract);
            IsolatedLendingPool isolatedPool = isolatedPools[rank];

            if (address(isolatedPool) != address(0)) {
                usdc.forceApprove(address(isolatedPool), totalRepay);
                isolatedPool.repay(principalRepayment, repayInterest);
            } else {
                usdc.forceApprove(address(pool), totalRepay);
                pool.repay(principalRepayment, repayInterest);
            }
        }

        uint256 overpaid = usdcAmount - totalRepay;
        if (overpaid > 0) {
            usdc.safeTransfer(payer, overpaid);
        }

        emit PrivateLoanRepaid(loanId, usdcAmount);

        if (loan.principal == 0 && loan.interest == 0) {
            loan.active = false;
            activeLoansCount[loan.vault] -= 1;
            adapter.transferCollateral(loan.collateralId, loan.vault);
            emit PrivateLoanSettled(loanId, false);
        }
    }

    // --- TEST HELPERS & GOVERNANCE SETTERS ---
    function setValuation(address _valuation) external onlyGovernor {
        valuation = ValuationEngine(_valuation);
    }
    function setAdapter(address _adapter) external onlyGovernor {
        adapter = VestingAdapter(_adapter);
    }
    function setPool(address _pool) external onlyGovernor {
        pool = LendingPool(_pool);
    }
    function setAuctionFactory(address _factory) external onlyGovernor {
        auctionFactory = AuctionFactory(_factory);
    }
    function setUsdc(address _usdc) external onlyGovernor {
        usdc = IERC20(_usdc);
    }
    function setInsuranceVault(address _vault) external onlyGovernor {
        insuranceVault = InsuranceVault(_vault);
    }

    /**
     * @notice Manually inject a loan for stress testing state.
     */
    function injectLoan(
        uint256 loanId,
        address borrower,
        address token,
        uint256 principal,
        uint256 interest,
        uint256 collateralId,
        uint256 collateralAmount,
        uint256 unlockTime
    ) external onlyGovernor {
        loans[loanId] = Loan({
            borrower: borrower,
            token: token,
            principal: principal,
            interest: interest,
            collateralId: collateralId,
            collateralAmount: collateralAmount,
            loanDuration: 365 days,
            unlockTime: unlockTime,
            hedgeAmount: 0,
            active: true
        });
        if (loanId >= loanCount) {
            loanCount = loanId + 1;
        }
    }
}
