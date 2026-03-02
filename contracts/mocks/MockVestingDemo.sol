// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockLinearVestingWallet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockVestingDemo {
    function setupDemo(
        address beneficiary,
        address token,
        uint256 amountPerWallet
    ) external returns (address wallet1, address wallet2, address wallet3) {
        uint256 nowTime = block.timestamp;
        
        wallet1 = address(new MockLinearVestingWallet(
            beneficiary,
            nowTime + 30 days,
            365 days,
            0,
            token,
            amountPerWallet
        ));

        wallet2 = address(new MockLinearVestingWallet(
            beneficiary,
            nowTime - 180 days,
            365 days,
            0,
            token,
            amountPerWallet
        ));

        wallet3 = address(new MockLinearVestingWallet(
            beneficiary,
            nowTime,
            4 * 365 days,
            365 days,
            token,
            amountPerWallet
        ));

        // Transfer tokens to the newly created wallets
        uint256 totalNeeded = amountPerWallet * 3;
        require(IERC20(token).transferFrom(msg.sender, address(this), totalNeeded), "Transfer failed");
        require(IERC20(token).transfer(wallet1, amountPerWallet), "Transfer wallet1 failed");
        require(IERC20(token).transfer(wallet2, amountPerWallet), "Transfer wallet2 failed");
        require(IERC20(token).transfer(wallet3, amountPerWallet), "Transfer wallet3 failed");
    }
}
