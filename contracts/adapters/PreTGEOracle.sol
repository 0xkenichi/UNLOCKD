// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title PreTGEOracle
/// @notice A specialized Oracle for unlaunched tokens based on the V4.0 Vestra Whitepaper.
/// Ingests signed OTC/Secondary/Seed Round implied FDV pricing data.
contract PreTGEOracle is Ownable {
    mapping(address => uint256) public impliedPrices;
    mapping(address => uint256) public lastUpdateTimes;
    mapping(address => uint8) public tokenDecimals;
    
    address public dataSigner;
    uint256 public maxAge = 7 days; // OTC data doesn't move as fast as spot

    event DataSignerUpdated(address indexed signer);
    event SyntheticPriceUpdated(address indexed token, uint256 price, uint8 decimals);

    constructor(address _dataSigner) Ownable(msg.sender) {
        dataSigner = _dataSigner;
    }

    function setDataSigner(address _dataSigner) external onlyOwner {
        require(_dataSigner != address(0), "Invalid signer");
        dataSigner = _dataSigner;
        emit DataSignerUpdated(_dataSigner);
    }

    /// @notice Allows the designated data signer (e.g., a localized coprocessor) to push Pre-TGE pricing.
    function setSyntheticPrice(address token, uint256 price, uint8 decimals) external {
        require(msg.sender == dataSigner || msg.sender == owner(), "Unauthorized");
        impliedPrices[token] = price;
        lastUpdateTimes[token] = block.timestamp;
        tokenDecimals[token] = decimals;
        emit SyntheticPriceUpdated(token, price, decimals);
    }

    /// @notice Conforms loosely to the fields we need from AggregatorV3Interface for ValuationEngine
    function getLatestPrice(address token) external view returns (uint256 price, uint8 decimals, uint256 updatedAt) {
        price = impliedPrices[token];
        decimals = tokenDecimals[token];
        updatedAt = lastUpdateTimes[token];
        require(price > 0, "No synthetic price");
        require(block.timestamp - updatedAt <= maxAge, "Stale Pre-TGE data");
    }
}
