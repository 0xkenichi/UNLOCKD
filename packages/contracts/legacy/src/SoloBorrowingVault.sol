// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./governance/VestraAccessControl.sol";

interface ILoanOrigination {
    function createPrivateLoan(uint256 collateralId, address vestingContract, uint256 borrowAmount, uint256 durationDays) external;
}

/**
 * @title SoloBorrowingVault
 * @notice A streamlined vault for borrowing assets with privacy elements. 
 * Integrates ERC-5564 inspired stealth patterns by allowing users to originate loans
 * through privacy-preserving stealth addresses.
 */
contract SoloBorrowingVault is VestraAccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public loanManager;
    IERC20 public usdc;

    // Mapping from stealth address to the underlying beneficiary (optional for strict privacy)
    mapping(address => address) private stealthToBeneficiary;
    mapping(address => bool) public isStealthAddress;

    event StealthAddressRegistered(address indexed stealthAddress);
    event PrivateLoanInitiated(address indexed stealthAddress, uint256 borrowAmount);

    constructor(address _loanManager, address _usdc, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_loanManager != address(0), "Invalid LoanManager");
        require(_usdc != address(0), "Invalid USDC");
        loanManager = _loanManager;
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Registers a stealth address mapped to a beneficiary.
     * In a fully decentralized ERC-5564 implementation, proofs would be utilized.
     * Here, the registry acts as a privacy layer for origination routing.
     */
    function registerStealthAddress(address stealthAddress, address beneficiary) external {
        // Only the beneficiary or an authorized guardian relayer can register
        require(msg.sender == beneficiary || hasRole(GUARDIAN_ROLE, msg.sender), "Unauthorized");
        stealthToBeneficiary[stealthAddress] = beneficiary;
        isStealthAddress[stealthAddress] = true;
        emit StealthAddressRegistered(stealthAddress);
    }

    /**
     * @notice Retrieves the true beneficiary of a stealth address for compliance/recovery.
     * Only Guardian/Governor can access.
     */
    function getBeneficiary(address stealthAddress) external view returns (address) {
        require(hasRole(GUARDIAN_ROLE, msg.sender) || hasRole(GOVERNOR_ROLE, msg.sender), "Restricted");
        return stealthToBeneficiary[stealthAddress];
    }

    /**
     * @notice Initiates a private loan on behalf of a stealth address.
     * The collateral must reside within this Vault prior to origination.
     */
    function initiatePrivateLoan(
        address stealthAddress,
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 durationDays
    ) external nonReentrant {
        require(isStealthAddress[stealthAddress], "Not a registered stealth address");
        require(msg.sender == stealthAddress || hasRole(GUARDIAN_ROLE, msg.sender), "Unauthorized relayer");

        // Forward loan origination to LoanManager
        ILoanOrigination(loanManager).createPrivateLoan(collateralId, vestingContract, borrowAmount, durationDays);

        // Transfer drawn USDC to the stealth address
        uint256 balance = usdc.balanceOf(address(this));
        if (balance >= borrowAmount) {
            usdc.safeTransfer(stealthAddress, borrowAmount);
        }

        emit PrivateLoanInitiated(stealthAddress, borrowAmount);
    }

    function emergencyWithdrawUSDC(address to, uint256 amount) external onlyGovernor {
        usdc.safeTransfer(to, amount);
    }
}
