// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./governance/VestraAccessControl.sol";

// ✅ Fix 1: Remove isPaused(), use correct OZ Pausable interface
interface ILoanManager {
    function pause() external;
    function unpause() external;
    function resumeFromRiskModule() external;
    function paused() external view returns (bool);
    function syncBadDebt(uint256 _totalBadDebt) external;
}

/**
 * @title GlobalRiskModule
 * @notice Acts as a "Dead Man's Switch" or "Big Red Button" for the protocol.
 * Monitors protocol-wide debt vs insurance and allows emergency halts.
 */
// ✅ Fix 4: Remove Pausable inheritance — GlobalRiskModule should not pause itself
contract GlobalRiskModule is VestraAccessControl {
    ILoanManager public loanManager;
    
    uint256 public badDebtCeiling = 1_000_000 * 1e6; // $1M USDC default ceiling
    uint256 public totalBadDebt;

    event BadDebtThresholdBreached(uint256 currentBadDebt, uint256 ceiling);
    event EmergencyHaltTriggered(string reason);
    event BadDebtCeilingUpdated(uint256 newCeiling);

    constructor(address _loanManager, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_loanManager != address(0), "loanManager=0");
        loanManager = ILoanManager(_loanManager);
    }

    /**
     * @notice Report current bad debt. Auto-pauses LoanManager if ceiling breached.
     * @dev    onlyGuardian — Omega relayer or Guardian multisig calls this.
     *         Idempotent: safe to call multiple times when already paused.
     */
    function syncBadDebt(uint256 _totalBadDebt) external onlyGuardian {
        totalBadDebt = _totalBadDebt;
        
        // ✅ Fix 2 + 3: Single call path — delegate directly to LoanManager.syncBadDebt
        // LoanManager owns the pause logic and PAUSER_ROLE check.
        loanManager.syncBadDebt(_totalBadDebt);

        if (totalBadDebt > badDebtCeiling) {
            emit BadDebtThresholdBreached(totalBadDebt, badDebtCeiling);
        }
    }

    /**
     * @notice Governor-level immediate halt. Bypasses the bad debt threshold.
     */
    function emergencyHalt(string calldata reason) external onlyGovernor {
        // ✅ Fix 1: was loanManager.isPaused() — now paused()
        if (!loanManager.paused()) {
            loanManager.pause();
        }
        emit EmergencyHaltTriggered(reason);
    }

    /**
     * @notice Resume normal operations. Only Governor can unpause.
     */
    function resume() external onlyGovernor {
        loanManager.resumeFromRiskModule();
    }

    /**
     * @notice Update the bad debt ceiling. Governor only.
     */
    function setBadDebtCeiling(uint256 newCeiling) external onlyGovernor {
        require(newCeiling > 0, "ceiling=0");
        badDebtCeiling = newCeiling;
        emit BadDebtCeilingUpdated(newCeiling);
    }
}
