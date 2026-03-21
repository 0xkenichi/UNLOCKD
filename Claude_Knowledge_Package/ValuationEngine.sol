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
    /// @notice Max number of Chainlink rounds to walk back when calculating TWAP.
    /// Configurable so operators can tune for chains with high-frequency oracles.
    uint256 public maxTwapLookback = 20;
    
    // V6.0 Citadel - EWMA Configuration
    uint256 public ewmaAlpha = 2000; // 20% alpha (i.e. 0.2 weight on current price, 0.8 on historical EWMA)
    mapping(address => uint256) public tokenEWMA;
    mapping(address => uint256) public lastEWMATimestamp;

    bool public adminTimelockEnabled;
    uint256 public adminTimelockDelay = 1 days;
    
    // V4.0 AI Watcher Engine Integration
    address public coprocessor;
    mapping(address => uint256) public tokenOmegaBps; // 10000 = 100%
    
    // V4.0 Pre-TGE Oracle
    address public preTGEOracle;

    // V5.0 Liquidity Depth Bounding
    // Max notional USD value (18 decimals) that can be borrowed against a given token,
    // based on the actual DEX liquidity depth rather than the spot price alone.
    // Set by owner / coprocessor after reading Uniswap V3 / DEX pool depth.
    // 0 = unrestricted (use with caution).
    mapping(address => uint256) public tokenMaxLiquidityBorrow; // in 1e18 USD

    // V5.0 Flash Pump Circuit Breaker
    // If Omega detects a suspicious spike, it flags the token with a cooldown timestamp.
    // New loans against that token are blocked until block.timestamp > flashPumpCooldownUntil[token].
    mapping(address => uint256) public flashPumpCooldownUntil;

    // V6.0 Citadel: Pre-TGE Global Exposure Caps
    // Max protocol-wide exposure to unlisted tokens
    mapping(address => uint256) public preTGECaps;

    // V6.0 Citadel: L2 Sequencer Halt Grace Period
    // Chainlink Sequencer Uptime feeds (0 = uptime on L2, 1 = downtime)
    address public sequencerUptimeFeed;
    uint256 public gracePeriodTime = 3600; // 1 hour buffer after sequencer comes back online
    
    // V6.0 Citadel: Regulatory Oracle Nuke Quarantine State
    // If an oracle suddenly returns 0 (e.g., LUNA collapse, regulatory delisting),
    // the asset is permanently quarantined to prevent immediate $0 liquidations, 
    // forcing a graceful OTC Treasury Buyout or a restructuring.
    mapping(address => bool) public isQuarantined;

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

    // V5.0 Events
    event TokenMaxLiquidityBorrowUpdated(address indexed token, uint256 maxBorrowUsd);
    event FlashPumpCooldownSet(address indexed token, uint256 cooldownUntil);
    event FlashPumpCooldownCleared(address indexed token);

    // V6.0 Events
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
    
    // --- V4.0 AI Watcher Endpoints ---
    function setCoprocessor(address _coprocessor) external onlyGovernor {
        coprocessor = _coprocessor;
        _grantRole(GUARDIAN_ROLE, _coprocessor);
        emit CoprocessorUpdated(_coprocessor);
    }
    
    // V7.0 Safeguards: Hard LTV Caps and Global Ceilings
    mapping(address => uint256) public hardLTVCapBps; // Immutable fallback maximum
    uint256 public globalMaxOmegaBps = 10000; // 100% ceiling

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
        
        // Enforce Global Ceiling
        uint256 finalOmega = omegaBps > globalMaxOmegaBps ? globalMaxOmegaBps : omegaBps;
        
        // Enforce Token-Specific Hard Cap if set
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

    // --- V5.0 Liquidity Depth Bounding ---
    /// @notice Set the maximum USD notional (18 decimals) that can be originated against a token.
    /// This value should reflect the realistic slippage-adjusted exit value of the DEX pool depth.
    /// Set to 0 to remove the cap (not recommended for illiquid assets).
    function setTokenMaxLiquidityBorrow(address token, uint256 maxBorrowUsd) external {
        require(msg.sender == coprocessor || hasRole(GOVERNOR_ROLE, msg.sender), "unauthorized");
        require(token != address(0), "token=0");
        tokenMaxLiquidityBorrow[token] = maxBorrowUsd;
        emit TokenMaxLiquidityBorrowUpdated(token, maxBorrowUsd);
    }

    // --- V5.0 Flash Pump Pre-Crime Circuit Breaker ---
    /// @notice Called by the Omega AI coprocessor when it detects a suspicious price spike.
    /// Blocks new loan origination against the token until the cooldown expires.
    /// @param token The affected collateral token.
    /// @param cooldownDuration Duration in seconds to freeze new loans (e.g. 48 hours).
    function reportFlashPump(address token, uint256 cooldownDuration) external {
        require(msg.sender == coprocessor || hasRole(GOVERNOR_ROLE, msg.sender), "unauthorized");
        require(token != address(0), "token=0");
        require(cooldownDuration > 0 && cooldownDuration <= 7 days, "bad duration");
        uint256 cooldownUntil = block.timestamp + cooldownDuration;
        flashPumpCooldownUntil[token] = cooldownUntil;
        emit FlashPumpCooldownSet(token, cooldownUntil);
    }

    /// @notice Clear a flash pump cooldown (e.g. after manual review confirms price is legitimate).
    function clearFlashPumpCooldown(address token) external {
        require(msg.sender == coprocessor || hasRole(GOVERNOR_ROLE, msg.sender), "unauthorized");
        delete flashPumpCooldownUntil[token];
        emit FlashPumpCooldownCleared(token);
    }

    /// @notice View function: returns true if a token is currently flash-pump frozen.
    function setPreTGECap(address token, uint256 maxExposureUsd) external {
        require(hasRole(GOVERNOR_ROLE, msg.sender) || msg.sender == coprocessor, "not owner or coprocessor");
        preTGECaps[token] = maxExposureUsd;
        emit PreTGECapUpdated(token, maxExposureUsd);
    }

    function isFlashPumpFrozen(address token) public view returns (bool) {
        return flashPumpCooldownUntil[token] > block.timestamp;
    }
    // ---------------------------------
    
    // V6.0 Citadel
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

    /**
     * @notice Checks if the sequencer is up and the grace period has passed.
     * Reverts if sequencer is down or grace period is active to halt liquidations.
     */
    function checkSequencerActive() public view {
        if (sequencerUptimeFeed != address(0)) {
            (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(sequencerUptimeFeed).latestRoundData();
            
            // 0 = Sequencer is up, 1 = Sequencer is down
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
        // Lower bound of 1% prevents disabling time-discounting entirely (0% = no DPV penalty for long locks)
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

    /// Set all-time high and all-time low for a token (same decimals as the token's price feed).
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
        // Minimum 1 hour: prevents disabling TWAP protection via a trivially small window.
        require(newInterval >= 1 hours && newInterval <= 7 days, "interval out of range");
        twapInterval = newInterval;
    }

    /// @notice Set the maximum number of Chainlink rounds to walk back for TWAP.
    /// Increase on chains with high oracle cadence; decrease to save gas on slower chains.
    function setMaxTwapLookback(uint256 newMax) external onlyGovernor {
        require(newMax >= 5 && newMax <= 100, "lookback out of range");
        maxTwapLookback = newMax;
    }

    /// @notice Set the smoothing factor (alpha) for the EWMA explicitly.
    function setEWMAAlpha(uint256 newAlphaBps) external onlyGovernor {
        require(newAlphaBps > 0 && newAlphaBps <= 10000, "alpha out of range");
        ewmaAlpha = newAlphaBps;
    }

    /// @notice State-mutating function to update EWMA for a token. Usually called by a keeper or implicitly.
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
        checkSequencerActive(); // V6.0 Citadel - Prevent pricing if Sequencer is down
        
        address primaryFeed = tokenPriceFeeds[token];
        address secondaryFeed = secondaryPriceFeeds[token];
        
        // V4.0 Pre-TGE Fallback (if no primary)
        if (primaryFeed == address(0)) {
            require(preTGEOracle != address(0), "no price feed and no preTGE oracle");
            uint256 updatedAt;
            (price, decimals, updatedAt) = IPreTGEOracle(preTGEOracle).getLatestPrice(token);
            require(block.timestamp >= updatedAt, "future round");
            return (price, decimals);
        }
        
        // --- Primary Oracle Processing (with TWAP) ---
        (uint256 primaryPrice, uint8 primaryDecimals) = _fetchTWAP(token, primaryFeed);
        
        // --- Secondary Oracle Processing (Optional) ---
        if (secondaryFeed != address(0)) {
            (uint256 secondaryPrice, uint8 secondaryDecimals) = _fetchTWAP(token, secondaryFeed);
            
            // Normalize decimals for comparison
            uint256 normalizedPrimary = primaryPrice;
            uint256 normalizedSecondary = secondaryPrice;
            if (primaryDecimals < secondaryDecimals) {
                normalizedPrimary *= (10 ** (secondaryDecimals - primaryDecimals));
            } else if (primaryDecimals > secondaryDecimals) {
                normalizedSecondary *= (10 ** (primaryDecimals - secondaryDecimals));
            }

            // Deviation Check
            uint256 diff = normalizedPrimary > normalizedSecondary ? 
                normalizedPrimary - normalizedSecondary : 
                normalizedSecondary - normalizedPrimary;
            
            uint256 maxDiff = (normalizedPrimary * deviationThresholdBps) / BPS_DENOMINATOR;
            require(diff <= maxDiff, "Oracle Deviation Too High");

            // Conservative: return the minimum
            price = primaryPrice < secondaryPrice ? primaryPrice : secondaryPrice;
            decimals = primaryDecimals; // Return primary decimals (assuming standard 8 or 18)
        } else {
            price = primaryPrice;
            decimals = primaryDecimals;
        }

        return (price, decimals);
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

        // Smoothing overlay
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

        // V5.0 Flash Pump Circuit Breaker: reject valuation if Omega flagged this token
        require(!isFlashPumpFrozen(token), "token frozen: flash pump detected");

        uint8 rank = registry.getRank(vestingContract);
        require(rank > 0 && rank <= 3, "unverified contract");

        (uint256 price, uint8 decimals) = _readValidatedPrice(token);
        uint8 tokenDecimals = IERC20Metadata(token).decimals();

        // Normalize to USDC (1e6)
        // baseValue = (quantity / 10^tokenDecimals) * (price / 10^priceDecimals) * 1e6
        uint256 baseValue = (quantity * price * 1e6) / (10 ** uint256(tokenDecimals)) / (10 ** uint256(decimals));

        // Core Risk Matrix based on Rank
        // Rank 1 (Flagship): Base LTV 50%, Risk Free Rate 2%
        // Rank 2 (Premium): Base LTV 35%, Risk Free Rate 5%
        // Rank 3 (Standard): Base LTV 20%, Risk Free Rate 10%
        uint256 rankBaseLtv = rank == 1 ? 5000 : (rank == 2 ? 3500 : 2000);
        uint256 rankRiskFreeRate = rank == 1 ? 2 : (rank == 2 ? 5 : 10);

        // Time discount: exp(-rate * years)
        // This penalizes long lock-ups correctly — a 3-year vest at 10% risk-free rate
        // discounts the position to ~0.74x, protecting against over-collateralization.
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

        // Monte Carlo-inspired conservatism (use effectiveVol when ATH/ATL set)
        int128 liquidity = ABDKMath64x64.divu(9, 10); // 0.9
        int128 shock = ABDKMath64x64.divu(95, 100); // 0.95
        int128 volPenalty = ABDKMath64x64.divu(effectiveVol, 200); // 0.5 * vol
        int128 volAdj = ABDKMath64x64.sub(ABDKMath64x64.fromInt(1), volPenalty);
        if (volAdj < 0) {
            volAdj = ABDKMath64x64.fromInt(0);
        }
        
        // V4.0 AI Watcher Omega Multiplier
        // V7.0 Hardened: Clamp AI-driven Omega by protocol-set hard caps
        uint256 currentOmega = tokenOmegaBps[token];
        if (currentOmega == 0) {
            currentOmega = 10000;
        }
        
        // Apply Global and Token-Specific Hard Caps
        if (currentOmega > globalMaxOmegaBps) currentOmega = globalMaxOmegaBps;
        uint256 hardCap = hardLTVCapBps[token];
        if (hardCap > 0 && currentOmega > hardCap) currentOmega = hardCap;

        // V8.0 OpenClaw Integration: Social Consensus Ceiling
        if (openClawLighthouse != address(0)) {
            uint256 consensusOmega = IOpenClawLighthouse(openClawLighthouse).getConsensusOmega(token);
            if (currentOmega > consensusOmega) {
                currentOmega = consensusOmega;
            }
        }

        int128 omega = ABDKMath64x64.divu(currentOmega, 10000);

        int128 cumulativeMultiplier = discount.mul(liquidity).mul(shock).mul(volAdj).mul(omega);
        
        if (extraDiscountBps > 0) {
            cumulativeMultiplier = cumulativeMultiplier.mul(ABDKMath64x64.divu(BPS_DENOMINATOR - extraDiscountBps, BPS_DENOMINATOR));
        }
        
        pv = cumulativeMultiplier.mulu(baseValue);

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

        // V5.0 Liquidity Depth Bounding:
        // Cap the present value at the maximum USD liquidity depth set by the protocol.
        // This prevents over-valuing an illiquid position purely on a spot/TWAP price.
        // If the token has a liquidity cap and the computed PV exceeds it, clamp PV to the cap.
        uint256 maxLiqBorrow = tokenMaxLiquidityBorrow[token];
        if (maxLiqBorrow > 0 && pv > maxLiqBorrow) {
            // Re-derive ltvBps proportionally to the clamped PV
            // so the loan amount doesn't exceed the genuine DEX liquidity exit value.
            ltvBps = (ltvBps * maxLiqBorrow) / pv;
            pv = maxLiqBorrow;
        }
    }
}
