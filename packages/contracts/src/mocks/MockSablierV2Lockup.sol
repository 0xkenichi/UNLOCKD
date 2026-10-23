// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/**
 * @notice Test double for a Sablier v2 Lockup Linear contract: an ERC-721 whose
 *         owner is the stream recipient, exposing the same per-field getters,
 *         cancel semantics and `withdraw` access rules as Sablier v2.1.
 */
contract MockSablierV2Lockup is ERC721 {
    using SafeERC20 for IERC20;

    struct Stream {
        address sender;
        address token;
        uint128 deposited;
        uint128 withdrawn;
        uint128 refunded;
        uint40  start;
        uint40  cliff;
        uint40  end;
        bool    cancelable;
        bool    canceled;
    }

    uint256 public nextStreamId = 1;
    mapping(uint256 => Stream) public streams;

    constructor() ERC721("Mock Sablier v2 Lockup", "MSAB") {}

    function createStream(
        address recipient,
        address token,
        uint128 deposited,
        uint40 start,
        uint40 end,
        bool cancelable
    ) external returns (uint256 streamId) {
        return _create(recipient, token, deposited, start, start, end, cancelable);
    }

    /// @dev Lockup Linear with a cliff: nothing streams before `cliff`, then the amount accrued since `start`.
    function createStreamWithCliff(
        address recipient,
        address token,
        uint128 deposited,
        uint40 start,
        uint40 cliff,
        uint40 end,
        bool cancelable
    ) external returns (uint256 streamId) {
        require(cliff >= start && cliff <= end, "cliff");
        return _create(recipient, token, deposited, start, cliff, end, cancelable);
    }

    function _create(
        address recipient,
        address token,
        uint128 deposited,
        uint40 start,
        uint40 cliff,
        uint40 end,
        bool cancelable
    ) internal returns (uint256 streamId) {
        require(recipient != address(0), "recipient=0");
        require(deposited > 0, "deposit=0");
        require(end > start, "end<=start");

        streamId = nextStreamId++;
        streams[streamId] = Stream({
            sender: msg.sender,
            token: token,
            deposited: deposited,
            withdrawn: 0,
            refunded: 0,
            start: start,
            cliff: cliff,
            end: end,
            cancelable: cancelable,
            canceled: false
        });
        IERC20(token).safeTransferFrom(msg.sender, address(this), deposited);
        _mint(recipient, streamId);
    }

    // ── Sablier getters ──────────────────────────────────────────────────────
    function getRecipient(uint256 id) external view returns (address) { return ownerOf(id); }
    function getSender(uint256 id) external view returns (address) { return streams[id].sender; }
    function getAsset(uint256 id) external view returns (address) { return streams[id].token; }
    function getStartTime(uint256 id) external view returns (uint40) { return streams[id].start; }
    function getCliffTime(uint256 id) external view returns (uint40) { return streams[id].cliff; }
    function getEndTime(uint256 id) external view returns (uint40) { return streams[id].end; }
    function getDepositedAmount(uint256 id) external view returns (uint128) { return streams[id].deposited; }
    function getWithdrawnAmount(uint256 id) external view returns (uint128) { return streams[id].withdrawn; }
    function getRefundedAmount(uint256 id) external view returns (uint128) { return streams[id].refunded; }
    function isCancelable(uint256 id) external view returns (bool) { return streams[id].cancelable && !streams[id].canceled; }
    function wasCanceled(uint256 id) external view returns (bool) { return streams[id].canceled; }

    function streamedAmountOf(uint256 id) public view returns (uint128) {
        Stream memory s = streams[id];
        if (s.canceled) return s.deposited - s.refunded;
        if (block.timestamp <= s.start || block.timestamp < s.cliff) return 0;
        if (block.timestamp >= s.end) return s.deposited;
        return uint128((uint256(s.deposited) * (block.timestamp - s.start)) / (s.end - s.start));
    }

    function withdrawableAmountOf(uint256 id) public view returns (uint128) {
        return streamedAmountOf(id) - streams[id].withdrawn;
    }

    // ── Sablier actions ──────────────────────────────────────────────────────

    /// @dev As in Sablier v2.1: anyone may withdraw to the recipient; the recipient
    ///      (or an approved operator) may withdraw anywhere.
    function withdraw(uint256 id, address to, uint128 amount) public {
        address recipient = ownerOf(id);
        require(to != address(0), "to=0");
        require(
            to == recipient || _isAuthorized(recipient, msg.sender, id),
            "not authorized"
        );
        require(amount > 0 && amount <= withdrawableAmountOf(id), "amount>available");
        streams[id].withdrawn += amount;
        IERC20(streams[id].token).safeTransfer(to, amount);
    }

    function withdrawMax(uint256 id, address to) external returns (uint128 amount) {
        amount = withdrawableAmountOf(id);
        if (amount > 0) withdraw(id, to, amount);
    }

    function cancel(uint256 id) external {
        Stream storage s = streams[id];
        require(msg.sender == s.sender, "not sender");
        require(s.cancelable && !s.canceled, "not cancelable");
        uint128 refund = s.deposited - streamedAmountOf(id);
        s.refunded = refund;
        s.canceled = true;
        IERC20(s.token).safeTransfer(s.sender, refund);
    }
}
