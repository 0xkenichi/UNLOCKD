// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IOZVestingWallet {
    function beneficiary() external view returns (address);
    function start() external view returns (uint256);
    function duration() external view returns (uint256);
    function released(address token) external view returns (uint256);
    function release(address token) external;
}

contract OZVestingClaimWrapper is Ownable {
    address public beneficiary;
    address public token;
    uint256 public totalAllocation;

    address public vesting;
    uint256 public startTime;
    uint256 public vestingDuration;
    bool public initialized;

    mapping(address => uint256) private releasedAmounts;

    constructor(address _beneficiary, address _token, uint256 _totalAllocation) Ownable(msg.sender) {
        require(_beneficiary != address(0), "beneficiary=0");
        require(_token != address(0), "token=0");
        require(_totalAllocation > 0, "total=0");
        beneficiary = _beneficiary;
        token = _token;
        totalAllocation = _totalAllocation;
    }

    function initVesting(address vestingAddress) external onlyOwner {
        require(!initialized, "already initialized");
        require(vestingAddress != address(0), "vesting=0");
        IOZVestingWallet v = IOZVestingWallet(vestingAddress);
        require(v.beneficiary() == address(this), "wrapper not beneficiary");
        vesting = vestingAddress;
        startTime = v.start();
        vestingDuration = v.duration();
        initialized = true;
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

    function released(address tokenAddr) external view returns (uint256) {
        require(tokenAddr == token, "token mismatch");
        return releasedAmounts[token];
    }

    function releaseTo(address to, uint256 amount) external {
        require(initialized, "not initialized");
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");

        IOZVestingWallet(vesting).release(token);
        uint256 available = IERC20(token).balanceOf(address(this));
        require(amount <= available, "amount>available");
        releasedAmounts[token] += amount;
        IERC20(token).transfer(to, amount);
    }
}
