// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ITokenTimelock {
    function beneficiary() external view returns (address);
    function token() external view returns (address);
    function releaseTime() external view returns (uint256);
    function release() external;
}

contract TokenTimelockClaimWrapper is Ownable {
    address public beneficiary;
    address public token;
    uint256 public totalAllocation;

    address public timelock;
    uint256 public startTime;
    uint256 public vestingDuration;
    bool public initialized;

    mapping(address => uint256) private releasedAmounts;

    constructor(
        address _beneficiary,
        address _token,
        uint256 _totalAllocation,
        uint256 _duration
    ) Ownable(msg.sender) {
        require(_beneficiary != address(0), "beneficiary=0");
        require(_token != address(0), "token=0");
        require(_totalAllocation > 0, "total=0");
        require(_duration > 0, "duration=0");
        beneficiary = _beneficiary;
        token = _token;
        totalAllocation = _totalAllocation;
        vestingDuration = _duration;
    }

    function initTimelock(address timelockAddress) external onlyOwner {
        require(!initialized, "already initialized");
        require(timelockAddress != address(0), "timelock=0");
        ITokenTimelock tl = ITokenTimelock(timelockAddress);
        require(tl.beneficiary() == address(this), "wrapper not beneficiary");
        require(tl.token() == token, "token mismatch");
        timelock = timelockAddress;
        uint256 releaseTime = tl.releaseTime();
        require(releaseTime >= vestingDuration, "release<duration");
        startTime = releaseTime - vestingDuration;
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

    function released(address tokenAddress) external view returns (uint256) {
        require(tokenAddress == token, "token mismatch");
        return releasedAmounts[token];
    }

    function releaseTo(address to, uint256 amount) external {
        require(initialized, "not initialized");
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");

        ITokenTimelock(timelock).release();
        uint256 available = IERC20(token).balanceOf(address(this));
        require(amount <= available, "amount>available");
        releasedAmounts[token] += amount;
        IERC20(token).transfer(to, amount);
    }
}
