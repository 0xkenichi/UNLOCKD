// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./MockLinearVestingWallet.sol";
import "./MockVestraToken.sol";
import "../VestingRegistry.sol";

contract DemoFaucet {
    MockVestraToken public vestToken;
    IERC20 public usdc;
    VestingRegistry public registry;

    event DemoPositionMinted(address indexed user, address indexed vestingContract, uint256 collateralId);
    event UsdcVestingCreated(address indexed user, address indexed vestingContract, uint256 amount);

    constructor(address _registry, address _usdc) {
        registry = VestingRegistry(_registry);
        usdc = IERC20(_usdc);
        vestToken = new MockVestraToken();
    }

    function mintDemoPosition(uint256 allocation, uint256 durationMonths, uint256 cliffMonths) external returns (address vestingWallet) {
        uint256 durationSeconds = durationMonths * 30 days;
        uint256 cliffSeconds = cliffMonths * 30 days;
        
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
        registry.vetContract(vestingWallet, 1);

        uint256 collateralId = uint256(uint160(vestingWallet));
        emit DemoPositionMinted(msg.sender, vestingWallet, collateralId);
    }

    function lockUSDCAndMint(uint256 amount, uint256 durationMonths) external returns (address vestingWallet) {
        require(amount >= 1e6, "min 1 USDC");
        
        // 1. Transfer USDC from user to this contract
        usdc.transferFrom(msg.sender, address(this), amount);
        
        uint256 durationSeconds = durationMonths * 30 days;
        
        // 2. Deploy the vesting wallet
        MockLinearVestingWallet wallet = new MockLinearVestingWallet(
            msg.sender,
            block.timestamp,
            durationSeconds,
            0, // No cliff for USDC demo
            address(usdc),
            amount
        );
        
        vestingWallet = address(wallet);

        // 3. Fund the wallet with the USDC we just received
        usdc.transfer(vestingWallet, amount);

        // 4. Register the wallet (Tier 3 - Standard for USDC locks)
        registry.vetContract(vestingWallet, 3);

        emit UsdcVestingCreated(msg.sender, vestingWallet, amount);
    }
}
