// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAuction {
    struct AuctionItem {
        uint256 collateralId;
        uint256 startPrice;
        uint256 endPrice;
        uint256 duration;
        uint256 startTime;
        address seller;
        address highestBidder;
        uint256 highestBid;
    }

    event AuctionCreated(uint256 auctionId, uint256 collateralId);
    event BidPlaced(uint256 auctionId, uint256 bid);
    event AuctionEnded(uint256 auctionId, address winner, uint256 amount);

    function createAuction(
        uint256 collateralId,
        address vestingContract,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    ) external;

    function bid(uint256 auctionId, uint256 amount) external;
    function endAuction(uint256 auctionId) external;
    function claim(uint256 auctionId) external;
    function getCurrentPrice(uint256 auctionId) external view returns (uint256);
}
