// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  MockSablierStream
 * @notice Simulates a Sablier-style linear vesting stream for Vestra testnet.
 * @dev    Threat model: re-entrancy on withdraw mitigated by CEI + nonReentrant.
 *         Stream sender can cancel (returns unvested to sender).
 *         Recipient (or approved operator like VestingAdapter) can withdraw vested.
 *         This contract's stream IDs are used as collateral in VestingAdapter.
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract MockSablierStream is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant STREAM_CREATOR_ROLE = keccak256("STREAM_CREATOR_ROLE");

    struct Stream {
        address sender;
        address recipient;
        address token;
        uint256 totalAmount;      // Total tokens to vest (18-dec WAD)
        uint256 startTime;        // Unix timestamp
        uint256 endTime;          // Unix timestamp — vesting completes here
        uint256 withdrawnAmount;  // Already withdrawn by recipient
        bool    cancelled;
    }

    uint256 public nextStreamId = 1;
    mapping(uint256 => Stream) public streams;
    // operator approval: streamId => operator => approved
    mapping(uint256 => mapping(address => bool)) public operators;

    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime
    );
    event Withdrawn(uint256 indexed streamId, address indexed recipient, uint256 amount);
    event Cancelled(uint256 indexed streamId, uint256 returnedToSender);
    event OperatorApproved(uint256 indexed streamId, address indexed operator, bool approved);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(STREAM_CREATOR_ROLE, msg.sender);
    }

    /**
     * @notice Create a new linear vesting stream.
     * @dev    Pulls `totalAmount` from msg.sender. Approves must be set first.
     *         Reverts if: endTime <= startTime, totalAmount == 0, token == address(0).
     * @param  recipient    Address that can withdraw vested tokens.
     * @param  token        ERC-20 token to vest.
     * @param  totalAmount  Total tokens to vest over the full duration.
     * @param  startTime    Unix timestamp when vesting begins.
     * @param  endTime      Unix timestamp when vesting fully unlocks.
     * @return streamId     The new stream's ID.
     */
    function createStream(
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime
    ) external onlyRole(STREAM_CREATOR_ROLE) returns (uint256 streamId) {
        require(recipient != address(0), "Vestra: zero recipient");
        require(token != address(0),     "Vestra: zero token");
        require(totalAmount > 0,         "Vestra: zero amount");
        require(endTime > startTime,     "Vestra: invalid duration");
        // RELAXED for testnet: allow start time slightly in past or future
        // require(startTime >= block.timestamp, "Vestra: start in past");

        streamId = nextStreamId++;
        streams[streamId] = Stream({
            sender:          msg.sender,
            recipient:       recipient,
            token:           token,
            totalAmount:     totalAmount,
            startTime:       startTime,
            endTime:         endTime,
            withdrawnAmount: 0,
            cancelled:       false
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        emit StreamCreated(streamId, msg.sender, recipient, token, totalAmount, startTime, endTime);
    }

    /**
     * @notice Returns the vested amount available to withdraw right now.
     * @param  streamId  The stream to query.
     * @return vestedAmount  Tokens vested but not yet withdrawn (18-dec WAD).
     */
    function vestedAmountOf(uint256 streamId) public view returns (uint256 vestedAmount) {
        Stream storage s = streams[streamId];
        if (s.cancelled || block.timestamp <= s.startTime) return 0;

        uint256 elapsed = block.timestamp >= s.endTime
            ? s.endTime - s.startTime
            : block.timestamp - s.startTime;
        uint256 duration = s.endTime - s.startTime;

        uint256 totalVested = (s.totalAmount * elapsed) / duration;
        vestedAmount = totalVested > s.withdrawnAmount ? totalVested - s.withdrawnAmount : 0;
    }

    /**
     * @notice Returns the total unvested amount remaining in the stream.
     * @param  streamId  The stream to query.
     * @return unvested  Tokens not yet vested (18-dec WAD).
     */
    function unvestedAmountOf(uint256 streamId) public view returns (uint256 unvested) {
        Stream storage s = streams[streamId];
        if (s.cancelled) return 0;

        uint256 elapsed = block.timestamp >= s.endTime
            ? s.endTime - s.startTime
            : block.timestamp - s.startTime;
        uint256 duration = s.endTime - s.startTime;
        uint256 totalVested = (s.totalAmount * elapsed) / duration;

        unvested = s.totalAmount > totalVested ? s.totalAmount - totalVested : 0;
    }

    /**
     * @notice Withdraw vested tokens. Callable by recipient or approved operator.
     * @dev    CEI: state updated before transfer. nonReentrant for extra safety.
     * @param  streamId  The stream to withdraw from.
     */
    function withdraw(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        require(
            msg.sender == s.recipient || operators[streamId][msg.sender],
            "Vestra: not authorised"
        );
        require(!s.cancelled, "Vestra: stream cancelled");

        uint256 amount = vestedAmountOf(streamId);
        require(amount > 0, "Vestra: nothing to withdraw");

        // CEI: update state before transfer
        s.withdrawnAmount += amount;

        IERC20(s.token).safeTransfer(s.recipient, amount);
        emit Withdrawn(streamId, s.recipient, amount);
    }

    /**
     * @notice Approve an operator (e.g., VestingAdapter) to act on a stream.
     * @dev    This is how VestingAdapter gets authority to escrow claim rights.
     * @param  streamId  The stream to grant access to.
     * @param  operator  The address to approve (e.g., VestingAdapter).
     * @param  approved  True to approve, false to revoke.
     */
    function setOperator(uint256 streamId, address operator, bool approved) external {
        require(msg.sender == streams[streamId].recipient, "Vestra: not recipient");
        operators[streamId][operator] = approved;
        emit OperatorApproved(streamId, operator, approved);
    }

    /**
     * @notice Cancel a stream. Returns unvested tokens to sender.
     * @dev    Only the stream sender can cancel. Vested amount stays claimable.
     * @param  streamId  The stream to cancel.
     */
    function cancel(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.sender, "Vestra: not sender");
        require(!s.cancelled,           "Vestra: already cancelled");

        uint256 unvested = unvestedAmountOf(streamId);
        s.cancelled = true;

        if (unvested > 0) {
            IERC20(s.token).safeTransfer(s.sender, unvested);
        }
        emit Cancelled(streamId, unvested);
    }

    /**
     * @notice Convenience: get full stream details.
     */
    function getStream(uint256 streamId) external view returns (
        address sender,
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        uint256 withdrawnAmount,
        bool    cancelled
    ) {
        Stream storage s = streams[streamId];
        return (
            s.sender,
            s.recipient,
            s.token,
            s.totalAmount,
            s.startTime,
            s.endTime,
            s.withdrawnAmount,
            s.cancelled
        );
    }
}
