// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VestingFactory
 * @notice Wraps native vesting streams (Sablier/Streamflow) into Vestra NFTs.
 */
contract VestingFactory is ERC721, Ownable {
    uint256 private _nextTokenId;

    struct VestingPosition {
        address protocol;
        address token;
        uint256 amount;
        uint256 unlockTime;
        bool exists;
    }

    mapping(uint256 => VestingPosition) public positions;

    constructor() ERC721("Vestra Vesting Proof", "VVP") Ownable(msg.sender) {}

    /**
     * @notice Registers a vesting position and mints a VVP NFT.
     */
    function registerVesting(
        address protocol,
        address token,
        uint256 amount,
        uint256 unlockTime
    ) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        positions[tokenId] = VestingPosition({
            protocol: protocol,
            token: token,
            amount: amount,
            unlockTime: unlockTime,
            exists: true
        });

        return tokenId;
    }
}
