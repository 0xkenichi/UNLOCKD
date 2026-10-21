// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VestraWrapperNFT
 * @notice Standardized NFT representing a vesting position from various sources.
 * This token is minted by the VestingAdapter when collateral is escrowed.
 */
contract VestraWrapperNFT is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId = 1;
    address public vestingAdapter;

    struct VestingPosition {
        address originalContract;
        address token;
        uint256 totalAllocation;
        uint256 unlockTime;
        bool active;
    }

    mapping(uint256 => VestingPosition) public positions;

    modifier onlyVestingAdapter() {
        require(msg.sender == vestingAdapter, "Not authorized: Only VestingAdapter");
        _;
    }

    constructor(address _initialGovernor) ERC721("Vestra Vesting Position", "vVEST") Ownable(_initialGovernor) {}

    function setVestingAdapter(address _adapter) external onlyOwner {
        require(_adapter != address(0), "Invalid adapter address");
        vestingAdapter = _adapter;
    }

    /**
     * @notice Mints a new wrapper NFT representing a vesting position.
     * @param to The recipient of the NFT (the borrower).
     * @param originalContract The source vesting contract.
     * @param token The underlying asset token.
     * @param totalAllocation Total amount of tokens in the vesting.
     * @param unlockTime The effective unlock time for Vestra's purposes.
     * @param uri Metadata URI for the NFT.
     */
    function mint(
        address to,
        address originalContract,
        address token,
        uint256 totalAllocation,
        uint256 unlockTime,
        string calldata uri
    ) external onlyVestingAdapter returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        positions[tokenId] = VestingPosition({
            originalContract: originalContract,
            token: token,
            totalAllocation: totalAllocation,
            unlockTime: unlockTime,
            active: true
        });

        return tokenId;
    }

    /**
     * @notice Burns the wrapper NFT. Typically called when the loan is repaid and collateral withdrawn.
     */
    function burn(uint256 tokenId) external onlyVestingAdapter {
        _burn(tokenId);
        delete positions[tokenId];
    }

    // Overrides required by Solidity

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
