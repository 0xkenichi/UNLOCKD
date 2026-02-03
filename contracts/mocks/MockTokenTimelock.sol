// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockTokenTimelock {
    address public beneficiary;
    address public token;
    uint256 public start;
    uint256 public duration;
    uint256 public releaseTime;
    uint256 public totalAllocation;

    mapping(address => uint256) public released;

    constructor(
        address _beneficiary,
        address _token,
        uint256 _start,
        uint256 _duration,
        uint256 _totalAllocation
    ) {
        require(_beneficiary != address(0), "beneficiary=0");
        require(_token != address(0), "token=0");
        require(_duration > 0, "duration=0");
        require(_totalAllocation > 0, "total=0");

        beneficiary = _beneficiary;
        token = _token;
        start = _start;
        duration = _duration;
        releaseTime = _start + _duration;
        totalAllocation = _totalAllocation;
    }

    function release() external {
        _releaseTo(beneficiary);
    }

    function releaseTo(address to, uint256 amount) external {
        require(to != address(0), "to=0");
        require(block.timestamp >= releaseTime, "not released");
        require(amount > 0, "amount=0");
        uint256 available = totalAllocation - released[token];
        require(amount <= available, "amount>available");
        released[token] += amount;
        IERC20(token).transfer(to, amount);
    }

    function _releaseTo(address to) internal {
        require(block.timestamp >= releaseTime, "not released");
        uint256 available = totalAllocation - released[token];
        require(available > 0, "nothing to release");
        released[token] += available;
        IERC20(token).transfer(to, available);
    }
}
