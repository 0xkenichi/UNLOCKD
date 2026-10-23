// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "../interfaces/IVestingProtocol.sol";

/**
 * @notice Test double for a whitelisted generic vesting claim (IVestingProtocol): a tranched
 *         schedule the adapter cannot read, so it records the stream as one cliff at the end.
 *         Tranche 1 unlocks at `firstUnlock`, the rest at `endTime`.
 */
contract MockGenericVesting is ERC721, IVestingProtocol {
    using SafeERC20 for IERC20;

    struct Stream {
        address token;
        uint256 total;
        uint256 firstTranche;
        uint256 withdrawn;
        uint40 firstUnlock;
        uint40 endTime;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Stream) public streams;

    constructor() ERC721("Mock Generic Vesting", "MGV") {}

    function create(address recipient, address token, uint256 total, uint256 firstTranche, uint40 firstUnlock, uint40 endTime)
        external
        returns (uint256 id)
    {
        require(firstTranche <= total && firstUnlock <= endTime, "shape");
        id = nextId++;
        streams[id] = Stream(token, total, firstTranche, 0, firstUnlock, endTime);
        IERC20(token).safeTransferFrom(msg.sender, address(this), total);
        _mint(recipient, id);
    }

    function unlocked(uint256 id) public view returns (uint256) {
        Stream memory s = streams[id];
        if (block.timestamp >= s.endTime) return s.total;
        if (block.timestamp >= s.firstUnlock) return s.firstTranche;
        return 0;
    }

    /// Only the current owner may withdraw, and only to themselves.
    function withdraw(uint256 id, uint256 amount) external {
        require(msg.sender == ownerOf(id), "not owner");
        require(amount <= unlocked(id) - streams[id].withdrawn, "not unlocked");
        streams[id].withdrawn += amount;
        IERC20(streams[id].token).safeTransfer(msg.sender, amount);
    }

    function getStream(uint256 id) external view returns (address token, uint256 totalAmount, uint256 withdrawnAmount, uint256 endTime) {
        Stream memory s = streams[id];
        return (s.token, s.total, s.withdrawn, s.endTime);
    }
}
