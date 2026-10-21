// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./governance/VestraAccessControl.sol";

interface ILendingPool {
    function repay(uint256 principal, uint256 interest) external;
}

/**
 * @title InsuranceVault
 * @notice Protocol Insurance Fund that covers bad debt during insolvency events.
 */
contract InsuranceVault is VestraAccessControl, IERC721Receiver {
    using SafeERC20 for IERC20;

    IERC20 public usdc;
    uint256 public totalCovered;

    event DeficitCovered(uint256 indexed loanId, address indexed pool, uint256 amount);
    event FundsWithdrawn(address indexed to, uint256 amount);

    constructor(address _usdc, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_usdc != address(0), "usdc=0");
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Covers a shortfall by transferring funds to the caller (Auction or Manager).
     */
    function collectDeficit(uint256 amount) external onlyGuardian {
        require(amount > 0, "amount=0");
        require(usdc.balanceOf(address(this)) >= amount, "insufficient insurance funds");

        totalCovered += amount;
        usdc.safeTransfer(msg.sender, amount);
    }

    function withdraw(address to, uint256 amount) external onlyGovernor {
        usdc.safeTransfer(to, amount);
        emit FundsWithdrawn(to, amount);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
