// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "../governance/VestraAccessControl.sol";

/**
 * @title  PreTGEOracle
 * @notice Synthetic prices for tokens that have not launched yet (OTC, seed-round and
 *         comparable-based underwriting inputs). These are judgements, not market prices.
 *
 *         • The governor (deploy behind a TimelockController) sets the initial price for a
 *           token and may override it at any time.
 *         • A data signer may then move the price, but by at most `maxChangeBps` per update
 *           and at most once per `minUpdateInterval`, so a compromised signer key cannot
 *           jump a price.
 *         • ValuationEngine additionally applies a mandatory haircut, a staleness bound and
 *           a mandatory per-loan borrow cap for every pre-TGE token.
 */
contract PreTGEOracle is VestraAccessControl {
    mapping(address => uint256) public impliedPrices;
    mapping(address => uint256) public lastUpdateTimes;
    mapping(address => uint8) public tokenDecimals;

    address public dataSigner;
    uint256 public maxAge = 7 days;
    uint256 public maxChangeBps = 2000;        // ±20% per signer update
    uint256 public minUpdateInterval = 1 hours;

    event DataSignerUpdated(address indexed signer);
    event SyntheticPriceUpdated(address indexed token, uint256 price, uint8 decimals, address indexed by);
    event LimitsUpdated(uint256 maxAge, uint256 maxChangeBps, uint256 minUpdateInterval);

    constructor(address _governor, address _dataSigner) VestraAccessControl(_governor) {
        dataSigner = _dataSigner;
        emit DataSignerUpdated(_dataSigner);
    }

    function setDataSigner(address _dataSigner) external onlyGovernor {
        dataSigner = _dataSigner;
        emit DataSignerUpdated(_dataSigner);
    }

    function setLimits(uint256 _maxAge, uint256 _maxChangeBps, uint256 _minUpdateInterval) external onlyGovernor {
        require(_maxAge >= 1 hours && _maxAge <= 30 days, "maxAge");
        require(_maxChangeBps > 0 && _maxChangeBps <= 5000, "maxChange");
        require(_minUpdateInterval <= 1 days, "interval");
        maxAge = _maxAge;
        maxChangeBps = _maxChangeBps;
        minUpdateInterval = _minUpdateInterval;
        emit LimitsUpdated(_maxAge, _maxChangeBps, _minUpdateInterval);
    }

    /// @notice Governor sets or overrides a synthetic price.
    function setSyntheticPrice(address token, uint256 price, uint8 decimals) external onlyGovernor {
        require(price > 0, "price=0");
        require(decimals <= 18, "decimals>18");
        _set(token, price, decimals);
    }

    /// @notice Data signer moves an existing price within the configured limits.
    function updateSyntheticPrice(address token, uint256 price) external {
        require(msg.sender == dataSigner && dataSigner != address(0), "not signer");
        uint256 prev = impliedPrices[token];
        require(prev > 0, "not initialised");
        require(block.timestamp >= lastUpdateTimes[token] + minUpdateInterval, "too soon");
        uint256 diff = price > prev ? price - prev : prev - price;
        require(diff * 10_000 <= prev * maxChangeBps, "change too large");
        _set(token, price, tokenDecimals[token]);
    }

    function getLatestPrice(address token) external view returns (uint256 price, uint8 decimals, uint256 updatedAt) {
        price = impliedPrices[token];
        decimals = tokenDecimals[token];
        updatedAt = lastUpdateTimes[token];
        require(price > 0, "No synthetic price");
        require(block.timestamp - updatedAt <= maxAge, "Stale Pre-TGE data");
    }

    function _set(address token, uint256 price, uint8 decimals) internal {
        impliedPrices[token] = price;
        lastUpdateTimes[token] = block.timestamp;
        tokenDecimals[token] = decimals;
        emit SyntheticPriceUpdated(token, price, decimals, msg.sender);
    }
}
