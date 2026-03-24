// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LenderNFT is ERC721, Ownable {
    uint256 private _nextTokenId;
    address public loanManager;

    struct LenderPosition {
        uint256 loanId;
        uint256 amount;
        address token;
        uint256 startTime;
    }

    mapping(uint256 => LenderPosition) public positions;

    constructor(address _initialOwner) ERC721("Vestra Lender NFT", "VLNFT") Ownable(_initialOwner) {}

    function setLoanManager(address _loanManager) external onlyOwner {
        loanManager = _loanManager;
    }

    function mint(
        address to,
        uint256 loanId,
        uint256 amount,
        address token
    ) external returns (uint256) {
        require(msg.sender == loanManager || msg.sender == owner(), "unauthorized");
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        positions[tokenId] = LenderPosition({
            loanId: loanId,
            amount: amount,
            token: token,
            startTime: block.timestamp
        });
        return tokenId;
    }

    function burn(uint256 tokenId) external {
        require(msg.sender == loanManager || msg.sender == owner() || ownerOf(tokenId) == msg.sender, "unauthorized");
        _burn(tokenId);
        delete positions[tokenId];
    }
}
