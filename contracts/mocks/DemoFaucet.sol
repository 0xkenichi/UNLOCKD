// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./MockLinearVestingWallet.sol";
import "./MockVestraToken.sol";
import "../VestingRegistry.sol";

contract DemoFaucet {
    MockVestraToken public vestToken;
    VestingRegistry public registry;

    event DemoPositionMinted(address indexed user, address indexed vestingContract, uint256 collateralId);

    constructor(address _registry) {
        registry = VestingRegistry(_registry);
        vestToken = new MockVestraToken();
    }

    function mintDemoPosition(uint256 allocation, uint256 durationMonths) external returns (address vestingWallet) {
        uint256 durationSeconds = durationMonths * 30 days;
        uint256 cliffSeconds = 1 days;
        
        // 1. Deploy the vesting wallet
        MockLinearVestingWallet wallet = new MockLinearVestingWallet(
            msg.sender,
            block.timestamp,
            durationSeconds,
            cliffSeconds,
            address(vestToken),
            allocation
        );
        
        vestingWallet = address(wallet);

        // 2. Fund the wallet
        vestToken.mint(vestingWallet, allocation);

        // 3. Register the wallet as Tier 1 (Flagship)
        // Note: DemoFaucet MUST have Governor role on VestingRegistry for this to work
        registry.vetContract(vestingWallet, 1);

        // Emit an event that the frontend can listen to to get the new setup
        uint256 collateralId = block.timestamp;
        
        emit DemoPositionMinted(msg.sender, vestingWallet, collateralId);
    }
}
