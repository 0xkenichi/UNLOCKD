// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./governance/VestraAccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface ILoanManager {
    function pause() external;
    function unpause() external;
    function isPaused() external view returns (bool);
}

/**
 * @title GlobalRiskModule
 * @notice Acts as a "Dead Man's Switch" or "Big Red Button" for the protocol.
 * Monitors protocol-wide debt vs insurance and allows emergency halts.
 */
contract GlobalRiskModule is VestraAccessControl, Pausable {
    ILoanManager public loanManager;
    
    uint256 public badDebtCeiling = 1_000_000 * 1e6; // $1M USDC default ceiling
    uint256 public totalBadDebt;

    event BadDebtThresholdBreached(uint256 currentBadDebt, uint256 ceiling);
    event ProtocolEmergencyHalt(string reason);

    constructor(address _loanManager, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        loanManager = ILoanManager(_loanManager);
    }

    function syncBadDebt(uint256 _totalBadDebt) external onlyGuardian {
        totalBadDebt = _totalBadDebt;
        
        if (totalBadDebt > badDebtCeiling) {
            _pause();
            if (!loanManager.isPaused()) {
                loanManager.pause();
            }
            emit BadDebtThresholdBreached(totalBadDebt, badDebtCeiling);
        }
    }

    function emergencyHalt(string calldata reason) external onlyGovernor {
        _pause();
        loanManager.pause();
        emit ProtocolEmergencyHalt(reason);
    }

    function resume() external onlyGovernor {
        _unpause();
        loanManager.unpause();
    }
}
