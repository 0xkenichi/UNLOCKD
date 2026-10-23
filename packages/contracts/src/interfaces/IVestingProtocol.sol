// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

/**
 * @title  IVestingProtocol
 * @notice Interface a whitelisted generic ERC-721 vesting claim must implement.
 */
interface IVestingProtocol {
    /// @notice Return the token, total deposited, withdrawn, and end-time for `streamId`.
    function getStream(uint256 streamId)
        external
        view
        returns (
            address token,
            uint256 totalAmount,
            uint256 withdrawnAmount,
            uint256 endTime
        );
}

/**
 * @title  ISablierV2Lockup
 * @notice The Sablier v2 Lockup getters Vestra relies on. These per-field getters
 *         exist with the same signatures on Lockup Linear, Dynamic and Tranched
 *         (v2.0 – v2.2), unlike the `getStream` struct whose layout changed
 *         between releases.
 */
interface ISablierV2Lockup {
    function getAsset(uint256 streamId) external view returns (address);
    function getDepositedAmount(uint256 streamId) external view returns (uint128);
    function getWithdrawnAmount(uint256 streamId) external view returns (uint128);
    function getRefundedAmount(uint256 streamId) external view returns (uint128);
    function getEndTime(uint256 streamId) external view returns (uint40);
    function isCancelable(uint256 streamId) external view returns (bool);
    function wasCanceled(uint256 streamId) external view returns (bool);
    /// @dev v2.1+ returns the withdrawn amount; v2.0 returns nothing. Callers must
    ///      not rely on the return value.
    function withdrawMax(uint256 streamId, address to) external;
}

/**
 * @title  ISablierV2LockupTimes
 * @notice Schedule getters. `getStartTime` exists on every Lockup contract; `getCliffTime` only on
 *         Lockup Linear (and the merged Lockup of v2.0+ for linear streams). Callers must handle
 *         a revert, which means "not a linear stream".
 */
interface ISablierV2LockupTimes {
    function getStartTime(uint256 streamId) external view returns (uint40);
    function getCliffTime(uint256 streamId) external view returns (uint40);
}

/**
 * @title  IStreamflow
 * @notice Minimal Streamflow EVM wrapper surface.
 */
interface IStreamflow {
    function getStreamData(uint256 tokenId)
        external
        view
        returns (
            address token,
            uint256 amount,
            uint256 withdrawn,
            uint256 endTime
        );
}
