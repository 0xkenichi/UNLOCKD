// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

const CONSTANTS = {
    NETWORKS: {
        ARBITRUM: 42161,
        BASE: 8453,
        OPTIMISM: 10,
        POLYGON: 137,
        SEPOLIA: 11155111,
        LOCALHOST: 31337
    },
    // Default Protocol Fee is 10 basis points (0.1%) when builders route through the SDK
    DEFAULT_BUILDER_FEE_BPS: 10
};

// Minimal ABIs required for SDK interaction
const CONTRACT_ABIS = {
    LENDING_POOL: [
        "function deposit(address token, uint256 amount) external",
        "function withdraw(address token, uint256 amount) external",
        "function borrow(address token, uint256 amount) external",
        "function repay(address token, uint256 amount) external"
    ],
    LOAN_MANAGER: [
        "function createLoan(uint256 collateralId, uint256 amount, uint256 duration) external returns (uint256)",
        "function repayLoan(uint256 loanId) external",
        "function loans(uint256) view returns (address borrower, uint256 principal, uint256 interest, uint256 collateralId, uint256 collateralAmount, uint256 unlockTime, bool active)",
        "function loanCount() view returns (uint256)"
    ]
};

module.exports = { CONSTANTS, CONTRACT_ABIS };
