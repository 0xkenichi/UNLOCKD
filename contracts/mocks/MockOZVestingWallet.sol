// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockOZVestingWallet {
    address public beneficiary;
    uint256 public start;
    uint256 public duration;
    address public token;
    uint256 public totalAllocation;

    mapping(address => uint256) public released;

    constructor(
        address _beneficiary,
        uint256 _start,
        uint256 _duration,
        address _token,
        uint256 _totalAllocation
    ) {
        require(_beneficiary != address(0), "beneficiary=0");
        require(_duration > 0, "duration=0");
        require(_token != address(0), "token=0");
        require(_totalAllocation > 0, "total=0");

        beneficiary = _beneficiary;
        start = _start;
        duration = _duration;
        token = _token;
        totalAllocation = _totalAllocation;
    }

    function vestedAmount(uint256 timestamp) public view returns (uint256) {
        if (timestamp <= start) {
            return 0;
        }
        if (timestamp >= start + duration) {
            return totalAllocation;
        }
        return (totalAllocation * (timestamp - start)) / duration;
    }

    function release(address tokenAddress) external {
        require(tokenAddress == token, "token mismatch");
        uint256 vested = vestedAmount(block.timestamp);
        uint256 alreadyReleased = released[token];
        require(vested > alreadyReleased, "nothing to release");
        uint256 amount = vested - alreadyReleased;
        released[token] += amount;
        IERC20(token).transfer(beneficiary, amount);
    }

    function releaseTo(address to, uint256 amount) external {
        require(to != address(0), "to=0");
        uint256 vested = vestedAmount(block.timestamp);
        uint256 alreadyReleased = released[token];
        require(vested > alreadyReleased, "nothing to release");
        uint256 available = vested - alreadyReleased;
        require(amount <= available, "amount>available");
        released[token] += amount;
        IERC20(token).transfer(to, amount);
    }
}
