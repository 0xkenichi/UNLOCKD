// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./LoanManagerStorage.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./libraries/LoanLogicLib.sol";

/**
 * @title LoanRepaymentFacet
 * @notice V7.0 Citadel Pivot: Handles Repayments, Liquidations, and OTC Buybacks to bypass EIP-170 limits.
 */
contract LoanRepaymentFacet is LoanManagerStorage {
    using SafeERC20 for IERC20;

    constructor() Ownable(msg.sender) {}

    function repayLoan(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanInactive();
        if (msg.sender != loan.borrower) revert Unauthorized();
        if (loan.principal + loan.interest == 0) revert LoanAlreadyPaid();
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

        (, address token, uint256 unlockTime) = adapter.getDetails(loan.collateralId);

        bool isDefaulted = block.timestamp > loan.unlockTime ||
                           block.timestamp > loan.unlockTime + loan.loanDuration ||
                           block.timestamp > unlockTime;

        if (!isDefaulted) revert("Loan not defaulted");

        uint256 debtUsdc = loan.principal + loan.interest;
        uint256 collateralAvailable = loan.collateralAmount;

        uint256 seizeAmount = LoanLogicLib.calculateSeizeAmount(valuation, token, address(usdc), debtUsdc);

        if (seizeAmount == type(uint256).max && tokenTreasuries[token] != address(0)) {
            // OTC Quarantine execution bypass
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

        // Tier-3 Default Handling: Distressed Debt Bonds
        address vestingContract = adapter.vestingContracts(loan.collateralId);
        uint8 rank = adapter.registry().getRank(vestingContract);
        if (usdcReceived < debtUsdc && rank == 3) {
            uint256 unrecoverableDeficit = debtUsdc - usdcReceived;
            distressedDebtBond.mintBond(msg.sender, loanId, loan.borrower, unrecoverableDeficit);
        } else if (usdcReceived < debtUsdc) {
            loanDeficits[loanId] = debtUsdc - usdcReceived;
        }

        _applyUsdcToLoan(loanId, msg.sender, usdcReceived);
        emit CollateralLiquidated(loanId, token, actualSeize, usdcReceived);

        if (actualSeize < collateralAvailable) {
            uint256 refundAmount = collateralAvailable - actualSeize;
            adapter.releaseTo(loan.collateralId, loan.borrower, refundAmount);
        }

        loan.active = false;
        emit LoanSettled(loanId, true);
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
            insuranceVault.coverDeficit(loanId, address(pool), deficit);
        } else if (deficit > 0) {
            loanDeficits[loanId] = deficit;
        }

        adapter.releaseTo(collateralId, msg.sender, collateralAvailable);
        emit OTCBuybackExecuted(loanId, msg.sender, discountedPayment);
    }

    function _applyUsdcToLoan(uint256 loanId, address payer, uint256 usdcAmount) internal {
        if (usdcAmount == 0) {
            return;
        }

        Loan storage loan = loans[loanId];
        uint256 repayInterest = 0;

        if (usdcAmount <= loan.interest) {
            loan.interest -= usdcAmount;
            repayInterest = usdcAmount;
            address paymentTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
            usdc.safeTransfer(paymentTreasury, usdcAmount);
        } else {
            uint256 remaining = usdcAmount - loan.interest;
            repayInterest = loan.interest;
            loan.interest = 0;
            address paymentTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
            usdc.safeTransfer(paymentTreasury, repayInterest);

            uint256 principalRepayment = remaining > loan.principal ? loan.principal : remaining;
            loan.principal -= principalRepayment;

            if (principalRepayment > 0) {
                (, address token, ) = adapter.getDetails(loan.collateralId);
                if (currentGlobalExposure[token] >= principalRepayment) {
                    currentGlobalExposure[token] -= principalRepayment;
                } else {
                    currentGlobalExposure[token] = 0;
                }
            }

            uint256 poolDebt = pool.totalBorrowed();
            uint256 repayAmountToPool = principalRepayment + repayInterest;
            if (repayAmountToPool > poolDebt) {
                repayAmountToPool = poolDebt;
            }
            if (repayAmountToPool > 0) {
                address vestingContract = adapter.vestingContracts(loan.collateralId);
                uint8 rank = adapter.registry().getRank(vestingContract);
                IsolatedLendingPool isolatedPool = isolatedPools[rank];

                if (address(isolatedPool) != address(0)) {
                    usdc.forceApprove(address(isolatedPool), repayAmountToPool);
                    isolatedPool.repay(principalRepayment, repayInterest);
                } else {
                    usdc.forceApprove(address(pool), repayAmountToPool);
                    pool.repay(principalRepayment, repayInterest);
                }
            }

            uint256 overpaid = remaining - principalRepayment;
            if (overpaid > 0) {
                usdc.safeTransfer(payer, overpaid);
            }
        }

        emit LoanRepaid(loanId, usdcAmount);

        if (loan.principal == 0 && loan.interest == 0) {
            loan.active = false;
            adapter.transferCollateral(loan.collateralId, loan.borrower);
            emit LoanSettled(loanId, false);
        }
    }

    function _applyUsdcToPrivateLoan(uint256 loanId, address payer, uint256 usdcAmount) internal {
        if (usdcAmount == 0) return;

        PrivateLoan storage loan = privateLoans[loanId];
        uint256 repayInterest = 0;

        if (usdcAmount <= loan.interest) {
            loan.interest -= usdcAmount;
            repayInterest = usdcAmount;
            address paymentTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
            usdc.safeTransfer(paymentTreasury, usdcAmount);
        } else {
            uint256 remaining = usdcAmount - loan.interest;
            repayInterest = loan.interest;
            loan.interest = 0;
            address paymentTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
            usdc.safeTransfer(paymentTreasury, repayInterest);

            uint256 principalRepayment = remaining > loan.principal ? loan.principal : remaining;
            loan.principal -= principalRepayment;

            if (principalRepayment > 0) {
                (, address token, ) = adapter.getDetails(loan.collateralId);
                if (currentGlobalExposure[token] >= principalRepayment) {
                    currentGlobalExposure[token] -= principalRepayment;
                } else {
                    currentGlobalExposure[token] = 0;
                }
            }

            uint256 poolDebt = pool.totalBorrowed();
            uint256 repayAmountToPool = principalRepayment + repayInterest;
            if (repayAmountToPool > poolDebt) {
                repayAmountToPool = poolDebt;
            }
            if (repayAmountToPool > 0) {
                address vestingContract = adapter.vestingContracts(loan.collateralId);
                uint8 rank = adapter.registry().getRank(vestingContract);
                IsolatedLendingPool isolatedPool = isolatedPools[rank];

                if (address(isolatedPool) != address(0)) {
                    usdc.forceApprove(address(isolatedPool), repayAmountToPool);
                    isolatedPool.repay(principalRepayment, repayInterest);
                } else {
                    usdc.forceApprove(address(pool), repayAmountToPool);
                    pool.repay(principalRepayment, repayInterest);
                }
            }

            uint256 overpaid = remaining - principalRepayment;
            if (overpaid > 0) {
                usdc.safeTransfer(payer, overpaid);
            }
        }

        emit PrivateLoanRepaid(loanId, usdcAmount);

        if (loan.principal == 0 && loan.interest == 0) {
            loan.active = false;
            adapter.transferCollateral(loan.collateralId, loan.vault);
            emit PrivateLoanSettled(loanId, false);
        }
    }
}
