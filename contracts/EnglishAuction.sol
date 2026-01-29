// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BaseAuction.sol";

contract EnglishAuction is BaseAuction {
    using SafeERC20 for IERC20;

    constructor(address _adapter, address _usdc) BaseAuction(_adapter, _usdc) {}

    function bid(uint256 auctionId, uint256 amount) external override nonReentrant whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        require(_isActive(auction), "ended");
        require(amount > auction.highestBid, "low bid");

        uint256 reserve = auction.endPrice;
        require(amount >= reserve, "reserve");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        if (auction.highestBidder != address(0)) {
            usdc.safeTransfer(auction.highestBidder, auction.highestBid);
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = amount;
        emit BidPlaced(auctionId, amount);
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
        AuctionItem memory auction = auctions[auctionId];
        uint256 reserve = auction.endPrice;
        if (auction.highestBid > reserve) {
            return auction.highestBid;
        }
        return reserve;
    }
}
