// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../governance/VestraAccessControl.sol";
import "./CreditEngineV2.sol";

/**
 * @title  RiskOracle
 * @notice What the v2 loan book needs to know about each listed token.
 *
 *         Price (Chainlink, measured on-chain):
 *           origination  min(spot, TWAP)    so a pump cannot inflate a new loan
 *           health       TWAP alone         so a brief dump cannot trigger liquidation
 *         Risk inputs (posted by RISK_POSTER_ROLE, within hard bounds, expiring after
 *         `maxRiskAge`): volatility σ, median daily volume, unlock drag.
 *         Ω (GUARDIAN_ROLE): scales new credit only. A cut applies at once; a raise of at most
 *         5 points applies after 24 hours.
 *
 *         Nothing posted here changes an open loan: the loan manager freezes σ, volume and drag
 *         at origination and reads only the health price afterwards.
 */
contract RiskOracle is VestraAccessControl {
    bytes32 public constant RISK_POSTER_ROLE = keccak256("RISK_POSTER_ROLE");

    uint256 public constant BPS = 10_000;
    uint32 public constant MIN_SIGMA_BPS = 1000;    // 10%
    uint32 public constant MAX_SIGMA_BPS = 50_000;  // 500%
    uint32 public constant MIN_DRAG_BPS = 500;
    uint256 public constant MAX_OMEGA_RAISE_BPS = 500;
    uint256 public constant OMEGA_RAISE_DELAY = 24 hours;

    struct TokenRisk {
        address feed;
        uint8 decimals;          // token decimals
        uint32 sigmaFloorBps;    // young tokens get a higher floor
        uint32 sigmaBps;
        uint32 dragBps;
        uint64 postedAt;
        uint256 advUsd;          // 6 decimals
        uint16 omegaBps;
        uint16 pendingOmegaBps;
        uint64 pendingOmegaAt;
        bool listed;
    }

    mapping(address => TokenRisk) public risk;

    uint256 public maxRiskAge = 2 days;
    uint256 public maxPriceAge = 1 hours;
    uint256 public twapInterval = 1 hours;
    uint256 public maxTwapLookback = 50;
    address public sequencerUptimeFeed;
    uint256 public sequencerGracePeriod = 1 hours;

    event TokenListed(address indexed token, address indexed feed, uint8 decimals, uint32 sigmaFloorBps);
    event RiskPosted(address indexed token, uint32 sigmaBps, uint256 advUsd, uint32 dragBps);
    event OmegaCut(address indexed token, uint256 omegaBps);
    event OmegaRaiseQueued(address indexed token, uint256 omegaBps, uint256 effectiveAt);
    event ParamUpdated(bytes32 indexed name, uint256 value);

    constructor(address governor) VestraAccessControl(governor) {
        _setRoleAdmin(RISK_POSTER_ROLE, GOVERNOR_ROLE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Governance
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice List a token with the Ω its partner agreement sets. Afterwards the guardian can cut
    ///         Ω at once but raise it only slowly.
    function listToken(address token, address feed, uint32 sigmaFloorBps, uint16 initialOmegaBps) external onlyGovernor {
        require(token != address(0) && feed != address(0), "zero address");
        uint8 decimals = IERC20Metadata(token).decimals();
        require(decimals <= 24, "decimals");
        require(sigmaFloorBps >= MIN_SIGMA_BPS && sigmaFloorBps <= MAX_SIGMA_BPS, "sigma floor");
        require(initialOmegaBps <= BPS, "omega");
        TokenRisk storage r = risk[token];
        require(!r.listed, "already listed");
        r.omegaBps = initialOmegaBps;
        r.feed = feed;
        r.decimals = decimals;
        r.sigmaFloorBps = sigmaFloorBps;
        r.listed = true;
        emit TokenListed(token, feed, decimals, sigmaFloorBps);
    }

    /// @notice Replace a token's price feed (a Chainlink migration). Open loans keep their frozen
    ///         inputs and read only the health price, so this changes no loan's terms.
    function setTokenFeed(address token, address feed) external onlyGovernor {
        require(risk[token].listed && feed != address(0), "feed");
        require(AggregatorV3Interface(feed).decimals() <= 24, "feed decimals");
        risk[token].feed = feed;
        emit TokenListed(token, feed, risk[token].decimals, risk[token].sigmaFloorBps);
    }

    function setPriceParams(uint256 _maxPriceAge, uint256 _twapInterval, uint256 _lookback) external onlyGovernor {
        require(_maxPriceAge >= 5 minutes && _maxPriceAge <= 1 days, "price age");
        require(_twapInterval >= 5 minutes && _twapInterval <= 1 days, "twap interval");
        require(_lookback >= 1 && _lookback <= 200, "lookback");
        maxPriceAge = _maxPriceAge;
        twapInterval = _twapInterval;
        maxTwapLookback = _lookback;
        emit ParamUpdated("maxPriceAge", _maxPriceAge);
    }

    function setMaxRiskAge(uint256 age) external onlyGovernor {
        require(age >= 1 hours && age <= 7 days, "risk age");
        maxRiskAge = age;
        emit ParamUpdated("maxRiskAge", age);
    }

    function setSequencerUptimeFeed(address feed, uint256 grace) external onlyGovernor {
        sequencerUptimeFeed = feed;
        sequencerGracePeriod = grace;
        emit ParamUpdated("sequencerGracePeriod", grace);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Risk inputs
    // ─────────────────────────────────────────────────────────────────────────

    function postRisk(address token, uint32 sigmaBps, uint256 advUsd, uint32 dragBps) external onlyRole(RISK_POSTER_ROLE) {
        TokenRisk storage r = risk[token];
        require(r.listed, "not listed");
        require(sigmaBps >= r.sigmaFloorBps && sigmaBps <= MAX_SIGMA_BPS, "sigma");
        require(dragBps >= MIN_DRAG_BPS && dragBps <= BPS, "drag");
        require(advUsd > 0, "volume");
        r.sigmaBps = sigmaBps;
        r.advUsd = advUsd;
        r.dragBps = dragBps;
        r.postedAt = uint64(block.timestamp);
        emit RiskPosted(token, sigmaBps, advUsd, dragBps);
    }

    /// @notice Set Ω. A cut (or equal value) applies at once and cancels any pending raise; a
    ///         raise is capped at +5 points over the current value and applies 24 hours later.
    function setOmega(address token, uint16 omegaBps) external onlyGuardian {
        TokenRisk storage r = risk[token];
        require(r.listed, "not listed");
        require(omegaBps <= BPS, "omega");
        _applyPendingOmega(r);
        if (omegaBps <= r.omegaBps) {
            r.omegaBps = omegaBps;
            r.pendingOmegaAt = 0;
            emit OmegaCut(token, omegaBps);
        } else {
            require(omegaBps <= r.omegaBps + MAX_OMEGA_RAISE_BPS, "raise too large");
            r.pendingOmegaBps = omegaBps;
            r.pendingOmegaAt = uint64(block.timestamp + OMEGA_RAISE_DELAY);
            emit OmegaRaiseQueued(token, omegaBps, r.pendingOmegaAt);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views for the loan manager
    // ─────────────────────────────────────────────────────────────────────────

    function omega(address token) public view returns (uint256) {
        TokenRisk storage r = risk[token];
        if (r.pendingOmegaAt != 0 && block.timestamp >= r.pendingOmegaAt) return r.pendingOmegaBps;
        return r.omegaBps;
    }

    /// @notice Market inputs for a new loan. Reverts if the token is unlisted, its risk inputs
    ///         are stale, or no fresh price exists.
    function originationMarket(address token) external view returns (CreditEngineV2.Market memory m) {
        TokenRisk storage r = risk[token];
        require(r.listed, "not listed");
        require(r.postedAt != 0 && block.timestamp - r.postedAt <= maxRiskAge, "stale risk inputs");
        (uint256 spot, uint256 twap) = _prices(r);
        m = CreditEngineV2.Market({
            price: twap < spot ? twap : spot,
            decimals: r.decimals,
            sigmaBps: r.sigmaBps,
            advUsd: r.advUsd,
            dragBps: r.dragBps
        });
    }

    /// @notice Time-weighted price for health checks (6 decimals). Reverts if no fresh price.
    function healthPrice(address token) external view returns (uint256) {
        TokenRisk storage r = risk[token];
        require(r.listed, "not listed");
        (, uint256 twap) = _prices(r);
        return twap;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _applyPendingOmega(TokenRisk storage r) internal {
        if (r.pendingOmegaAt != 0 && block.timestamp >= r.pendingOmegaAt) {
            r.omegaBps = r.pendingOmegaBps;
            r.pendingOmegaAt = 0;
        }
    }

    /// Spot and TWAP in 6 decimals.
    function _prices(TokenRisk storage r) internal view returns (uint256 spot, uint256 twap) {
        _checkSequencer();
        AggregatorV3Interface agg = AggregatorV3Interface(r.feed);
        (uint80 roundId, int256 answer, , uint256 updatedAt, ) = agg.latestRoundData();
        require(answer > 0, "invalid price");
        require(updatedAt <= block.timestamp && block.timestamp - updatedAt <= maxPriceAge, "stale price");
        uint8 fd = agg.decimals();
        uint256 rawTwap = _twap(agg, roundId, uint256(answer), updatedAt);
        if (rawTwap == 0) rawTwap = uint256(answer);
        spot = _to6(uint256(answer), fd);
        twap = _to6(rawTwap, fd);
        require(spot > 0 && twap > 0, "price=0");
    }

    function _to6(uint256 p, uint8 fd) internal pure returns (uint256) {
        return fd >= 6 ? p / (10 ** (fd - 6)) : p * (10 ** (6 - fd));
    }

    /// Each round's answer weighted by how long it was live over the last `twapInterval`.
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
                weighted += uint256(answer) * (segmentEnd - segmentStart);
                covered += segmentEnd - segmentStart;
                segmentEnd = segmentStart;
            } catch {
                break;
            }
        }
        return covered == 0 ? 0 : weighted / covered;
    }

    function _checkSequencer() internal view {
        if (sequencerUptimeFeed == address(0)) return;
        (, int256 answer, uint256 startedAt, , ) = AggregatorV3Interface(sequencerUptimeFeed).latestRoundData();
        require(answer == 0, "sequencer down");
        require(startedAt != 0 && block.timestamp - startedAt > sequencerGracePeriod, "sequencer grace period");
    }
}
