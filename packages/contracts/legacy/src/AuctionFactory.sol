// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

/**
 * @title AuctionFactory
 * @notice V7.0 Citadel: Acts as a registry for pre-deployed auction contracts to bypass EIP-170 code size limits.
 */
contract AuctionFactory {
    address public immutable adapter;
    address public immutable usdc;
    address public immutable initialGovernor;

    // Registry of deployed auction instances
    mapping(string => address) public auctions;

    event AuctionRegistered(address indexed auction, string auctionType);

    constructor(address _adapter, address _usdc, address _initialGovernor) {
        require(_adapter != address(0), "adapter=0");
        require(_usdc != address(0), "usdc=0");
        adapter = _adapter;
        usdc = _usdc;
        initialGovernor = _initialGovernor;
    }

    function registerAuction(string calldata auctionType, address auctionAddress) external {
        require(msg.sender == initialGovernor, "unauthorized");
        auctions[auctionType] = auctionAddress;
        emit AuctionRegistered(auctionAddress, auctionType);
    }
    
    // Compatibility wrappers for existing code if needed
    function createDutchAuction() external view returns (address) {
        return auctions["DUTCH"];
    }

    function createEnglishAuction() external view returns (address) {
        return auctions["ENGLISH"];
    }

    function createSealedBidAuction() external view returns (address) {
        return auctions["SEALED_BID"];
    }

    function createStagedTrancheAuction() external view returns (address) {
        return auctions["STAGED_TRANCHE"];
    }
}
