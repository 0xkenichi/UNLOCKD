// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockStepVestingWallet {
    address public beneficiary;
    uint256 public start;
    uint256 public duration;
    uint256 public cliff;
    uint256 public stepInterval;
    uint256 public stepCount;
    address public token;
    uint256 public totalAllocation;

    mapping(address => uint256) public released;

    constructor(
        address _beneficiary,
        uint256 _start,
        uint256 _cliff,
        uint256 _stepInterval,
        uint256 _stepCount,
        address _token,
        uint256 _totalAllocation
    ) {
        require(_beneficiary != address(0), "beneficiary=0");
        require(_stepInterval > 0, "stepInterval=0");
        require(_stepCount > 0, "stepCount=0");
        require(_token != address(0), "token=0");
        require(_totalAllocation > 0, "total=0");

        beneficiary = _beneficiary;
        start = _start;
        cliff = _cliff;
        stepInterval = _stepInterval;
        stepCount = _stepCount;
        duration = _cliff + (_stepInterval * _stepCount);
        token = _token;
        totalAllocation = _totalAllocation;
    }

    function vestedAmount(uint256 timestamp) public view returns (uint256) {
        uint256 cliffAt = start + cliff;
        if (timestamp < cliffAt) {
            return 0;
        }

        uint256 elapsedAfterCliff = timestamp - cliffAt;
        uint256 unlockedSteps = (elapsedAfterCliff / stepInterval) + 1;
        if (unlockedSteps >= stepCount) {
            return totalAllocation;
        }

        return (totalAllocation * unlockedSteps) / stepCount;
    }

    function releasableAmount() public view returns (uint256) {
        uint256 vested = vestedAmount(block.timestamp);
        uint256 alreadyReleased = released[token];
        if (vested <= alreadyReleased) {
            return 0;
        }
        return vested - alreadyReleased;
    }

    function releaseTo(address to, uint256 amount) public {
        require(to != address(0), "to=0");
        uint256 releasable = releasableAmount();
        require(amount <= releasable, "amount>releasable");

        released[token] += amount;
        IERC20(token).transfer(to, amount);
    }

    function release(uint256 amount) external {
        releaseTo(beneficiary, amount);
    }
}
