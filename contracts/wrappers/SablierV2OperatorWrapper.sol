// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISablierV2Lockup {
    function getRecipient(uint256 streamId) external view returns (address);
    function getAsset(uint256 streamId) external view returns (address);
    function getStartTime(uint256 streamId) external view returns (uint40);
    function getEndTime(uint256 streamId) external view returns (uint40);
    function getDepositedAmount(uint256 streamId) external view returns (uint128);
    function getWithdrawnAmount(uint256 streamId) external view returns (uint128);
    function withdraw(uint256 streamId, address to, uint128 amount) external;
}

contract SablierV2OperatorWrapper is Ownable {
    ISablierV2Lockup public lockup;
    uint256 public streamId;
    address public beneficiary;

    constructor(address lockupAddress, uint256 _streamId, address _beneficiary) Ownable(msg.sender) {
        require(lockupAddress != address(0), "lockup=0");
        require(_streamId > 0, "stream=0");
        require(_beneficiary != address(0), "beneficiary=0");
        lockup = ISablierV2Lockup(lockupAddress);
        streamId = _streamId;
        beneficiary = _beneficiary;
    }

    function start() external view returns (uint256) {
        return lockup.getStartTime(streamId);
    }

    function duration() external view returns (uint256) {
        return lockup.getEndTime(streamId) - lockup.getStartTime(streamId);
    }

    function token() external view returns (address) {
        return lockup.getAsset(streamId);
    }

    function totalAllocation() external view returns (uint256) {
        return lockup.getDepositedAmount(streamId);
    }

    function released(address) external view returns (uint256) {
        return lockup.getWithdrawnAmount(streamId);
    }

    function releaseTo(address to, uint256 amount) external {
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        lockup.withdraw(streamId, to, uint128(amount));
    }
}
