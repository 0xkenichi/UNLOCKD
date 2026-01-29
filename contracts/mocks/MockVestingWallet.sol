// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockVestingWallet {
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
        beneficiary = _beneficiary;
        start = _start;
        duration = _duration;
        token = _token;
        totalAllocation = _totalAllocation;
    }

    function setReleased(uint256 amount) external {
        released[token] = amount;
    }

    function releaseTo(address to, uint256 amount) public {
        require(to != address(0), "to=0");
        require(block.timestamp >= start + duration, "not vested");
        released[token] += amount;
        IERC20(token).transfer(to, amount);
    }

    function release(uint256 amount) external {
        releaseTo(beneficiary, amount);
    }
}
