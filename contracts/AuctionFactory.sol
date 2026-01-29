// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DutchAuction.sol";
import "./EnglishAuction.sol";
import "./SealedBidAuction.sol";

contract AuctionFactory {
    address public immutable adapter;
    address public immutable usdc;

    event AuctionDeployed(address indexed auction, string auctionType);

    constructor(address _adapter, address _usdc) {
        require(_adapter != address(0), "adapter=0");
        require(_usdc != address(0), "usdc=0");
        adapter = _adapter;
        usdc = _usdc;
    }

    function createDutchAuction() external returns (address) {
        address auction = address(new DutchAuction(adapter, usdc));
        emit AuctionDeployed(auction, "DUTCH");
        return auction;
    }

    function createEnglishAuction() external returns (address) {
        address auction = address(new EnglishAuction(adapter, usdc));
        emit AuctionDeployed(auction, "ENGLISH");
        return auction;
    }

    function createSealedBidAuction() external returns (address) {
        address auction = address(new SealedBidAuction(adapter, usdc));
        emit AuctionDeployed(auction, "SEALED_BID");
        return auction;
    }
}
