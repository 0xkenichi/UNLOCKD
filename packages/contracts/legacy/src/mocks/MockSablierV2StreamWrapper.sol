// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./MockSablierV2Lockup.sol";

contract MockSablierV2StreamWrapper {
    MockSablierV2Lockup public lockup;
    uint256 public streamId;

    constructor(address lockupAddress, uint256 _streamId) {
        require(lockupAddress != address(0), "lockup=0");
        lockup = MockSablierV2Lockup(lockupAddress);
        streamId = _streamId;
    }

    function beneficiary() external view returns (address) {
        return lockup.getRecipient(streamId);
    }

    function start() external view returns (uint256) {
        return lockup.getStartTime(streamId);
    }

    function duration() external view returns (uint256) {
        uint256 startTime = lockup.getStartTime(streamId);
        uint256 endTime = lockup.getEndTime(streamId);
        return endTime - startTime;
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
        lockup.withdraw(streamId, to, uint128(amount));
    }
}
