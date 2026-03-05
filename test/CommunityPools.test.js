// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { expect } = require("chai");
const { deployments, ethers } = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function fixture() {
  await deployments.fixture(["full"]);
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const usdcDeployment = await deployments.get("MockUSDC");
  const poolDeployment = await deployments.get("LendingPool");

  const usdc = await ethers.getContractAt("MockUSDC", usdcDeployment.address, deployer);
  const pool = await ethers.getContractAt("LendingPool", poolDeployment.address, deployer);

  return { deployer, alice, bob, carol, usdc, pool };
}

describe("Community pools", () => {
  it("activates once target is reached and shares rewards by building size", async () => {
    const { deployer, alice, bob, usdc, pool } = await fixture();
    const poolAddress = await pool.getAddress();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const deadline = now + ONE_DAY;

    await pool.createCommunityPool("Builders Fund", 2_000e6, 2_500e6, deadline, true);

    await usdc.mint(alice.address, 1_000e6);
    await usdc.mint(bob.address, 1_000e6);
    await usdc.connect(alice).approve(poolAddress, 1_000e6);
    await usdc.connect(bob).approve(poolAddress, 1_000e6);

    await pool.connect(alice).contributeToCommunityPool(0, 1_000e6, 100);
    await pool.connect(bob).contributeToCommunityPool(0, 1_000e6, 300);

    const communityPool = await pool.communityPools(0);
    expect(communityPool.state).to.equal(1n); // ACTIVE
    expect(await pool.totalDeposits()).to.equal(2_000e6);

    await usdc.mint(deployer.address, 400e6);
    await usdc.approve(poolAddress, 400e6);
    await pool.fundCommunityPoolRewards(0, 400e6);

    await pool.connect(alice).claimCommunityPoolRewards(0);
    await pool.connect(bob).claimCommunityPoolRewards(0);

    expect(await usdc.balanceOf(alice.address)).to.equal(100e6);
    expect(await usdc.balanceOf(bob.address)).to.equal(300e6);
  });

  it("allows contributor refunds when fundraising deadline is missed", async () => {
    const { alice, usdc, pool } = await fixture();
    const poolAddress = await pool.getAddress();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const deadline = now + 60;
    await pool.createCommunityPool("Local School Pool", 3_000e6, 3_000e6, deadline, true);

    await usdc.mint(alice.address, 1_000e6);
    await usdc.connect(alice).approve(poolAddress, 1_000e6);
    await pool.connect(alice).contributeToCommunityPool(0, 1_000e6, 200);

    await ethers.provider.send("evm_increaseTime", [120]);
    await ethers.provider.send("evm_mine", []);

    const before = await usdc.balanceOf(alice.address);
    await pool.connect(alice).claimCommunityPoolRefund(0);
    const after = await usdc.balanceOf(alice.address);

    expect(after - before).to.equal(1_000e6);
    const communityPool = await pool.communityPools(0);
    expect(communityPool.state).to.equal(2n); // REFUNDING
  });

  it("supports contribution-sized rewards when building weighting is disabled", async () => {
    const { deployer, alice, bob, carol, usdc, pool } = await fixture();
    const poolAddress = await pool.getAddress();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const deadline = now + ONE_DAY;
    await pool
      .connect(alice)
      .createCommunityPool("Neighborhood Pool", 1_500e6, 1_500e6, deadline, false);

    await usdc.mint(alice.address, 1_000e6);
    await usdc.mint(bob.address, 500e6);
    await usdc.connect(alice).approve(poolAddress, 1_000e6);
    await usdc.connect(bob).approve(poolAddress, 500e6);

    await pool.connect(alice).contributeToCommunityPool(0, 1_000e6, 0);
    await pool.connect(bob).contributeToCommunityPool(0, 500e6, 0);

    await usdc.mint(deployer.address, 300e6);
    await usdc.approve(poolAddress, 300e6);
    await pool.fundCommunityPoolRewards(0, 300e6);

    await pool.connect(alice).claimCommunityPoolRewards(0);
    await pool.connect(bob).claimCommunityPoolRewards(0);

    expect(await usdc.balanceOf(alice.address)).to.equal(200e6);
    expect(await usdc.balanceOf(bob.address)).to.equal(100e6);

    await pool.connect(alice).closeCommunityPool(0);
    const communityPool = await pool.communityPools(0);
    expect(communityPool.state).to.equal(3n); // CLOSED

    await expect(
      pool.connect(carol).closeCommunityPool(0)
    ).to.be.revertedWith("not active");
  });
});
