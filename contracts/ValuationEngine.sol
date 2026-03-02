// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "./VestingRegistry.sol";
import "hardhat/console.sol";

interface IPreTGEOracle {
    function getLatestPrice(address token) external view returns (uint256 price, uint8 decimals, uint256 updatedAt);
}

contract ValuationEngine is Ownable {
    using ABDKMath64x64 for int128;

    VestingRegistry public registry;
    mapping(address => address) public tokenPriceFeeds;
    uint256 public riskFreeRate = 5; // percent, 5 = 5%
    uint256 public volatility = 50; // percent, 50 = 50%
    uint256 public maxPriceAge = 1 hours;
    uint256 public twapInterval = 1 hours; // Default TWAP window
    bool public adminTimelockEnabled;
    uint256 public adminTimelockDelay = 1 days;
    
    // V4.0 AI Watcher Engine Integration
    address public coprocessor;
    mapping(address => uint256) public tokenOmegaBps; // 10000 = 100%
    
    // V4.0 Pre-TGE Oracle
    address public preTGEOracle;

    struct PendingTokenFeed {
        address feed;
        uint256 executeAfter;
        bool exists;
    }

    mapping(address => PendingTokenFeed) public pendingTokenFeeds;

    /// Price history: all-time high and all-time low per token (same decimals as token's price feed)
    struct TokenPriceBounds {
        uint256 ath;
        uint256 atl;
        uint8 decimals;
        bool set;
    }
    mapping(address => TokenPriceBounds) public tokenPriceBounds;
    /// Extra discount per 1% drawdown from ATH (bps of discount per 100 bps drawdown); e.g. 50 = 0.5% extra per 1%
    uint256 public drawdownPenaltyPerBps = 50;
    /// Cap on total drawdown-based extra discount (bps); e.g. 2000 = 20%
    uint256 public maxDrawdownPenaltyBps = 2000;
    /// How much range (ATH-ATL)/mid adds to volatility (bps of vol per 100 bps range ratio); e.g. 10
    uint256 public rangeVolWeightBps = 10;

    uint256 public constant BASE_LTV_BPS = 3000; // 30%
    uint256 public constant BPS_DENOMINATOR = 10000;

    event AdminTimelockConfigUpdated(bool enabled, uint256 delaySeconds);
    event TokenPriceBoundsUpdated(address indexed token, uint256 ath, uint256 atl, uint8 decimals);
    event DrawdownParamsUpdated(uint256 penaltyPerBps, uint256 maxPenaltyBps);
    event RangeVolWeightUpdated(uint256 rangeVolWeightBps);
    event TokenPriceFeedQueued(address indexed token, address indexed feed, uint256 executeAfter);
    event TokenPriceFeedCancelled(address indexed token);
    event RegistryUpdated(address indexed registry);
    
    // V4.0 Events
    event CoprocessorUpdated(address indexed coprocessor);
    event OmegaUpdated(address indexed token, uint256 omegaBps);

    constructor(address _registry) Ownable(msg.sender) {
        require(_registry != address(0), "registry=0");
        registry = VestingRegistry(_registry);
    }

    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "registry=0");
        registry = VestingRegistry(_registry);
        emit RegistryUpdated(_registry);
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
    
    // --- V4.0 AI Watcher Endpoints ---
    function setCoprocessor(address _coprocessor) external onlyOwner {
        coprocessor = _coprocessor;
        emit CoprocessorUpdated(_coprocessor);
    }
    
    function updateOmega(address token, uint256 omegaBps) external {
        require(msg.sender == coprocessor || msg.sender == owner(), "unauthorized coprocessor");
        require(omegaBps <= 10000, "invalid omega");
        tokenOmegaBps[token] = omegaBps;
        emit OmegaUpdated(token, omegaBps);
    }
    
    function setPreTGEOracle(address _oracle) external onlyOwner {
        preTGEOracle = _oracle;
    }
    // ---------------------------------

    function setAdminTimelockConfig(bool enabled, uint256 delaySeconds) external onlyOwner {
        require(delaySeconds >= 1 minutes && delaySeconds <= 30 days, "bad delay");
        adminTimelockEnabled = enabled;
        adminTimelockDelay = delaySeconds;
        emit AdminTimelockConfigUpdated(enabled, delaySeconds);
    }

    function _applyTokenPriceFeed(address token, address feed) internal {
        require(token != address(0), "token=0");
        tokenPriceFeeds[token] = feed;
    }

    function getPriceFeedForToken(address token) public view returns (address) {
        address tokenFeed = tokenPriceFeeds[token];
        require(tokenFeed != address(0), "no price feed");
        return tokenFeed;
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

    /// Set all-time high and all-time low for a token (same decimals as the token's price feed).
    function setTokenPriceBounds(
        address token,
        uint256 ath,
        uint256 atl,
        uint8 boundsDecimals
    ) external onlyOwner {
        require(token != address(0), "token=0");
        require(atl > 0 && ath >= atl, "invalid bounds");
        tokenPriceBounds[token] = TokenPriceBounds({
            ath: ath,
            atl: atl,
            decimals: boundsDecimals,
            set: true
        });
        emit TokenPriceBoundsUpdated(token, ath, atl, boundsDecimals);
    }

    function clearTokenPriceBounds(address token) external onlyOwner {
        require(token != address(0), "token=0");
        delete tokenPriceBounds[token];
        emit TokenPriceBoundsUpdated(token, 0, 0, 0);
    }

    function setDrawdownParams(uint256 penaltyPerBps, uint256 maxPenaltyBps) external onlyOwner {
        require(penaltyPerBps <= 1000, "penalty too high");
        require(maxPenaltyBps <= 5000, "max penalty too high");
        drawdownPenaltyPerBps = penaltyPerBps;
        maxDrawdownPenaltyBps = maxPenaltyBps;
        emit DrawdownParamsUpdated(penaltyPerBps, maxPenaltyBps);
    }

    function setRangeVolWeight(uint256 weightBps) external onlyOwner {
        require(weightBps <= 1000, "weight too high");
        rangeVolWeightBps = weightBps;
        emit RangeVolWeightUpdated(weightBps);
    }

    function setTwapInterval(uint256 newInterval) external onlyOwner {
        require(newInterval > 0 && newInterval <= 7 days, "bad interval");
        twapInterval = newInterval;
    }

    function _readValidatedPrice(
        address token
    ) internal view returns (uint256 price, uint8 decimals) {
        console.log("-- _readValidatedPrice START --");
        address feedAddress = tokenPriceFeeds[token];
        console.log("feedAddress:", feedAddress);
        
        // V4.0 Pre-TGE Fallback
        if (feedAddress == address(0)) {
            console.log("Using PreTGE Oracle");
            require(preTGEOracle != address(0), "no price feed and no preTGE oracle");
            uint256 updatedAt;
            (price, decimals, updatedAt) = IPreTGEOracle(preTGEOracle).getLatestPrice(token);
            require(block.timestamp >= updatedAt, "future round");
            // maxAge check is handled inside the PreTGEOracle itself
            return (price, decimals);
        }
        
        console.log("Using AggregatorV3Interface");
        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);
        
        (
            uint80 latestRoundId,
            int256 latestAnswer,
            ,
            uint256 latestUpdatedAt,

        ) = feed.latestRoundData();
        
        console.log("latestAnswer:", uint256(latestAnswer));
        require(latestAnswer > 0, "bad price");
        require(latestUpdatedAt > 0, "bad timestamp");
        require(block.timestamp >= latestUpdatedAt, "future round");
        require(block.timestamp - latestUpdatedAt <= maxPriceAge, "stale price");

        decimals = feed.decimals();
        console.log("Decimals:", decimals);

        // Perform a rudimentary TWAP (Time-Weighted Average Price) by walking back Chainlink rounds
        // over the configured `twapInterval`. This smooths out short-term flash volatility (unlock dumps).
        
        uint256 cumulativePriceTime = 0;
        uint256 totalWeightTime = 0;
        
        uint80 currentRoundId = latestRoundId;
        uint256 currentUpdatedAt = latestUpdatedAt;
        int256 currentAnswer = latestAnswer;
        
        uint256 targetTime = block.timestamp > twapInterval ? block.timestamp - twapInterval : 0;
        
        // Safety bound to avoid massive gas consumption if round spacing is extremely dense
        uint256 maxLookback = 20; 
        uint256 lookups = 0;

        while (currentUpdatedAt > targetTime && currentRoundId > 0 && lookups < maxLookback) {
            lookups++;
            uint80 nextRoundId = currentRoundId - 1;
            
            try feed.getRoundData(nextRoundId) returns (
                uint80 roundId,
                int256 answer,
                uint256 /* startedAt */,
                uint256 updatedAt,
                uint80 /* answeredInRound */
            ) {
                if (updatedAt < targetTime || updatedAt == 0 || answer <= 0) {
                    // Reached past the TWAP window or bad data, weigh the current segment up to targetTime
                    uint256 edgeSpan = currentUpdatedAt - targetTime;
                    cumulativePriceTime += uint256(currentAnswer) * edgeSpan;
                    totalWeightTime += edgeSpan;
                    break;
                }
                
                uint256 timeSpan = currentUpdatedAt - updatedAt;
                cumulativePriceTime += uint256(currentAnswer) * timeSpan;
                totalWeightTime += timeSpan;
                
                currentRoundId = roundId;
                currentUpdatedAt = updatedAt;
                currentAnswer = answer;
            } catch {
                // Should getRoundData revert, fall back gracefully
                break;
            }
        }
        
        // Strict Founder Protocol Vision: Spot prices are extremely unsafe and easily subject to 
        // flash manipulation right before token unlocks. We completely remove the spot price fallback.
        // If the Oracle cannot supply sufficient TWAP history, we reject the valuation.
        console.log("totalWeightTime:", totalWeightTime);
        console.log("twapInterval/2:", twapInterval / 2);
        require(totalWeightTime > (twapInterval / 2), "insufficient TWAP depth");
        price = cumulativePriceTime / totalWeightTime;
        
        console.log("Final Price:", price);
        return (price, decimals);
    }

    function computeDPV(
        uint256 quantity,
        address token,
        uint256 unlockTime,
        address vestingContract
    ) public view returns (uint256 pv, uint256 ltvBps) {
        console.log("-- computeDPV START --");
        require(quantity > 0, "quantity=0");
        require(unlockTime > block.timestamp, "already unlocked");

        uint8 rank = registry.getRank(vestingContract);
        console.log("registry rank:", rank);
        require(rank > 0 && rank <= 3, "unverified contract");

        (uint256 price, uint8 decimals) = _readValidatedPrice(token);
        console.log("-- Passed readValidatedPrice --");

        uint256 baseValue = (quantity * price) / (10 ** decimals);

        // Core Risk Matrix based on Rank
        // Rank 1 (Flagship): Base LTV 50%, Risk Free Rate 2%
        // Rank 2 (Premium): Base LTV 35%, Risk Free Rate 5%
        // Rank 3 (Standard): Base LTV 20%, Risk Free Rate 10%
        uint256 rankBaseLtv = rank == 1 ? 5000 : (rank == 2 ? 3500 : 2000);
        uint256 rankRiskFreeRate = rank == 1 ? 2 : (rank == 2 ? 5 : 10);

        // Time discount: exp(-rate * years)
        uint256 timeToUnlock = unlockTime - block.timestamp;
        int128 yearsToUnlock = ABDKMath64x64.divu(timeToUnlock, 365 days);
        int128 rate = ABDKMath64x64.divu(rankRiskFreeRate, 100);
        
        int128 discount;
        console.log("Calculating discount...");
        if (yearsToUnlock == 0) {
            discount = ABDKMath64x64.fromInt(1);
        } else {
            int128 rateNeg = ABDKMath64x64.neg(rate);
            int128 product = rateNeg.mul(yearsToUnlock);
            // discount = ABDKMath64x64.exp(product);
            // Disable exp temporarily to see if logic flows correctly
            discount = ABDKMath64x64.fromInt(1);
        }
        console.log("Discount calculated");

        uint256 effectiveVol = volatility;
        uint256 extraDiscountBps = 0;

        TokenPriceBounds memory bounds = tokenPriceBounds[token];
        if (bounds.set && bounds.ath >= bounds.atl && bounds.atl > 0) {
            uint256 priceScaled = price;
            if (decimals > bounds.decimals) {
                priceScaled = price / (10 ** (decimals - bounds.decimals));
            } else if (decimals < bounds.decimals) {
                priceScaled = price * (10 ** (bounds.decimals - decimals));
            }
            if (bounds.ath > 0 && priceScaled <= bounds.ath) {
                uint256 drawdownBps = ((bounds.ath - priceScaled) * BPS_DENOMINATOR) / bounds.ath;
                uint256 penalty = (drawdownBps * drawdownPenaltyPerBps) / 100;
                if (penalty > maxDrawdownPenaltyBps) penalty = maxDrawdownPenaltyBps;
                extraDiscountBps = penalty;
            }
            uint256 mid = bounds.ath + bounds.atl;
            if (mid > 0) {
                uint256 rangeRatioBps = ((bounds.ath - bounds.atl) * BPS_DENOMINATOR) / mid;
                uint256 volAdd = (rangeRatioBps * rangeVolWeightBps) / 100;
                effectiveVol = volatility + volAdd;
                if (effectiveVol > 100) effectiveVol = 100;
            }
        }

        // Monte Carlo-inspired conservatism (use effectiveVol when ATH/ATL set)
        int128 liquidity = ABDKMath64x64.divu(9, 10); // 0.9
        int128 shock = ABDKMath64x64.divu(95, 100); // 0.95
        int128 volPenalty = ABDKMath64x64.divu(effectiveVol, 200); // 0.5 * vol
        int128 volAdj = ABDKMath64x64.sub(ABDKMath64x64.fromInt(1), volPenalty);
        if (volAdj < 0) {
            volAdj = ABDKMath64x64.fromInt(0);
        }
        
        // V4.0 AI Watcher Omega Multiplier
        // If omega is exactly 0, we assume it hasn't been initialized and default to 100% (10000).
        // If the AI coprocessor wants to completely slash a token, they should set it to 1 (0.01%).
        uint256 currentOmega = tokenOmegaBps[token];
        if (currentOmega == 0) {
            currentOmega = 10000;
        }
        int128 omega = ABDKMath64x64.divu(currentOmega, 10000);

        console.log("applying ABDKMath...");
        int128 cumulativeMultiplier = discount.mul(liquidity).mul(shock).mul(volAdj).mul(omega);
        
        if (extraDiscountBps > 0) {
            cumulativeMultiplier = cumulativeMultiplier.mul(ABDKMath64x64.divu(BPS_DENOMINATOR - extraDiscountBps, BPS_DENOMINATOR));
        }
        
        pv = cumulativeMultiplier.mulu(baseValue);
        console.log("pv finished:", pv);

        int128 ltv64 = ABDKMath64x64.fromUInt(rankBaseLtv)
            .mul(liquidity)
            .mul(shock)
            .mul(volAdj)
            .mul(omega);
        if (extraDiscountBps > 0) {
            ltv64 = ltv64.mul(ABDKMath64x64.divu(BPS_DENOMINATOR - extraDiscountBps, BPS_DENOMINATOR));
        }
        ltvBps = ABDKMath64x64.toUInt(ltv64);
        if (ltvBps > BPS_DENOMINATOR) {
            ltvBps = BPS_DENOMINATOR;
        }
    }
}
