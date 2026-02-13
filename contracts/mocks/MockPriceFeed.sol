// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPriceFeed {
    int256 private price;
    uint8 private decimalsValue;
    uint80 private roundId;
    uint256 private updatedAt;

    constructor() {
        price = 2000e8; // 2000 with 8 decimals
        decimalsValue = 8;
        roundId = 1;
        updatedAt = block.timestamp;
    }

    function setPrice(int256 newPrice) external {
        price = newPrice;
        roundId += 1;
        updatedAt = block.timestamp;
    }

    function setStalePrice(int256 newPrice, uint256 staleUpdatedAt) external {
        price = newPrice;
        roundId += 1;
        updatedAt = staleUpdatedAt;
    }

    function decimals() external view returns (uint8) {
        return decimalsValue;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, price, updatedAt, updatedAt, roundId);
    }
}
