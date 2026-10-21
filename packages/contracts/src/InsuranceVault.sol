// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./governance/VestraAccessControl.sol";

/**
 * @title  InsuranceVault
 * @notice First-loss reserve funded by the reserve-factor share of loan interest
 *         (and by anyone who transfers USDC in).
 *
 *         Funds can leave only through `cover`, callable only by the (set-once)
 *         LoanManager to make the lending pool whole after a liquidation
 *         shortfall. There is no governor or guardian withdrawal.
 */
contract InsuranceVault is VestraAccessControl {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public loanManager;
    uint256 public totalCovered;

    event LoanManagerSet(address indexed loanManager);
    event Covered(uint256 requested, uint256 paid);

    constructor(IERC20 _usdc, address _governor) VestraAccessControl(_governor) {
        require(address(_usdc) != address(0), "usdc=0");
        usdc = _usdc;
    }

    function setLoanManager(address _loanManager) external onlyGovernor {
        require(_loanManager != address(0), "loanManager=0");
        require(loanManager == address(0), "already set");
        loanManager = _loanManager;
        emit LoanManagerSet(_loanManager);
    }

    /// @notice Pay up to `amount` to the LoanManager. Returns the amount paid.
    function cover(uint256 amount) external returns (uint256 paid) {
        require(msg.sender == loanManager, "only loan manager");
        uint256 bal = usdc.balanceOf(address(this));
        paid = amount < bal ? amount : bal;
        if (paid > 0) {
            totalCovered += paid;
            usdc.safeTransfer(msg.sender, paid);
        }
        emit Covered(amount, paid);
    }

    function balance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
