// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockSuperfluidStream {
    address public receiver;
    address public token;
    uint256 public startTime;
    uint256 public endTime;
    int96 public flowRate;
    uint256 public totalAllocation;

    mapping(address => uint256) public released;

    constructor(
        address _receiver,
        address _token,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _totalAllocation
    ) {
        require(_receiver != address(0), "receiver=0");
        require(_token != address(0), "token=0");
        require(_endTime > _startTime, "end<=start");
        require(_totalAllocation > 0, "total=0");

        receiver = _receiver;
        token = _token;
        startTime = _startTime;
        endTime = _endTime;
        totalAllocation = _totalAllocation;
        flowRate = int96(int256(_totalAllocation / (_endTime - _startTime)));
    }

    function beneficiary() external view returns (address) {
        return receiver;
    }

    function start() external view returns (uint256) {
        return startTime;
    }

    function duration() external view returns (uint256) {
        return endTime - startTime;
    }

    function vestedAmount(uint256 timestamp) public view returns (uint256) {
        if (timestamp <= startTime) {
            return 0;
        }
        if (timestamp >= endTime) {
            return totalAllocation;
        }
        return (totalAllocation * (timestamp - startTime)) / (endTime - startTime);
    }

    function releaseTo(address to, uint256 amount) external {
        require(to != address(0), "to=0");
        uint256 vested = vestedAmount(block.timestamp);
        uint256 alreadyReleased = released[token];
        require(vested > alreadyReleased, "nothing to release");
        uint256 available = vested - alreadyReleased;
        require(amount > 0 && amount <= available, "amount>available");
        released[token] += amount;
        IERC20(token).transfer(to, amount);
    }
}
