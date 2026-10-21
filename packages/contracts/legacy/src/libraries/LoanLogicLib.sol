// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "abdk-libraries-solidity/ABDKMath64x64.sol";
import "../ValuationEngine.sol";

/**
 * @title LoanLogicLib
 * @notice V7.0 Citadel: Extracts heavy math and pricing logic from LoanManager to prevent EIP-170 size limits.
 */
library LoanLogicLib {

    // V7.0 Citadel: Error definitions extracted to library
    error InvalidToken();

    /**
     * @notice Reads and validates the Oracle price, accounting for TWAP and Quarantines.
     */
    function readValidatedOraclePrice(
        ValuationEngine valuation,
        address token
    ) public view returns (uint256 price, uint8 decimals) {
        address feedAddress = valuation.getPriceFeedForToken(token);
        if (feedAddress == address(0)) revert InvalidToken();
        
        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
        
        uint8 fDecimals = priceFeed.decimals();

        // V6.0 Citadel - OTC Quarantine State bypass for zero-priced nukes
        if (answer <= 0) {
            if (valuation.isQuarantined(token)) {
                return (0, fDecimals);
            }
            revert InvalidToken();
        }
        
        if (answeredInRound < roundId) revert InvalidToken();
        if (updatedAt == 0) revert InvalidToken();
        if (block.timestamp < updatedAt) revert InvalidToken();
        if (block.timestamp - updatedAt > valuation.maxPriceAge()) revert InvalidToken();
        
        return (uint256(answer), fDecimals);
    }

    /**
     * @notice Calculates the minimum USDC expected out from a liquidation swap.
     */
    function minUsdcOut(
        ValuationEngine valuation,
        address token,
        address usdcAddress,
        uint256 amountIn,
        uint256 liquidationSlippageBps
    ) public view returns (uint256) {
        (uint256 price, uint8 priceDecimals) = readValidatedOraclePrice(valuation, token);
        if (price == 0) return 0; // Quarantined

        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint8 usdcDecimals = IERC20Metadata(usdcAddress).decimals();

        uint256 usdValue = Math.mulDiv(amountIn, price, 10 ** tokenDecimals);
        uint256 expectedUsdc = Math.mulDiv(usdValue, 10 ** usdcDecimals, 10 ** priceDecimals);
        
        return (expectedUsdc * liquidationSlippageBps) / 10000;
    }

    /**
     * @notice Calculates the token amount to seize to cover a USDC debt.
     */
    function calculateSeizeAmount(
        ValuationEngine valuation,
        address token,
        address usdcAddress,
        uint256 debtUsdc
    ) public view returns (uint256) {
        if (token == usdcAddress) {
            return debtUsdc;
        }

        (uint256 price, uint8 priceDecimals) = readValidatedOraclePrice(valuation, token);
        
        // V6.0 Citadel - Absolute full OTC buyout if quarantined
        if (price == 0) return type(uint256).max; 

        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint8 usdcDecimals = IERC20Metadata(usdcAddress).decimals();

        uint256 tokenAmountAtOne = Math.mulDiv(
            debtUsdc,
            10 ** tokenDecimals,
            10 ** usdcDecimals
        );
        return Math.mulDiv(tokenAmountAtOne, 10 ** priceDecimals, price);
    }
}
