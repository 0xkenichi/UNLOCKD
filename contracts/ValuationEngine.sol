// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract ValuationEngine is Ownable {
    using ABDKMath64x64 for int128;

    AggregatorV3Interface public priceFeed; // e.g., ETH/USD
    uint256 public riskFreeRate = 5; // percent, 5 = 5%
    uint256 public volatility = 50; // percent, 50 = 50%

    uint256 public constant BASE_LTV_BPS = 3000; // 30%
    uint256 public constant BPS_DENOMINATOR = 10000;

    constructor(address _priceFeed) Ownable(msg.sender) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function setRiskFreeRate(uint256 newRate) external onlyOwner {
        require(newRate <= 20, "rate too high");
        riskFreeRate = newRate;
    }

    function setVolatility(uint256 newVol) external onlyOwner {
        require(newVol <= 100, "vol too high");
        volatility = newVol;
    }

    function computeDPV(
        uint256 quantity,
        address,
        uint256 unlockTime
    ) public view returns (uint256 pv, uint256 ltvBps) {
        require(quantity > 0, "quantity=0");
        require(unlockTime > block.timestamp, "already unlocked");

        (, int256 answer, , , ) = priceFeed.latestRoundData();
        require(answer > 0, "bad price");
        uint8 decimals = priceFeed.decimals();
        uint256 price = uint256(answer);

        uint256 baseValue = (quantity * price) / (10 ** decimals);

        // Time discount: exp(-rate * years)
        uint256 timeToUnlock = unlockTime - block.timestamp;
        int128 yearsToUnlock = ABDKMath64x64.divu(timeToUnlock, 365 days);
        int128 rate = ABDKMath64x64.divu(riskFreeRate, 100);
        int128 discount = ABDKMath64x64.exp(ABDKMath64x64.neg(rate.mul(yearsToUnlock)));

        // Monte Carlo-inspired conservatism
        int128 liquidity = ABDKMath64x64.divu(9, 10); // 0.9
        int128 shock = ABDKMath64x64.divu(95, 100); // 0.95
        int128 volPenalty = ABDKMath64x64.divu(volatility, 200); // 0.5 * vol
        int128 volAdj = ABDKMath64x64.sub(ABDKMath64x64.fromInt(1), volPenalty);
        if (volAdj < 0) {
            volAdj = ABDKMath64x64.fromInt(0);
        }

        int128 value64 = ABDKMath64x64.fromUInt(baseValue);
        int128 pv64 = value64.mul(discount).mul(liquidity).mul(shock).mul(volAdj);
        pv = ABDKMath64x64.toUInt(pv64);

        int128 ltv64 = ABDKMath64x64.fromUInt(BASE_LTV_BPS)
            .mul(liquidity)
            .mul(shock)
            .mul(volAdj);
        ltvBps = ABDKMath64x64.toUInt(ltv64);
        if (ltvBps > BPS_DENOMINATOR) {
            ltvBps = BPS_DENOMINATOR;
        }
    }
}
