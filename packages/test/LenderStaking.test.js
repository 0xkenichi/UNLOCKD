const { expect } = require("chai");
const { deployments, ethers } = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

describe("Lender Staking Flow", () => {
  let deployer, lender, usdc, pool;

  beforeEach(async () => {
    await deployments.fixture(["full"]);
    [deployer, lender] = await ethers.getSigners();
    
    const usdcDeployment = await deployments.get("MockUSDC");
    const poolDeployment = await deployments.get("LendingPool");
    
    usdc = await ethers.getContractAt("MockUSDC", usdcDeployment.address, deployer);
    pool = await ethers.getContractAt("LendingPool", poolDeployment.address, deployer);

    // Setup: Mint and approve USDC for lender
    await usdc.connect(lender).mint(lender.address, 100000e6);
    const poolAddress = await pool.getAddress();
    await usdc.connect(lender).approve(poolAddress, ethers.MaxUint256);

    // Ensure returnsTreasury (which is deployer in tests) has enough USDC to pay out principal+yield
    const returnsTreasury = await pool.returnsTreasury();
    await usdc.connect(deployer).mint(returnsTreasury, 1000000e6);
    const treasurySigner = await ethers.getSigner(returnsTreasury);
    await usdc.connect(treasurySigner).approve(poolAddress, ethers.MaxUint256);
  });

  it("Stakes for 30 days and calculates correct yield (11% APY)", async () => {
    const amount = 1000e6;
    await pool.connect(lender).stake(amount, 30);
    
    const stake = await pool.userStakes(lender.address, 0);
    expect(stake.amount).to.equal(amount);
    expect(stake.apyBps).to.equal(1100);
    expect(stake.durationDays).to.equal(30);

    // Fast forward 15 days
    await ethers.provider.send("evm_increaseTime", [15 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);

    const yield = await pool.calculateYield(lender.address, 0);
    // 1000 * 0.11 * (15/365) = ~4.52
    expect(yield).to.be.closeTo(4_520_547n, 1000n); // Handling 6 decimal USDC scaling
  });

  it("Applies 5% penalty for early unstake", async () => {
    const amount = 1000e6;
    await pool.connect(lender).stake(amount, 90);
    
    const initialBalance = await usdc.balanceOf(lender.address);
    
    // Unstake immediately (penalty applies)
    await pool.connect(lender).unstake(0);
    
    const finalBalance = await usdc.balanceOf(lender.address);
    const received = finalBalance - initialBalance;
    
    // 1000 - 5% = 950
    expect(received).to.equal(950e6);
  });

  it("Returns full principal and yield after lock ends", async () => {
    const amount = 1000e6;
    await pool.connect(lender).stake(amount, 30);
    
    // Fast forward 31 days
    await ethers.provider.send("evm_increaseTime", [31 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);
    
    const initialBalance = await usdc.balanceOf(lender.address);
    await pool.connect(lender).unstake(0);
    const finalBalance = await usdc.balanceOf(lender.address);
    
    const totalReturn = finalBalance - initialBalance;
    // 1000 + (1000 * 0.11 * 31 / 365) = ~1009.34
    expect(totalReturn).to.be.closeTo(1009_342_465n, 100000n);
  });
});
