// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockPriceFeed {
    int256 private price;
    uint8 private decimalsValue;
    uint80 private roundId;
    uint256 private updatedAt;

    struct Round {
        int256 price;
        uint256 updatedAt;
    }

    mapping(uint80 => Round) public rounds;

    constructor() {
        price = 2000e8; // 2000 with 8 decimals
        decimalsValue = 8;
        roundId = 1;
        updatedAt = block.timestamp;
        
        rounds[roundId] = Round({
            price: price,
            updatedAt: updatedAt
        });
    }

    function setPrice(int256 newPrice) external {
        price = newPrice;
        roundId += 1;
        updatedAt = block.timestamp;
        
        rounds[roundId] = Round({
            price: newPrice,
            updatedAt: block.timestamp
        });
    }

    function setStalePrice(int256 newPrice, uint256 staleUpdatedAt) external {
        price = newPrice;
        roundId += 1;
        updatedAt = staleUpdatedAt;
        
        rounds[roundId] = Round({
            price: newPrice,
            updatedAt: staleUpdatedAt
        });
    }
    
    // Add explicitly backdated mock rounds for TWAP testing
    function addHistoricalRound(int256 historicalPrice, uint256 timeAgo) external {
        roundId += 1;
        uint256 historicalTime = block.timestamp - timeAgo;
        price = historicalPrice;
        updatedAt = historicalTime;
        
        rounds[roundId] = Round({
            price: historicalPrice,
            updatedAt: historicalTime
        });
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
    
    function getRoundData(uint80 _roundId) 
        external 
        view 
        returns (uint80, int256, uint256, uint256, uint80) 
    {
        require(_roundId > 0 && _roundId <= roundId, "No data");
        Round memory r = rounds[_roundId];
        return (_roundId, r.price, r.updatedAt, r.updatedAt, _roundId);
    }
}
