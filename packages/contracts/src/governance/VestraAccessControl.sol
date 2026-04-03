// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title VestraAccessControl
 * @notice Decentralized governance backbone for Vestra Protocol.
 * Supports multisig transition by separating critical and operational roles.
 */
contract VestraAccessControl is AccessControl {
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");   // Multisig (The Sovereign)
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");   // Omega Agent (Operational)
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");       // GlobalRiskModule (Safety)
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");       // Vestra Pay (Settlement)

    event GovernanceInitialised(address governor);

    constructor(address initialGovernor) {
        _grantRole(DEFAULT_ADMIN_ROLE, initialGovernor);
        _grantRole(GOVERNOR_ROLE, initialGovernor);
        
        // Admin role can manage all other roles
        _setRoleAdmin(GUARDIAN_ROLE, GOVERNOR_ROLE);
        _setRoleAdmin(PAUSER_ROLE, GOVERNOR_ROLE);
        _setRoleAdmin(KEEPER_ROLE, GOVERNOR_ROLE);
        
        emit GovernanceInitialised(initialGovernor);
    }

    // Modifiers for easy integration
    modifier onlyGovernor() {
        require(hasRole(GOVERNOR_ROLE, msg.sender), "Caller is not governor");
        _;
    }

    modifier onlyGuardian() {
        require(hasRole(GUARDIAN_ROLE, msg.sender), "Caller is not guardian");
        _;
    }

    modifier onlyPauser() {
        require(hasRole(PAUSER_ROLE, msg.sender), "Caller is not pauser");
        _;
    }

    modifier onlyKeeper() {
        require(hasRole(KEEPER_ROLE, msg.sender), "Caller is not keeper");
        _;
    }
}
