// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BaseAuction.sol";

contract DutchAuction is BaseAuction {
    using SafeERC20 for IERC20;

    constructor(address _adapter, address _usdc, address _initialGovernor) BaseAuction(_adapter, _usdc, _initialGovernor) {}

    function bid(uint256 auctionId, uint256 amount) external virtual override nonReentrant whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        require(_isActive(auction), "ended");
        require(auction.startPrice >= auction.endPrice, "bad range");

        uint256 currentPrice = _getCurrentPrice(auction);
        require(amount == currentPrice, "bad amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        auction.highestBidder = msg.sender;
        auction.highestBid = amount;
        emit BidPlaced(auctionId, amount);
        _finalizeAuction(auctionId, msg.sender, amount);
    }

    function endAuction(uint256 auctionId) external virtual override nonReentrant whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        require(!_isActive(auction), "active");

        AuctionState storage state = auctionStates[auctionId];
        require(!state.finalized, "finalized");
        _finalizeNoBid(auctionId);
    }

    function getCurrentPrice(uint256 auctionId) public view virtual override returns (uint256) {
        return _getCurrentPrice(auctions[auctionId]);
    }

    function _getCurrentPrice(AuctionItem memory auction) internal view returns (uint256) {
        if (block.timestamp >= auction.startTime + auction.duration) {
            return auction.endPrice;
        }
        uint256 timeElapsed = block.timestamp - auction.startTime;
        uint256 totalDecay = auction.startPrice - auction.endPrice;
        return auction.startPrice - (totalDecay * timeElapsed) / auction.duration;
    }
}
