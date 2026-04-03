// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

/**
 * @title  IVestingProtocol
 * @notice Minimal interface each protocol-specific adapter must satisfy.
 *         Vestra never calls a vesting contract directly — it always goes
 *         through a typed adapter so attack surface stays bounded.
 */
interface IVestingProtocol {
    /// @notice Transfer control of streamId to `newOwner`.
    function transferStream(uint256 streamId, address newOwner) external;

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
 * @title  ISablierV2LockupLinear
 * @notice Minimal Sablier v2 surface Vestra needs.
 */
interface ISablierV2LockupLinear {
    struct Timestamps {
        uint40 start;
        uint40 cliff;
        uint40 end;
    }

    function transferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function getStream(uint256 streamId)
        external
        view
        returns (
            address sender,
            address recipient,
            uint128 depositAmount,
            address asset,
            bool cancelable,
            bool wasCanceled,
            uint128 withdrawnAmount,
            Timestamps memory timestamps
        );
}

/**
 * @title  IStreamflow
 * @notice Minimal Streamflow surface (Solana-side handled by off-chain relayer;
 *         EVM side is a wrapper contract that holds the claim NFT).
 */
interface IStreamflow {
    function transferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
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
