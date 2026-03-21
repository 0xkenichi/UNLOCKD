const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Vestra 'Soul' Staking & Game Theory Stress Tests", function () {
    let owner, lender, attacker;
    let usdc, pool;
    
    const BPS_DENOMINATOR = 10000;
    const DAYS_10_YEARS = 3650;
    const DAYS_1_YEAR = 365;
    const BASE_APY_BPS = 1000; // 10%

    beforeEach(async function () {
        [owner, lender, attacker] = await ethers.getSigners();

        // Deploy Mock USDC
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();
        const usdcAddr = await usdc.getAddress();

        // Deploy Lending Pool
        const Pool = await ethers.getContractFactory("LendingPool");
        pool = await Pool.deploy(usdcAddr, owner.address);
        const poolAddr = await pool.getAddress();

        // Setup: Mint USDC for test users
        await usdc.mint(lender.address, ethers.parseUnits("1000000", 6));
        await usdc.mint(attacker.address, ethers.parseUnits("1000000", 6));
        
        // Setup: Mint USDC for the returnsTreasury (which is owner/deployer) to pay out yields
        await usdc.mint(owner.address, ethers.parseUnits("5000000", 6));
        
        // Approvals
        await usdc.connect(lender).approve(poolAddr, ethers.MaxUint256);
        await usdc.connect(attacker).approve(poolAddr, ethers.MaxUint256);
        await usdc.connect(owner).approve(poolAddr, ethers.MaxUint256);
    });

    describe("Game Theory: The 'Duration Arbitrage' Proof", function () {
        it("Proof that unstaking a 10-year lock after 1 year matches a 1-year lock's ROI exactly (Preventing Yield Farming)", async function () {
            const principal = ethers.parseUnits("1000", 6);
            
            // User A (Honest): 1-year lock (2.0x multiplier = 20% APY)
            await pool.connect(lender).stake(principal, DAYS_1_YEAR);
            
            // User B (Framer): 10-year lock (5.0x multiplier = 50% APY) but intends to quit after 1 year
            await pool.connect(attacker).stake(principal, DAYS_1_YEAR * 10);

            // Fast forward 1 year
            await time.increase(DAYS_1_YEAR * 86400);

            // --- USER A Result ---
            const balanceABefore = await usdc.balanceOf(lender.address);
            await pool.connect(lender).unstake(0);
            const balanceAAfter = await usdc.balanceOf(lender.address);
            const roiA = balanceAAfter - balanceABefore;
            // Expected: 1000 + (1000 * 20%) = 1200. ROI = 200
            console.log("   - User A (Honest 1yr) ROI:", ethers.formatUnits(roiA, 6), "USDC");

            // --- USER B Result (Stress/Penalty/Flow Optimization) ---
            const balanceBBefore = await usdc.balanceOf(attacker.address);
            
            // User B optimizes by withdrawing Flow yield before unstaking
            await pool.connect(attacker).claimYield(0);
            const withdrawnFlow = (await usdc.balanceOf(attacker.address)) - balanceBBefore;
            console.log("   - User B (Optimized) Flow Withdrawn:", ethers.formatUnits(withdrawnFlow, 6), "USDC");

            await pool.connect(attacker).unstake(0);
            const balanceBAfter = await usdc.balanceOf(attacker.address);
            const roiB = balanceBAfter - balanceBBefore;
            
            // Expected: (Principal 700 after penalty) + (Flow 500) = 1200.
            console.log("   - User B (Fake 10yr) Total ROI:", ethers.formatUnits(roiB, 6), "USDC");

            expect(roiB).to.be.closeTo(roiA, 100n); // Small rounding delta on time
            console.log("   [Game Theory Proof Passed]: Penalty exactly offsets yield delta.");
        });
    });

    describe("Chaos Theory: The 'Flow Interest' primitive", function () {
        it("Should allow 10-year lockers to stream yield mid-lock while blocking others (Systemic Invariant)", async function () {
            const principal = ethers.parseUnits("1000", 6);
            
            // 1. Regular 1-year locker
            await pool.connect(lender).stake(principal, DAYS_1_YEAR);
            // 2. 10-year 'Flow' locker
            await pool.connect(attacker).stake(principal, DAYS_10_YEARS);

            // Fast forward 180 days
            await time.increase(180 * 86400);

            // ATTEMPT: Regular locker tries to claim interest
            await expect(
                pool.connect(lender).claimYield(0)
            ).to.be.revertedWith("lock active");

            // ATTEMPT: Flow locker claims interest mid-lock
            const balanceBefore = await usdc.balanceOf(attacker.address);
            await pool.connect(attacker).claimYield(0);
            const balanceAfter = await usdc.balanceOf(attacker.address);
            
            const claimed = balanceAfter - balanceBefore;
            console.log("   - Flow Locker Claimed mid-lock:", ethers.formatUnits(claimed, 6), "USDC");
            expect(claimed).to.be.gt(0);
            
            // Check state tracking
            const stake = await pool.userStakes(attacker.address, 0);
            expect(stake.withdrawnFlow).to.equal(claimed);
            console.log("   [Flow Primitive Passed]: Interest streaming operational.");
        });

        it("Chaos Scenario: 100% Pool Utilization with massive Flow withdrawals", async function () {
            // Setup pool with $1M deposits
            const depositAmount = ethers.parseUnits("1000000", 6);
            await pool.connect(lender).deposit(depositAmount);
            
            // Lockers stake for 10 years (The FLOWers)
            await pool.connect(attacker).stake(depositAmount, DAYS_10_YEARS);

            // Fast forward 1 year
            await time.increase(DAYS_1_YEAR * 86400);

            // --- THE CHAOS ---
            // The Returns Treasury (Owner) is drained or balance is low
            const treasuryBalance = await usdc.balanceOf(owner.address);
            await usdc.connect(owner).transfer(lender.address, treasuryBalance); // DRAIN
            
            // ATTEMPT: Flow locker tries to claim during treasury insolvency
            await expect(
                pool.connect(attacker).claimYield(0)
            ).to.be.revertedWith("insufficient liquidity");
            
            console.log("   [Chaos Test Passed]: System fails safely under liquidity crunch.");
        });
    });
});
