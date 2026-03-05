// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title InsuranceVault
 * @dev The absolute last line of defense in the Vestra Protocol.
 * If StagedTrancheAuctions and sweepSecondaryAssets both fail to cover a
 * defaulted borrower's outstanding debt (e.g., flash crash + drained wallet),
 * the InsuranceVault steps in to automatically cover the lender's deficit,
 * guaranteeing the Zero-Deficit promise for institutional liquidity providers.
 */
contract InsuranceVault is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public loanManager;

    event DeficitCovered(uint256 indexed loanId, address indexed lender, uint256 amount);
    event FundsDeposited(address indexed sender, uint256 amount);
    event LoanManagerUpdated(address indexed newLoanManager);

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "Not LoanManager");
        _;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        usdc = IERC20(_usdc);
    }

    function setLoanManager(address _loanManager) external onlyOwner {
        require(_loanManager != address(0), "Invalid address");
        loanManager = _loanManager;
        emit LoanManagerUpdated(_loanManager);
    }

    /**
     * @dev Called by LoanManager when all other recourse mechanisms (Auctions, Sweeps)
     * still leave a lender with a deficit.
     */
    function coverDeficit(uint256 loanId, address lender, uint256 amount) external onlyLoanManager {
        if (amount == 0) return;
        
        uint256 balance = usdc.balanceOf(address(this));
        
        // Protocol takes the hit. If vault is underfunded, it pays out what it can
        // and the DAO/Admin must recapitalize.
        uint256 payout = amount > balance ? balance : amount;
        
        if (payout > 0) {
            usdc.safeTransfer(lender, payout);
            emit DeficitCovered(loanId, lender, payout);
        }
    }

    /**
     * @dev Allow anyone (or protocol fees) to fund the vault.
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Zero amount");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit FundsDeposited(msg.sender, amount);
    }

    /**
     * @dev Emergency admin withdrawal.
     */
    function emergencyWithdraw(uint256 amount) external onlyOwner {
        usdc.safeTransfer(owner(), amount);
    }
}
