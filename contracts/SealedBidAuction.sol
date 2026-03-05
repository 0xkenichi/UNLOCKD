// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BaseAuction.sol";

contract SealedBidAuction is BaseAuction {
    using SafeERC20 for IERC20;

    mapping(uint256 => mapping(address => bytes32)) public bidCommitments;
    mapping(uint256 => mapping(address => uint256)) public revealedBids;

    constructor(address _adapter, address _usdc) BaseAuction(_adapter, _usdc) {}

    function buildCommitment(
        uint256 auctionId,
        uint256 bidAmount,
        uint256 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(auctionId, bidAmount, nonce));
    }

    function commitBid(uint256 auctionId, bytes32 commitment) external whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        require(_isActive(auction), "ended");
        require(commitment != bytes32(0), "commit=0");

        uint256 commitEnd = auction.startTime + (auction.duration / 2);
        require(block.timestamp < commitEnd, "commit ended");
        require(bidCommitments[auctionId][msg.sender] == bytes32(0), "committed");

        bidCommitments[auctionId][msg.sender] = commitment;
    }

    function revealBid(
        uint256 auctionId,
        uint256 bidAmount,
        uint256 nonce
    ) external nonReentrant whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        uint256 commitEnd = auction.startTime + (auction.duration / 2);

        require(block.timestamp >= commitEnd, "reveal not started");
        require(_isActive(auction), "ended");
        require(bidAmount > 0, "bid=0");

        bytes32 commitment = bidCommitments[auctionId][msg.sender];
        require(commitment != bytes32(0), "no commit");
        require(revealedBids[auctionId][msg.sender] == 0, "revealed");
        require(
            commitment == buildCommitment(auctionId, bidAmount, nonce),
            "bad reveal"
        );

        uint256 reserve = auction.endPrice;
        require(bidAmount >= reserve, "reserve");

        uint256 prevHighest = auction.highestBid;
        address prevHighestBidder = auction.highestBidder;

        revealedBids[auctionId][msg.sender] = bidAmount;
        usdc.safeTransferFrom(msg.sender, address(this), bidAmount);

        if (bidAmount > prevHighest) {
            auction.highestBidder = msg.sender;
            auction.highestBid = bidAmount;
            emit BidPlaced(auctionId, bidAmount);
        }

        if (msg.sender != auction.highestBidder) {
            usdc.safeTransfer(msg.sender, bidAmount);
        } else if (
            prevHighestBidder != address(0) && prevHighestBidder != msg.sender
        ) {
            usdc.safeTransfer(prevHighestBidder, prevHighest);
        }
    }

    function bid(uint256, uint256) external pure override {
        revert("use commit/reveal");
    }

    function endAuction(uint256 auctionId) external override nonReentrant whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        require(!_isActive(auction), "active");

        AuctionState storage state = auctionStates[auctionId];
        require(!state.finalized, "finalized");

        if (auction.highestBidder == address(0)) {
            _finalizeNoBid(auctionId);
            return;
        }

        _finalizeAuction(auctionId, auction.highestBidder, auction.highestBid);
    }

    function getCurrentPrice(uint256 auctionId) public view override returns (uint256) {
        return auctions[auctionId].highestBid;
    }
}
