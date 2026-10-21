// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "./VestingRegistry.sol";
import "./governance/VestraAccessControl.sol";

interface IPreTGEOracle {
    function getLatestPrice(address token) external view returns (uint256 price, uint8 decimals, uint256 updatedAt);
}

/**
 * @title  ValuationEngine
 * @notice Prices time-locked collateral (dDPV). All USD values are 6-decimal (USDC units).
 *
 *           P   = min(spot, TWAP, EWMA)                      (live tokens)
 *           P   = syntheticPrice · (1 − preTGEHaircut)        (pre-TGE tokens)
 *           pv  = Q · P · e^(−r_rank·T) · (1 − σ/2) · (1 − drawdownPenalty) · Ω
 *           ltv = rankBaseLtv, capped by the token's hard LTV cap
 *
 *         `computeDPV` is the origination view: it applies Ω and reverts on frozen or
 *         quarantined tokens. `liquidationValue` is the health view: it ignores Ω,
 *         freezes and quarantine so that a risk control can never block liquidations.
 */
contract ValuationEngine is VestraAccessControl {
    using ABDKMath64x64 for int128;

    uint256 public constant BPS = 10_000;
    uint256 public constant MIN_MAX_PRICE_AGE = 30 minutes;

    VestingRegistry public registry;
    address public preTGEOracle;

    mapping(address => address) public tokenPriceFeeds;

    // ── Risk parameters ──────────────────────────────────────────────────────
    uint256 public volatility = 50;          // percent, clamped to [0, 100]
    uint256 public maxPriceAge = 1 hours;
    uint256 public twapInterval = 1 hours;
    uint256 public maxTwapLookback = 100;
    uint256 public ewmaAlphaBps = 2000;
    uint256 public ewmaMaxAge = 1 days;      // EWMA older than this is ignored
    uint256 public preTGEHaircutBps = 9000;  // D_uncertainty: 90% haircut by default
    uint256 public preTGEMaxAge = 7 days;

    /// rank → base LTV (bps) and discount rate (bps per year)
    uint256[4] public rankBaseLtvBps = [uint256(0), 5000, 3500, 2000];
    uint256[4] public rankDiscountRateBps = [uint256(0), 200, 500, 1000];

    mapping(address => uint256) public tokenEWMA;
    mapping(address => uint256) public lastEWMARoundTime;

    /// Ω per token, bps. `omegaSet` distinguishes "unset" (Ω = 100%) from an explicit 0.
    mapping(address => uint256) public tokenOmegaBps;
    mapping(address => bool) public omegaSet;
    mapping(address => uint256) public hardLTVCapBps;
    mapping(address => uint256) public tokenMaxBorrowUsd; // 6-dec cap on pv for one loan, 0 = none
    mapping(address => uint256) public frozenUntil;
    mapping(address => bool) public isQuarantined;

    struct TokenPriceBounds {
        uint256 ath;
        uint256 atl;
        uint8 decimals;
        bool set;
    }
    mapping(address => TokenPriceBounds) public tokenPriceBounds;
    uint256 public drawdownPenaltyPerBps = 50;  // penalty bps per 100 bps of drawdown from ATH
    uint256 public maxDrawdownPenaltyBps = 2000;
    uint256 public rangeVolWeightBps = 2000; // 20% of the ATH/ATL range ratio is added to σ

    address public sequencerUptimeFeed;
    uint256 public sequencerGracePeriod = 1 hours;

    event RegistryUpdated(address indexed registry);
    event PreTGEOracleUpdated(address indexed oracle);
    event TokenPriceFeedUpdated(address indexed token, address indexed feed);
    event OmegaUpdated(address indexed token, uint256 omegaBps);
    event HardLTVCapUpdated(address indexed token, uint256 capBps);
    event TokenMaxBorrowUpdated(address indexed token, uint256 maxBorrowUsd);
    event TokenFrozen(address indexed token, uint256 until);
    event TokenQuarantined(address indexed token, bool status, string reason);
    event TokenPriceBoundsUpdated(address indexed token, uint256 ath, uint256 atl, uint8 decimals);
    event RiskParamsUpdated(
        address indexed token,
        uint256 ewmaPrice,
        uint256 lambda,
        uint256 v30d,
        uint256 v90d,
        uint256 vImplied,
        uint256 dexLiquidityUsd,
        uint256 tokenPremiumBps,
        uint256 liquidityPremiumBps
    );
    event ParamUpdated(bytes32 indexed name, uint256 value);

    constructor(address _registry, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_registry != address(0), "registry=0");
        registry = VestingRegistry(_registry);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Governor configuration (deploy the governor behind a TimelockController)
    // ─────────────────────────────────────────────────────────────────────────

    function setRegistry(address _registry) external onlyGovernor {
        require(_registry != address(0), "registry=0");
        registry = VestingRegistry(_registry);
        emit RegistryUpdated(_registry);
    }

    function setPreTGEOracle(address _oracle) external onlyGovernor {
        preTGEOracle = _oracle;
        emit PreTGEOracleUpdated(_oracle);
    }

    function setTokenPriceFeed(address token, address feed) external onlyGovernor {
        require(token != address(0), "token=0");
        tokenPriceFeeds[token] = feed;
        delete tokenEWMA[token];
        delete lastEWMARoundTime[token];
        emit TokenPriceFeedUpdated(token, feed);
    }

    function setHardLTVCap(address token, uint256 capBps) external onlyGovernor {
        require(capBps <= BPS, "invalid cap");
        hardLTVCapBps[token] = capBps;
        emit HardLTVCapUpdated(token, capBps);
    }

    function setTokenMaxBorrowUsd(address token, uint256 maxBorrowUsd) external onlyGovernor {
        tokenMaxBorrowUsd[token] = maxBorrowUsd;
        emit TokenMaxBorrowUpdated(token, maxBorrowUsd);
    }

    function quarantineToken(address token, bool status, string calldata reason) external onlyGovernor {
        isQuarantined[token] = status;
        emit TokenQuarantined(token, status, reason);
    }

    function setRankParams(uint8 rank, uint256 baseLtvBps, uint256 discountRateBps) external onlyGovernor {
        require(rank >= 1 && rank <= 3, "rank");
        require(baseLtvBps <= 8000, "ltv too high");
        require(discountRateBps <= 5000, "rate too high");
        rankBaseLtvBps[rank] = baseLtvBps;
        rankDiscountRateBps[rank] = discountRateBps;
        emit ParamUpdated(keccak256(abi.encodePacked("rank", rank)), baseLtvBps);
    }

    function setVolatility(uint256 newVol) external onlyGovernor {
        require(newVol <= 100, "vol too high");
        volatility = newVol;
        emit ParamUpdated("volatility", newVol);
    }

    function setMaxPriceAge(uint256 newMaxPriceAge) external onlyGovernor {
        require(newMaxPriceAge >= MIN_MAX_PRICE_AGE && newMaxPriceAge <= 7 days, "bad max age");
        maxPriceAge = newMaxPriceAge;
        emit ParamUpdated("maxPriceAge", newMaxPriceAge);
    }

    function setTwapParams(uint256 interval, uint256 lookback) external onlyGovernor {
        require(interval >= 5 minutes && interval <= 7 days, "interval");
        require(lookback >= 5 && lookback <= 500, "lookback");
        twapInterval = interval;
        maxTwapLookback = lookback;
        emit ParamUpdated("twapInterval", interval);
    }

    function setEWMAParams(uint256 alphaBps, uint256 maxAge) external onlyGovernor {
        require(alphaBps > 0 && alphaBps <= BPS, "alpha");
        require(maxAge >= 1 hours && maxAge <= 30 days, "maxAge");
        ewmaAlphaBps = alphaBps;
        ewmaMaxAge = maxAge;
        emit ParamUpdated("ewmaAlphaBps", alphaBps);
    }

    function setPreTGEParams(uint256 haircutBps, uint256 maxAge) external onlyGovernor {
        require(haircutBps >= 5000 && haircutBps < BPS, "haircut");
        require(maxAge >= 1 hours && maxAge <= 30 days, "maxAge");
        preTGEHaircutBps = haircutBps;
        preTGEMaxAge = maxAge;
        emit ParamUpdated("preTGEHaircutBps", haircutBps);
    }

    function setTokenPriceBounds(address token, uint256 ath, uint256 atl, uint8 boundsDecimals) external onlyGovernor {
        require(token != address(0), "token=0");
        require(atl > 0 && ath >= atl, "invalid bounds");
        tokenPriceBounds[token] = TokenPriceBounds(ath, atl, boundsDecimals, true);
        emit TokenPriceBoundsUpdated(token, ath, atl, boundsDecimals);
    }

    function clearTokenPriceBounds(address token) external onlyGovernor {
        delete tokenPriceBounds[token];
        emit TokenPriceBoundsUpdated(token, 0, 0, 0);
    }

    function setDrawdownParams(uint256 penaltyPerBps, uint256 maxPenaltyBps, uint256 rangeWeightBps) external onlyGovernor {
        require(penaltyPerBps <= 1000 && maxPenaltyBps <= 5000 && rangeWeightBps <= BPS, "too high");
        drawdownPenaltyPerBps = penaltyPerBps;
        maxDrawdownPenaltyBps = maxPenaltyBps;
        rangeVolWeightBps = rangeWeightBps;
        emit ParamUpdated("drawdown", penaltyPerBps);
    }

    function setSequencerUptimeFeed(address feed, uint256 gracePeriod) external onlyGovernor {
        require(gracePeriod <= 1 days, "grace");
        sequencerUptimeFeed = feed;
        sequencerGracePeriod = gracePeriod;
        emit ParamUpdated("sequencerGracePeriod", gracePeriod);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Guardian risk controls — affect NEW loans only
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Set Ω for `token`. 0 stops new credit against the token.
    function updateOmega(address token, uint256 omegaBps) external onlyGuardian {
        require(omegaBps <= BPS, "omega>1");
        tokenOmegaBps[token] = omegaBps;
        omegaSet[token] = true;
        emit OmegaUpdated(token, omegaBps);
    }

    function clearOmega(address token) external onlyGuardian {
        delete tokenOmegaBps[token];
        delete omegaSet[token];
        emit OmegaUpdated(token, BPS);
    }

    /// @notice Pause new origination against `token` for up to 7 days.
    function freezeToken(address token, uint256 duration) external onlyGuardian {
        require(duration <= 7 days, "max 7 days");
        frozenUntil[token] = block.timestamp + duration;
        emit TokenFrozen(token, block.timestamp + duration);
    }

    /// @notice Off-chain risk telemetry. Event only; does not change valuations.
    function updateRiskParams(
        address token,
        uint256 ewmaPrice,
        uint256 lambda,
        uint256 v30d,
        uint256 v90d,
        uint256 vImplied,
        uint256 dexLiquidityUsd,
        uint256 tokenPremiumBps,
        uint256 liquidityPremiumBps
    ) external onlyGuardian {
        emit RiskParamsUpdated(token, ewmaPrice, lambda, v30d, v90d, vImplied, dexLiquidityUsd, tokenPremiumBps, liquidityPremiumBps);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EWMA — permissionless, at most one update per oracle round
    // ─────────────────────────────────────────────────────────────────────────

    function updateEWMA(address token) external returns (uint256) {
        address feed = tokenPriceFeeds[token];
        if (feed == address(0)) return 0;
        (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(feed).latestRoundData();
        if (answer <= 0 || updatedAt <= lastEWMARoundTime[token]) return tokenEWMA[token];

        uint256 spot = uint256(answer);
        uint256 prev = tokenEWMA[token];
        uint256 next = prev == 0 ? spot : (spot * ewmaAlphaBps + prev * (BPS - ewmaAlphaBps)) / BPS;
        tokenEWMA[token] = next;
        lastEWMARoundTime[token] = updatedAt;
        return next;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Valuation views
    // ─────────────────────────────────────────────────────────────────────────

    function rankOf(address vestingContract) public view returns (uint8) {
        return registry.getRank(vestingContract);
    }

    /**
     * @notice Origination valuation.
     * @return pv     Discounted present value (6-dec USD), including Ω.
     * @return ltvBps Maximum loan-to-value for this collateral.
     */
    function computeDPV(uint256 quantity, address token, uint256 unlockTime, address vestingContract)
        public
        view
        returns (uint256 pv, uint256 ltvBps)
    {
        require(quantity > 0, "quantity=0");
        require(unlockTime > block.timestamp, "already unlocked");
        require(frozenUntil[token] <= block.timestamp, "token frozen");
        require(!isQuarantined[token], "quarantined");

        uint8 rank = rankOf(vestingContract);
        require(rank >= 1 && rank <= 3, "unverified contract");

        pv = _discountedValue(quantity, token, unlockTime, rank);
        pv = (pv * _omega(token)) / BPS;

        uint256 cap = tokenMaxBorrowUsd[token];
        if (cap > 0 && pv > cap) pv = cap;

        ltvBps = rankBaseLtvBps[rank];
        uint256 hardCap = hardLTVCapBps[token];
        if (hardCap > 0 && ltvBps > hardCap) ltvBps = hardCap;
    }

    /**
     * @notice Health-check valuation: the same discounting as origination but without Ω,
     *         freezes, quarantine or the per-loan cap. Works after unlock (T = 0).
     */
    function liquidationValue(uint256 quantity, address token, uint256 unlockTime, address vestingContract)
        external
        view
        returns (uint256)
    {
        uint8 rank = rankOf(vestingContract);
        if (rank == 0 || rank > 3) rank = 3; // a revoked contract is valued at the most conservative rank
        return _discountedValue(quantity, token, unlockTime, rank);
    }

    /// @notice Undiscounted market value of `quantity` tokens (6-dec USD). Used as the auction start price.
    function spotValue(uint256 quantity, address token) external view returns (uint256) {
        (uint256 price, uint8 feedDecimals) = _price(token);
        return _toUsd(quantity, token, price, feedDecimals);
    }

    /// @notice Price used for valuation, in the feed's decimals.
    function getTWAP(address token) external view returns (uint256 price) {
        (price, ) = _price(token);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _omega(address token) internal view returns (uint256) {
        return omegaSet[token] ? tokenOmegaBps[token] : BPS;
    }

    function _discountedValue(uint256 quantity, address token, uint256 unlockTime, uint8 rank)
        internal
        view
        returns (uint256)
    {
        (uint256 price, uint8 feedDecimals) = _price(token);
        uint256 base = _toUsd(quantity, token, price, feedDecimals);

        // Time discount e^(−rT)
        int128 m = ABDKMath64x64.fromUInt(1);
        if (unlockTime > block.timestamp) {
            int128 yearsT = ABDKMath64x64.divu(unlockTime - block.timestamp, 365 days);
            int128 r = ABDKMath64x64.divu(rankDiscountRateBps[rank], BPS);
            m = ABDKMath64x64.exp(r.mul(yearsT).neg());
        }

        // Volatility (1 − σ/2), σ ∈ [0, 1] including ATH/ATL range adjustment
        (uint256 effVol, uint256 drawdownPenalty) = _volAndDrawdown(token, price, feedDecimals);
        m = m.mul(ABDKMath64x64.divu(200 - effVol, 200));
        if (drawdownPenalty > 0) m = m.mul(ABDKMath64x64.divu(BPS - drawdownPenalty, BPS));

        return m.mulu(base);
    }

    function _volAndDrawdown(address token, uint256 price, uint8 feedDecimals)
        internal
        view
        returns (uint256 effVol, uint256 penalty)
    {
        effVol = volatility;
        TokenPriceBounds memory b = tokenPriceBounds[token];
        if (b.set) {
            uint256 p = price;
            if (feedDecimals > b.decimals) p = price / (10 ** (feedDecimals - b.decimals));
            else if (feedDecimals < b.decimals) p = price * (10 ** (b.decimals - feedDecimals));
            if (p < b.ath) {
                uint256 drawdownBps = ((b.ath - p) * BPS) / b.ath;
                penalty = (drawdownBps * drawdownPenaltyPerBps) / 100;
                if (penalty > maxDrawdownPenaltyBps) penalty = maxDrawdownPenaltyBps;
            }
            // Range ratio (ATH − ATL) / (ATH + ATL), in percent, weighted by rangeVolWeightBps
            uint256 rangeRatioBps = ((b.ath - b.atl) * BPS) / (b.ath + b.atl);
            effVol += (rangeRatioBps * rangeVolWeightBps) / (BPS * 100);
        }
        if (effVol > 100) effVol = 100;
    }

    function _toUsd(uint256 quantity, address token, uint256 price, uint8 feedDecimals)
        internal
        view
        returns (uint256)
    {
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        return (quantity * price * 1e6) / (10 ** uint256(tokenDecimals)) / (10 ** uint256(feedDecimals));
    }

    /// @dev Valuation price for `token`. Reverts if no valid, fresh price exists.
    function _price(address token) internal view returns (uint256 price, uint8 decimals) {
        address feed = tokenPriceFeeds[token];
        if (feed == address(0)) {
            require(preTGEOracle != address(0), "no price feed");
            uint256 syntheticUpdatedAt;
            (price, decimals, syntheticUpdatedAt) = IPreTGEOracle(preTGEOracle).getLatestPrice(token);
            require(price > 0, "no synthetic price");
            require(
                syntheticUpdatedAt <= block.timestamp && block.timestamp - syntheticUpdatedAt <= preTGEMaxAge,
                "stale pre-TGE price"
            );
            price = (price * (BPS - preTGEHaircutBps)) / BPS;
            require(price > 0, "price=0");
            return (price, decimals);
        }

        _checkSequencer();
        AggregatorV3Interface agg = AggregatorV3Interface(feed);
        (uint80 roundId, int256 answer, , uint256 updatedAt, ) = agg.latestRoundData();
        require(answer > 0, "invalid price");
        require(updatedAt <= block.timestamp && block.timestamp - updatedAt <= maxPriceAge, "stale price");
        decimals = agg.decimals();

        uint256 spot = uint256(answer);
        price = spot;

        uint256 twap = _twap(agg, roundId, spot, updatedAt);
        if (twap > 0 && twap < price) price = twap;

        uint256 ewma = tokenEWMA[token];
        if (ewma > 0 && block.timestamp - lastEWMARoundTime[token] <= ewmaMaxAge && ewma < price) price = ewma;
    }

    /// @dev Time-weighted average over `twapInterval`. Each round's answer is weighted by how
    ///      long it was the live answer. Returns 0 (caller falls back to spot) if history is
    ///      unavailable, instead of reverting and blocking borrows and liquidations.
    function _twap(AggregatorV3Interface agg, uint80 latestRound, uint256 latestAnswer, uint256 latestUpdatedAt)
        internal
        view
        returns (uint256)
    {
        uint256 windowStart = block.timestamp > twapInterval ? block.timestamp - twapInterval : 0;
        uint256 segmentEnd = latestUpdatedAt > windowStart ? latestUpdatedAt : windowStart;
        uint256 covered = block.timestamp - segmentEnd;
        uint256 weighted = latestAnswer * covered;
        uint80 id = latestRound;

        for (uint256 i = 0; i < maxTwapLookback && segmentEnd > windowStart && id > 0; i++) {
            id -= 1;
            try agg.getRoundData(id) returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80) {
                if (answer <= 0 || updatedAt == 0 || updatedAt > segmentEnd) break;
                uint256 segmentStart = updatedAt < windowStart ? windowStart : updatedAt;
                uint256 span = segmentEnd - segmentStart;
                weighted += uint256(answer) * span;
                covered += span;
                segmentEnd = segmentStart;
            } catch {
                break;
            }
        }
        if (covered == 0 || covered < twapInterval / 2) return 0;
        return weighted / covered;
    }

    function _checkSequencer() internal view {
        if (sequencerUptimeFeed == address(0)) return;
        (, int256 answer, uint256 startedAt, , ) = AggregatorV3Interface(sequencerUptimeFeed).latestRoundData();
        require(answer == 0, "sequencer down");
        require(block.timestamp - startedAt > sequencerGracePeriod, "sequencer grace period");
    }
}
