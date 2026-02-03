// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SuperfluidClaimWrapper is Ownable {
    address public beneficiary;
    address public token;
    uint256 public totalAllocation;
    uint256 public startTime;
    uint256 public vestingDuration;

    mapping(address => uint256) public released;

    constructor(
        address _beneficiary,
        address _token,
        uint256 _totalAllocation,
        uint256 _startTime,
        uint256 _duration
    ) Ownable(msg.sender) {
        require(_beneficiary != address(0), "beneficiary=0");
        require(_token != address(0), "token=0");
        require(_totalAllocation > 0, "total=0");
        require(_duration > 0, "duration=0");
        beneficiary = _beneficiary;
        token = _token;
        totalAllocation = _totalAllocation;
        startTime = _startTime;
        vestingDuration = _duration;
    }

    function start() external view returns (uint256) {
        return startTime;
    }

    function duration() external view returns (uint256) {
        return vestingDuration;
    }

    function tokenAddress() external view returns (address) {
        return token;
    }

    function releaseTo(address to, uint256 amount) external {
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        require(block.timestamp >= startTime + vestingDuration, "not unlocked");
        uint256 available = IERC20(token).balanceOf(address(this));
        require(amount <= available, "amount>available");
        released[token] += amount;
        IERC20(token).transfer(to, amount);
    }
}
