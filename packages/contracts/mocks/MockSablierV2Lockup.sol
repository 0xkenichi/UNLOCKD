// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockSablierV2Lockup {
    struct Stream {
        address recipient;
        address token;
        uint128 deposited;
        uint128 withdrawn;
        uint40 start;
        uint40 end;
    }

    uint256 public nextStreamId = 1;
    mapping(uint256 => Stream) public streams;
    mapping(uint256 => mapping(address => bool)) public approved;

    function createStream(
        address recipient,
        address token,
        uint128 deposited,
        uint40 start,
        uint40 end
    ) external returns (uint256 streamId) {
        require(recipient != address(0), "recipient=0");
        require(token != address(0), "token=0");
        require(deposited > 0, "deposit=0");
        require(end > start, "end<=start");

        streamId = nextStreamId++;
        streams[streamId] = Stream({
            recipient: recipient,
            token: token,
            deposited: deposited,
            withdrawn: 0,
            start: start,
            end: end
        });

        require(
            IERC20(token).transferFrom(msg.sender, address(this), deposited),
            "transfer failed"
        );
    }

    function setApproved(uint256 streamId, address operator, bool isApproved) external {
        Stream memory stream = streams[streamId];
        require(stream.recipient != address(0), "unknown stream");
        require(msg.sender == stream.recipient, "not recipient");
        approved[streamId][operator] = isApproved;
    }

    function getRecipient(uint256 streamId) external view returns (address) {
        return streams[streamId].recipient;
    }

    function getAsset(uint256 streamId) external view returns (address) {
        return streams[streamId].token;
    }

    function getStartTime(uint256 streamId) external view returns (uint40) {
        return streams[streamId].start;
    }

    function getEndTime(uint256 streamId) external view returns (uint40) {
        return streams[streamId].end;
    }

    function getDepositedAmount(uint256 streamId) external view returns (uint128) {
        return streams[streamId].deposited;
    }

    function getWithdrawnAmount(uint256 streamId) external view returns (uint128) {
        return streams[streamId].withdrawn;
    }

    function _vestedAmount(Stream memory stream, uint256 timestamp) internal pure returns (uint256) {
        if (timestamp <= stream.start) {
            return 0;
        }
        if (timestamp >= stream.end) {
            return stream.deposited;
        }
        uint256 elapsed = timestamp - stream.start;
        uint256 duration = stream.end - stream.start;
        return (uint256(stream.deposited) * elapsed) / duration;
    }

    function withdraw(uint256 streamId, address to, uint128 amount) external {
        Stream memory stream = streams[streamId];
        require(stream.recipient != address(0), "unknown stream");
        require(to != address(0), "to=0");
        require(
            msg.sender == stream.recipient || approved[streamId][msg.sender],
            "not authorized"
        );

        uint256 vested = _vestedAmount(stream, block.timestamp);
        require(vested >= stream.withdrawn, "overdrawn");
        uint256 available = vested - stream.withdrawn;
        require(amount > 0 && amount <= available, "amount>available");

        streams[streamId].withdrawn += amount;
        IERC20(stream.token).transfer(to, amount);
    }
}
