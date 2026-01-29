// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPriceFeed {
    int256 private price;
    uint8 private decimalsValue;

    constructor() {
        price = 2000e8; // 2000 with 8 decimals
        decimalsValue = 8;
    }

    function setPrice(int256 newPrice) external {
        price = newPrice;
    }

    function decimals() external view returns (uint8) {
        return decimalsValue;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (0, price, 0, 0, 0);
    }
}
