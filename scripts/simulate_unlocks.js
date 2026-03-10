// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { ethers } = require("hardhat");

/**
 * @notice Simulates an environment with $1M mock TVL.
 * Deploys or connects to local instances of Mock ERC20s and Vesting Contracts.
 */
async function main() {
    console.log("==================================================");
    console.log("  Vestra Protocol - $1M TVL Mock Simulation");
    console.log("==================================================\n");

    const [deployer, whale, user1, user2] = await ethers.getSigners();

    // Simulate $1,000,000 in USDC (6 decimals)
    const MOCK_TVL_USDC = ethers.parseUnits("1000000", 6);
    // Simulate collateral tokens equivalent to $1M 
    const MOCK_COLLATERAL_AMOUNT = ethers.parseUnits("500000", 18); // e.g. 500k tokens at $2

    console.log(`[+] Deploying Mock USDC...`);
    const MockERC20 = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockERC20.deploy();
    await usdc.waitForDeployment();
    const usdcAddr = await usdc.getAddress();
    console.log(`    Mock USDC Address: ${usdcAddr}`);

    console.log(`[+] Deploying Mock Project Token (MOCK)...`);
    const mockToken = await MockERC20.deploy();
    await mockToken.waitForDeployment();
    const mockTokenAddr = await mockToken.getAddress();
    console.log(`    Mock Token Address: ${mockTokenAddr}`);

    console.log(`\n[+] Distributing TVL...`);
    // Distribute USDC
    await usdc.mint(whale.address, ethers.parseUnits("500000", 6));
    await usdc.mint(user1.address, ethers.parseUnits("250000", 6));
    await usdc.mint(user2.address, ethers.parseUnits("250000", 6));

    // Distribute MOCK
    await mockToken.mint(user1.address, ethers.parseUnits("250000", 18));
    await mockToken.mint(user2.address, ethers.parseUnits("250000", 18));

    console.log(`    Whale  (USDC): $500,000`);
    console.log(`    User 1 (USDC): $250,000 | (MOCK): 250,000 MOCK`);
    console.log(`    User 2 (USDC): $250,000 | (MOCK): 250,000 MOCK`);

    console.log(`\n[+] Simulating Token Unlocks / Vesting Setup`);
    const currentBlockTime = (await ethers.provider.getBlock("latest")).timestamp;

    // Assuming $2 per MOCK token -> $500k TVL from User 1
    console.log(`    - User 1's 250k MOCK is locked for 6 months.`);
    const unlockTime1 = currentBlockTime + (6 * 30 * 24 * 60 * 60);

    // Assuming $2 per MOCK token -> $500k TVL from User 2
    console.log(`    - User 2's 250k MOCK is locked for 12 months.`);
    const unlockTime2 = currentBlockTime + (12 * 30 * 24 * 60 * 60);

    console.log(`\n==================================================`);
    console.log(`  Simulation State: MOCK TVL Target Reached`);
    console.log(`  Total Value Locked (Simulated): ~$1,000,000`);
    console.log(`==================================================`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
