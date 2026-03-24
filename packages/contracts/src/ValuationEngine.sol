// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "./VestingRegistry.sol";
import "./governance/VestraAccessControl.sol";

interface IPreTGEOracle {
    function getLatestPrice(address token) external view returns (uint256 price, uint8 decimals, uint256 updatedAt);
}

interface IOpenClawLighthouse {
    function getConsensusOmega(address token) external view returns (uint256);
}

contract ValuationEngine is VestraAccessControl {
    using ABDKMath64x64 for int128;

    VestingRegistry public registry;
    mapping(address => address) public tokenPriceFeeds;
    mapping(address => address) public secondaryPriceFeeds;
    uint256 public deviationThresholdBps = 1000; // 10%
    uint256 public riskFreeRate = 5; // percent, 5 = 5%
    uint256 public volatility = 50; // percent, 50 = 50%
    uint256 public maxPriceAge = 1 hours;
    uint256 public twapInterval = 1 hours; // Default TWAP window
    uint256 public maxTwapLookback = 20;
    
    uint256 public ewmaAlpha = 2000; // 20% alpha
    mapping(address => uint256) public tokenEWMA;
    mapping(address => uint256) public lastEWMATimestamp;

    bool public adminTimelockEnabled;
    uint256 public adminTimelockDelay = 1 days;
    
    address public coprocessor;
    mapping(address => uint256) public tokenOmegaBps; // 10000 = 100%
    
    address public preTGEOracle;
    mapping(address => uint256) public tokenMaxLiquidityBorrow; // in 1e18 USD
    mapping(address => uint256) public flashPumpCooldownUntil;
    mapping(address => uint256) public preTGECaps;

    address public sequencerUptimeFeed;
    uint256 public gracePeriodTime = 3600; 
    
    mapping(address => bool) public isQuarantined;

    struct PendingTokenFeed {
        address feed;
        uint256 executeAfter;
        bool exists;
    }

    mapping(address => PendingTokenFeed) public pendingTokenFeeds;

    struct TokenPriceBounds {
        uint256 ath;
        uint256 atl;
        uint8 decimals;
        bool set;
    }
    mapping(address => TokenPriceBounds) public tokenPriceBounds;
    uint256 public drawdownPenaltyPerBps = 50;
    uint256 public maxDrawdownPenaltyBps = 2000;
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
    event CoprocessorUpdated(address indexed coprocessor);
    event OmegaUpdated(address indexed token, uint256 omegaBps);
    event TokenMaxLiquidityBorrowUpdated(address indexed token, uint256 maxBorrowUsd);
    event FlashPumpCooldownSet(address indexed token, uint256 cooldownUntil);
    event FlashPumpCooldownCleared(address indexed token);
    event PreTGECapUpdated(address indexed token, uint256 maxProtocolExposure);
    event SequencerUptimeFeedUpdated(address indexed feed);
    event GracePeriodTimeUpdated(uint256 timeSeconds);
    event TokenQuarantined(address indexed token, string reason);

    constructor(address _registry, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_registry != address(0), "registry=0");
        registry = VestingRegistry(_registry);
    }

    function setRegistry(address _registry) external onlyGovernor {
        require(_registry != address(0), "registry=0");
        registry = VestingRegistry(_registry);
        emit RegistryUpdated(_registry);
    }

    function setTokenPriceFeed(address token, address feed) external onlyGovernor {
        require(!adminTimelockEnabled, "timelocked");
        _applyTokenPriceFeed(token, feed);
    }

    function setSecondaryPriceFeed(address token, address feed) external onlyGovernor {
        require(token != address(0), "token=0");
        secondaryPriceFeeds[token] = feed;
    }

    function setDeviationThresholdBps(uint256 thresholdBps) external onlyGovernor {
        require(thresholdBps <= 5000, "threshold too high");
        deviationThresholdBps = thresholdBps;
    }

    function queueTokenPriceFeed(address token, address feed) external onlyGovernor {
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

    function executeQueuedTokenPriceFeed(address token) external onlyGovernor {
        PendingTokenFeed memory pending = pendingTokenFeeds[token];
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingTokenFeeds[token];
        _applyTokenPriceFeed(token, pending.feed);
    }

    address public openClawLighthouse;

    function setOpenClawLighthouse(address _lighthouse) external onlyGovernor {
        openClawLighthouse = _lighthouse;
    }
    
    function setCoprocessor(address _coprocessor) external onlyGovernor {
        coprocessor = _coprocessor;
        _grantRole(GUARDIAN_ROLE, _coprocessor);
        emit CoprocessorUpdated(_coprocessor);
    }
    
    mapping(address => uint256) public hardLTVCapBps; 
    uint256 public globalMaxOmegaBps = 10000; 

    event HardLTVCapUpdated(address indexed token, uint256 capBps);
    event GlobalMaxOmegaUpdated(uint256 capBps);

    function setHardLTVCap(address token, uint256 capBps) external onlyGovernor {
        require(capBps <= 10000, "invalid cap");
        hardLTVCapBps[token] = capBps;
        emit HardLTVCapUpdated(token, capBps);
    }

    function setGlobalMaxOmega(uint256 capBps) external onlyGovernor {
        require(capBps <= 10000, "invalid cap");
        globalMaxOmegaBps = capBps;
        emit GlobalMaxOmegaUpdated(capBps);
    }

    function updateOmega(address token, uint256 omegaBps) external onlyGuardian {
        uint256 finalOmega = omegaBps > globalMaxOmegaBps ? globalMaxOmegaBps : omegaBps;
        uint256 hardCap = hardLTVCapBps[token];
        if (hardCap > 0 && finalOmega > hardCap) {
            finalOmega = hardCap;
        }
        tokenOmegaBps[token] = finalOmega;
        emit OmegaUpdated(token, finalOmega);
    }
    
    function setPreTGEOracle(address _oracle) external onlyGovernor {
        preTGEOracle = _oracle;
    }

    function setTokenMaxLiquidityBorrow(address token, uint256 maxBorrowUsd) external {
        require(msg.sender == coprocessor || hasRole(GOVERNOR_ROLE, msg.sender), "unauthorized");
        require(token != address(0), "token=0");
        tokenMaxLiquidityBorrow[token] = maxBorrowUsd;
        emit TokenMaxLiquidityBorrowUpdated(token, maxBorrowUsd);
    }

    function reportFlashPump(address token, uint256 cooldownDuration) external {
        require(msg.sender == coprocessor || hasRole(GOVERNOR_ROLE, msg.sender), "unauthorized");
        require(token != address(0), "token=0");
        require(cooldownDuration > 0 && cooldownDuration <= 7 days, "bad duration");
        uint256 cooldownUntil = block.timestamp + cooldownDuration;
        flashPumpCooldownUntil[token] = cooldownUntil;
        emit FlashPumpCooldownSet(token, cooldownUntil);
    }

    function clearFlashPumpCooldown(address token) external {
        require(msg.sender == coprocessor || hasRole(GOVERNOR_ROLE, msg.sender), "unauthorized");
        delete flashPumpCooldownUntil[token];
        emit FlashPumpCooldownCleared(token);
    }

    function setPreTGECap(address token, uint256 maxExposureUsd) external {
        require(hasRole(GOVERNOR_ROLE, msg.sender) || msg.sender == coprocessor, "not owner or coprocessor");
        preTGECaps[token] = maxExposureUsd;
        emit PreTGECapUpdated(token, maxExposureUsd);
    }

    function isFlashPumpFrozen(address token) public view returns (bool) {
        return flashPumpCooldownUntil[token] > block.timestamp;
    }
    
    function quarantineToken(address token, bool status, string calldata reason) external onlyGovernor {
        isQuarantined[token] = status;
        if (status) {
            emit TokenQuarantined(token, reason);
        }
    }

    function setSequencerUptimeFeed(address feed) external onlyGovernor {
        sequencerUptimeFeed = feed;
        emit SequencerUptimeFeedUpdated(feed);
    }

    function setGracePeriodTime(uint256 timeSeconds) external onlyGovernor {
        gracePeriodTime = timeSeconds;
        emit GracePeriodTimeUpdated(timeSeconds);
    }

    function checkSequencerActive() public view {
        if (sequencerUptimeFeed != address(0)) {
            (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(sequencerUptimeFeed).latestRoundData();
            require(answer == 0, "L2 Sequencer is down");
            require(block.timestamp - updatedAt > gracePeriodTime, "Sequencer grace period active");
        }
    }

    function setAdminTimelockConfig(bool enabled, uint256 delaySeconds) external onlyGovernor {
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

    function setRiskFreeRate(uint256 newRate) external onlyGovernor {
        require(newRate >= 1 && newRate <= 20, "rate out of range");
        riskFreeRate = newRate;
    }

    function setVolatility(uint256 newVol) external onlyGovernor {
        require(newVol <= 100, "vol too high");
        volatility = newVol;
    }

    function setMaxPriceAge(uint256 newMaxPriceAge) external onlyGovernor {
        require(newMaxPriceAge > 0 && newMaxPriceAge <= 365 days, "bad max age");
        maxPriceAge = newMaxPriceAge;
    }

    function setTokenPriceBounds(
        address token,
        uint256 ath,
        uint256 atl,
        uint8 boundsDecimals
    ) external onlyGovernor {
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

    function clearTokenPriceBounds(address token) external onlyGovernor {
        require(token != address(0), "token=0");
        delete tokenPriceBounds[token];
        emit TokenPriceBoundsUpdated(token, 0, 0, 0);
    }

    function setDrawdownParams(uint256 penaltyPerBps, uint256 maxPenaltyBps) external onlyGovernor {
        require(penaltyPerBps <= 1000, "penalty too high");
        require(maxPenaltyBps <= 5000, "max penalty too high");
        drawdownPenaltyPerBps = penaltyPerBps;
        maxDrawdownPenaltyBps = maxPenaltyBps;
        emit DrawdownParamsUpdated(penaltyPerBps, maxPenaltyBps);
    }

    function setRangeVolWeight(uint256 weightBps) external onlyGovernor {
        require(weightBps <= 1000, "weight too high");
        rangeVolWeightBps = weightBps;
        emit RangeVolWeightUpdated(weightBps);
    }

    function setTwapInterval(uint256 newInterval) external onlyGovernor {
        require(newInterval >= 1 && newInterval <= 7 days, "interval out of range");
        twapInterval = newInterval;
    }

    function setMaxTwapLookback(uint256 newMax) external onlyGovernor {
        require(newMax >= 5 && newMax <= 100, "lookback out of range");
        maxTwapLookback = newMax;
    }

    function setEWMAAlpha(uint256 newAlphaBps) external onlyGovernor {
        require(newAlphaBps > 0 && newAlphaBps <= 10000, "alpha out of range");
        ewmaAlpha = newAlphaBps;
    }

    function updateEWMA(address token) public returns (uint256) {
        address feedAddress = tokenPriceFeeds[token];
        if (feedAddress == address(0)) return 0;
        
        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);
        (, int256 latestAnswer, , uint256 latestUpdatedAt, ) = feed.latestRoundData();
        
        if (latestAnswer <= 0 || isQuarantined[token]) return 0;

        uint256 currentPrice = uint256(latestAnswer);
        uint256 previousEWMAPrice = tokenEWMA[token];

        if (previousEWMAPrice == 0) {
            tokenEWMA[token] = currentPrice;
            lastEWMATimestamp[token] = latestUpdatedAt;
            return currentPrice;
        }

        uint256 newEWMA = (currentPrice * ewmaAlpha + previousEWMAPrice * (BPS_DENOMINATOR - ewmaAlpha)) / BPS_DENOMINATOR;
        tokenEWMA[token] = newEWMA;
        lastEWMATimestamp[token] = latestUpdatedAt;

        return newEWMA;
    }

    function _readValidatedPrice(
        address token
    ) internal view returns (uint256 price, uint8 decimals) {
        checkSequencerActive(); 
        address primaryFeed = tokenPriceFeeds[token];
        
        if (primaryFeed == address(0)) {
            require(preTGEOracle != address(0), "no price feed");
            uint256 updatedAt;
            (price, decimals, updatedAt) = IPreTGEOracle(preTGEOracle).getLatestPrice(token);
            require(block.timestamp >= updatedAt, "future round");
            return (price, decimals);
        }
        
        return _fetchTWAP(token, primaryFeed);
    }

    function _fetchTWAP(address token, address feedAddress) internal view returns (uint256 price, uint8 decimals) {
        AggregatorV3Interface feed = AggregatorV3Interface(feedAddress);
        (uint80 latestRoundId, int256 latestAnswer, , uint256 latestUpdatedAt, ) = feed.latestRoundData();
        
        decimals = feed.decimals();
        if (latestAnswer <= 0 || isQuarantined[token]) {
            return (0, decimals);
        }
        
        require(latestUpdatedAt > 0 && block.timestamp >= latestUpdatedAt, "bad timestamp");
        require(block.timestamp - latestUpdatedAt <= maxPriceAge, "stale price");

        uint256 cumulativePriceTime = 0;
        uint256 totalWeightTime = 0;
        uint80 currentRoundId = latestRoundId;
        uint256 currentUpdatedAt = latestUpdatedAt;
        int256 currentAnswer = latestAnswer;
        uint256 targetTime = block.timestamp > twapInterval ? block.timestamp - twapInterval : 0;
        
        uint256 lookups = 0;
        while (currentUpdatedAt > targetTime && currentRoundId > 0 && lookups < maxTwapLookback) {
            lookups++;
            uint80 nextRoundId = currentRoundId - 1;
            try feed.getRoundData(nextRoundId) returns (uint80 roundId, int256 answer, uint256, uint256 updatedAt, uint80) {
                if (updatedAt < targetTime || updatedAt == 0 || answer <= 0) {
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
                break;
            }
        }
        require(lookups >= 1, "insufficient oracle rounds");
        require(totalWeightTime > (twapInterval / 2), "insufficient TWAP depth");
        
        uint256 twapPrice = cumulativePriceTime / totalWeightTime;
        uint256 spotPrice = uint256(latestAnswer);

        uint256 previousEWMA = tokenEWMA[token];
        if (previousEWMA > 0) {
            uint256 inlineEWMA = (spotPrice * ewmaAlpha + previousEWMA * (BPS_DENOMINATOR - ewmaAlpha)) / BPS_DENOMINATOR;
            price = spotPrice < twapPrice ? spotPrice : twapPrice;
            price = inlineEWMA < price ? inlineEWMA : price;
        } else {
            price = twapPrice < spotPrice ? twapPrice : spotPrice;
        }
    }

    function computeDPV(
        uint256 quantity,
        address token,
        uint256 unlockTime,
        address vestingContract
    ) public view returns (uint256 pv, uint256 ltvBps) {
        require(quantity > 0, "quantity=0");
        require(unlockTime > block.timestamp, "already unlocked");
        require(!isFlashPumpFrozen(token), "token frozen");

        uint8 rank = registry.getRank(vestingContract);
        require(rank > 0 && rank <= 3, "unverified contract");

        (uint256 price, uint8 decimals) = _readValidatedPrice(token);
        uint8 tokenDecimals = IERC20Metadata(token).decimals();

        uint256 baseValue = (quantity * price * 1e6) / (10 ** uint256(tokenDecimals)) / (10 ** uint256(decimals));

        uint256 rankBaseLtv = rank == 1 ? 5000 : (rank == 2 ? 3500 : 2000);
        uint256 rankRiskFreeRate = rank == 1 ? 2 : (rank == 2 ? 5 : 10);

        uint256 timeToUnlock = unlockTime - block.timestamp;
        int128 yearsToUnlock = ABDKMath64x64.divu(timeToUnlock, 365 days);
        int128 rate = ABDKMath64x64.divu(rankRiskFreeRate, 100);
        
        int128 discount;
        if (yearsToUnlock == 0) {
            discount = ABDKMath64x64.fromInt(1);
        } else {
            int128 rateNeg = ABDKMath64x64.neg(rate);
            int128 product = rateNeg.mul(yearsToUnlock);
            discount = ABDKMath64x64.exp(product);
        }

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

        int128 liquidity = ABDKMath64x64.divu(9, 10); // 0.9
        int128 shock = ABDKMath64x64.divu(95, 100); // 0.95
        int128 volPenalty = ABDKMath64x64.divu(effectiveVol, 200); // 0.5 * vol
        int128 volAdj = ABDKMath64x64.sub(ABDKMath64x64.fromInt(1), volPenalty);
        if (volAdj < 0) volAdj = ABDKMath64x64.fromInt(0);
        
        uint256 currentOmega = tokenOmegaBps[token];
        if (currentOmega == 0) currentOmega = 10000;
        if (currentOmega > globalMaxOmegaBps) currentOmega = globalMaxOmegaBps;
        uint256 hardCap = hardLTVCapBps[token];
        if (hardCap > 0 && currentOmega > hardCap) currentOmega = hardCap;

        if (openClawLighthouse != address(0)) {
            uint256 consensusOmega = IOpenClawLighthouse(openClawLighthouse).getConsensusOmega(token);
            if (currentOmega > consensusOmega) currentOmega = consensusOmega;
        }

        int128 omega = ABDKMath64x64.divu(currentOmega, 10000);
        int128 cumulativeMultiplier = discount.mul(liquidity).mul(shock).mul(volAdj).mul(omega);
        
        if (extraDiscountBps > 0) {
            cumulativeMultiplier = cumulativeMultiplier.mul(ABDKMath64x64.divu(BPS_DENOMINATOR - extraDiscountBps, BPS_DENOMINATOR));
        }
        
        pv = cumulativeMultiplier.mulu(baseValue);

        int128 ltv64 = ABDKMath64x64.fromUInt(rankBaseLtv).mul(liquidity).mul(shock).mul(volAdj).mul(omega);
        if (extraDiscountBps > 0) {
            ltv64 = ltv64.mul(ABDKMath64x64.divu(BPS_DENOMINATOR - extraDiscountBps, BPS_DENOMINATOR));
        }
        ltvBps = ABDKMath64x64.toUInt(ltv64);
        if (ltvBps > BPS_DENOMINATOR) ltvBps = BPS_DENOMINATOR;

        uint256 maxLiqBorrow = tokenMaxLiquidityBorrow[token];
        if (maxLiqBorrow > 0 && pv > maxLiqBorrow) {
            ltvBps = (ltvBps * maxLiqBorrow) / pv;
            pv = maxLiqBorrow;
        }
    }

    function getTWAP(address token) public view returns (uint256) {
        address feed = tokenPriceFeeds[token];
        if (feed == address(0)) return 0;
        (uint256 price, ) = _readValidatedPrice(token);
        return price;
    }
}
