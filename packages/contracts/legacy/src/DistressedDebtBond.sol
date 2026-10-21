// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DistressedDebtBond
 * @notice V6.0 Citadel - Minted exactly when a Tier-3 Loan (Standard Rank) defaults with an absolute deficit.
 * Represents a legally actionable claim for off-chain enforcement by distressed debt funds.
 * Owned and managed by the LoanManager, but tradable by the owners.
 */
contract DistressedDebtBond is ERC721, Ownable {
    uint256 public nextTokenId;
    
    // Core details regarding the original on-chain default
    struct DebtDetail {
        uint256 originalLoanId;
        address defaultingBorrower;
        uint256 deficitUsdc;
        uint256 timestamp;
    }
    
    mapping(uint256 => DebtDetail) public debtDetails;
    
    event BondMinted(uint256 indexed bondId, uint256 indexed loanId, address indexed borrower, uint256 deficit);
    
    constructor() ERC721("Vestra Distressed Debt", "VDDB") Ownable(msg.sender) {}

    /**
     * @notice Mints a new distressed bond. Only callable by the LoanManager protocol.
     */
    function mintBond(
        address to, 
        uint256 loanId, 
        address borrower, 
        uint256 deficitUsdc
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = nextTokenId++;
        
        debtDetails[tokenId] = DebtDetail({
            originalLoanId: loanId,
            defaultingBorrower: borrower,
            deficitUsdc: deficitUsdc,
            timestamp: block.timestamp
        });
        
        _safeMint(to, tokenId);
        
        emit BondMinted(tokenId, loanId, borrower, deficitUsdc);
        
        return tokenId;
    }
    
    function getDebtDetails(uint256 tokenId) external view returns (DebtDetail memory) {
        require(_ownerOf(tokenId) != address(0), "bond does not exist");
        return debtDetails[tokenId];
    }
}
