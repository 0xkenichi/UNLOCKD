// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LoanNFT
 * @notice Each loan in Vestra Protocol is represented by an NFT that stores 
 * its metadata and terms for permanent on-chain proof.
 */
contract LoanNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;
    address public loanManager;

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "Not LoanManager");
        _;
    }

    struct LoanMetadata {
        uint256 loanId;
        uint256 principal;
        uint256 collateralAmount;
        uint256 ltvBps;
        uint256 omegaBps;
        uint256 timestamp;
        string legalTermsHash;
    }

    mapping(uint256 => LoanMetadata) public loanDetails;
    mapping(uint256 => uint256) public loanIdToTokenId;
    mapping(uint256 => bool) public isSettled;

    event LoanProofMinted(uint256 indexed tokenId, uint256 indexed loanId, address indexed borrower);
    event LoanProofSettled(uint256 indexed tokenId, uint256 indexed loanId);

    constructor() ERC721("Vestra Loan Proof", "vLOAN") Ownable(msg.sender) {}

    function mintProof(
        address borrower,
        uint256 loanId,
        uint256 principal,
        uint256 collateralAmount,
        uint256 ltvBps,
        uint256 omegaBps,
        string calldata legalTermsHash,
        string calldata tokenURI
    ) external onlyLoanManager returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(borrower, tokenId);
        _setTokenURI(tokenId, tokenURI);

        loanIdToTokenId[loanId] = tokenId;
        loanDetails[tokenId] = LoanMetadata({
            loanId: loanId,
            principal: principal,
            collateralAmount: collateralAmount,
            ltvBps: ltvBps,
            omegaBps: omegaBps,
            timestamp: block.timestamp,
            legalTermsHash: legalTermsHash
        });

        emit LoanProofMinted(tokenId, loanId, borrower);
        return tokenId;
    }

    function settleProof(uint256 loanId) external onlyLoanManager {
        uint256 tokenId = loanIdToTokenId[loanId];
        require(!isSettled[tokenId], "Already settled");
        isSettled[tokenId] = true;
        emit LoanProofSettled(tokenId, loanId);
    }

    function setLoanManager(address _loanManager) external onlyOwner {
        loanManager = _loanManager;
    }
}
