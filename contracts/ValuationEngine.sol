// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";

contract ValuationEngine is Ownable {
    using ABDKMath64x64 for int128;

    AggregatorV3Interface public priceFeed; // default feed fallback
    mapping(address => address) public tokenPriceFeeds;
    uint256 public riskFreeRate = 5; // percent, 5 = 5%
    uint256 public volatility = 50; // percent, 50 = 50%
    uint256 public maxPriceAge = 1 hours;
    bool public adminTimelockEnabled;
    uint256 public adminTimelockDelay = 1 days;

    struct PendingDefaultFeed {
        address feed;
        uint256 executeAfter;
        bool exists;
    }

    struct PendingTokenFeed {
        address feed;
        uint256 executeAfter;
        bool exists;
    }

    PendingDefaultFeed public pendingDefaultFeed;
    mapping(address => PendingTokenFeed) public pendingTokenFeeds;

    uint256 public constant BASE_LTV_BPS = 3000; // 30%
    uint256 public constant BPS_DENOMINATOR = 10000;

    event AdminTimelockConfigUpdated(bool enabled, uint256 delaySeconds);
    event DefaultPriceFeedQueued(address indexed feed, uint256 executeAfter);
    event DefaultPriceFeedCancelled();
    event TokenPriceFeedQueued(address indexed token, address indexed feed, uint256 executeAfter);
    event TokenPriceFeedCancelled(address indexed token);

    constructor(address _priceFeed) Ownable(msg.sender) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function setPriceFeed(address newPriceFeed) external onlyOwner {
        require(!adminTimelockEnabled, "timelocked");
        _applyDefaultPriceFeed(newPriceFeed);
    }

    function queuePriceFeed(address newPriceFeed) external onlyOwner {
        require(adminTimelockEnabled, "timelock disabled");
        require(newPriceFeed != address(0), "feed=0");
        uint256 executeAfter = block.timestamp + adminTimelockDelay;
        pendingDefaultFeed = PendingDefaultFeed({
            feed: newPriceFeed,
            executeAfter: executeAfter,
            exists: true
        });
        emit DefaultPriceFeedQueued(newPriceFeed, executeAfter);
    }

    function executeQueuedPriceFeed() external onlyOwner {
        PendingDefaultFeed memory pending = pendingDefaultFeed;
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingDefaultFeed;
        _applyDefaultPriceFeed(pending.feed);
    }

    function cancelQueuedPriceFeed() external onlyOwner {
        require(pendingDefaultFeed.exists, "no queued config");
        delete pendingDefaultFeed;
        emit DefaultPriceFeedCancelled();
    }

    function setTokenPriceFeed(address token, address feed) external onlyOwner {
        require(!adminTimelockEnabled, "timelocked");
        _applyTokenPriceFeed(token, feed);
    }

    function queueTokenPriceFeed(address token, address feed) external onlyOwner {
        require(adminTimelockEnabled, "timelock disabled");
        require(token != address(0), "token=0");
        uint256 executeAfter = block.timestamp + adminTimelockDelay;
        pendingTokenFeeds[token] = PendingTokenFeed({
            feed: feed,
            executeAfter: executeAfter,
            exists: true
        });
        emit TokenPriceFeedQueued(token, feed, executeAfter);
    }

    function executeQueuedTokenPriceFeed(address token) external onlyOwner {
        PendingTokenFeed memory pending = pendingTokenFeeds[token];
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingTokenFeeds[token];
        _applyTokenPriceFeed(token, pending.feed);
    }

    function cancelQueuedTokenPriceFeed(address token) external onlyOwner {
        require(pendingTokenFeeds[token].exists, "no queued config");
        delete pendingTokenFeeds[token];
        emit TokenPriceFeedCancelled(token);
    }

    function setAdminTimelockConfig(bool enabled, uint256 delaySeconds) external onlyOwner {
        require(delaySeconds >= 1 minutes && delaySeconds <= 30 days, "bad delay");
        adminTimelockEnabled = enabled;
        adminTimelockDelay = delaySeconds;
        emit AdminTimelockConfigUpdated(enabled, delaySeconds);
    }

    function _applyDefaultPriceFeed(address newPriceFeed) internal {
        require(newPriceFeed != address(0), "feed=0");
        priceFeed = AggregatorV3Interface(newPriceFeed);
    }

    function _applyTokenPriceFeed(address token, address feed) internal {
        require(token != address(0), "token=0");
        tokenPriceFeeds[token] = feed;
    }

    function getPriceFeedForToken(address token) public view returns (address) {
        address tokenFeed = tokenPriceFeeds[token];
        if (tokenFeed != address(0)) {
            return tokenFeed;
        }
        return address(priceFeed);
    }

    function setRiskFreeRate(uint256 newRate) external onlyOwner {
        require(newRate <= 20, "rate too high");
        riskFreeRate = newRate;
    }

    function setVolatility(uint256 newVol) external onlyOwner {
        require(newVol <= 100, "vol too high");
        volatility = newVol;
    }

    function setMaxPriceAge(uint256 newMaxPriceAge) external onlyOwner {
        require(newMaxPriceAge > 0 && newMaxPriceAge <= 7 days, "bad max age");
        maxPriceAge = newMaxPriceAge;
    }

    function _readValidatedPrice(
        address token
    ) internal view returns (uint256 price, uint8 decimals) {
        address feedAddress = getPriceFeedForToken(token);
        require(feedAddress != address(0), "feed=0");
        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = feed.latestRoundData();
        require(answer > 0, "bad price");
        require(answeredInRound >= roundId, "stale round");
        require(updatedAt > 0, "bad timestamp");
        require(block.timestamp >= updatedAt, "future round");
        require(block.timestamp - updatedAt <= maxPriceAge, "stale price");
        return (uint256(answer), feed.decimals());
    }

    function computeDPV(
        uint256 quantity,
        address token,
        uint256 unlockTime
    ) public view returns (uint256 pv, uint256 ltvBps) {
        require(quantity > 0, "quantity=0");
        require(unlockTime > block.timestamp, "already unlocked");

        (uint256 price, uint8 decimals) = _readValidatedPrice(token);

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
