// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "../VestingAdapter.sol";
import "./CreditEngineV2.sol";
import "./RiskOracle.sol";
import "./LoanManagerV2.sol";

/**
 * @title  LoanLensV2
 * @notice Read-only helpers for apps and keepers, kept out of LoanManagerV2 to keep it under the
 *         contract size limit. Nothing here changes state or is relied on by the loan manager.
 */
contract LoanLensV2 {
    LoanManagerV2 public immutable manager;

    constructor(LoanManagerV2 _manager) {
        manager = _manager;
    }

    /// @notice The most a stream can borrow now in `tier`, before escrowing it, and the rate it would pay.
    function quoteMaxBorrow(VestingAdapter.Protocol protocol, address nftContract, uint256 streamId, uint256 amount, uint256 maturity, CreditEngineV2.Tier tier)
        external
        view
        returns (uint256 maxB, uint256 rateBps)
    {
        (address token, uint64 start, uint64 cliff, uint64 end, uint256 total, uint256 withdrawn) =
            manager.adapter().previewSchedule(protocol, nftContract, streamId);
        CreditEngineV2.Schedule memory sch = CreditEngineV2.Schedule(start, cliff, end, total, withdrawn);
        rateBps = manager.quoteRate(amount, tier);
        RiskOracle oracle = manager.oracle();
        maxB = manager.engine().maxBorrow(sch, block.timestamp, maturity, rateBps, oracle.originationMarket(token), tier, oracle.omega(token));
    }

    /// @notice Debt, liquidation credit value and whether the loan can be liquidated now.
    function status(uint256 loanId) external view returns (uint256 debt, uint256 cv, bool liquidatable) {
        (debt, cv) = manager.health(loanId);
        liquidatable = manager.isLiquidatable(loanId);
    }
}
