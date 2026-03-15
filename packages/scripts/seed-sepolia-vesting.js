// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const hre = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function main() {
  const { ethers, deployments, network } = hre;

  if (network.name !== "sepolia") {
    throw new Error("Run with --network sepolia");
  }

  const [deployer, borrowerFallback] = await ethers.getSigners();
  const borrower = borrowerFallback || deployer;

  const collateralId = process.env.COLLATERAL_ID
    ? BigInt(process.env.COLLATERAL_ID)
    : BigInt(Math.floor(Date.now() / 1000));

  const usdcDeployment = await deployments.get("MockUSDC");
  const vestingAdapterDeployment = await deployments.get("VestingAdapter");

  const usdc = await ethers.getContractAt(
    "MockUSDC",
    usdcDeployment.address,
    deployer
  );
  const vestingAdapter = await ethers.getContractAt(
    "VestingAdapter",
    vestingAdapterDeployment.address,
    deployer
  );

  if (process.env.SEED_SABLIER === "1") {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const MockSablierV2Lockup = await ethers.getContractFactory(
      "MockSablierV2Lockup"
    );
    const sablier = await MockSablierV2Lockup.connect(deployer).deploy();
    await sablier.waitForDeployment();

    const allocation = ethers.parseUnits("10000", 6);
    const usdcAddress = await usdc.getAddress();
    await usdc.mint(borrower.address, allocation);
    await usdc
      .connect(borrower)
      .approve(await sablier.getAddress(), allocation);

    const start = now - 15 * ONE_DAY;
    const end = now + 365 * ONE_DAY;
    await sablier
      .connect(borrower)
      .createStream(
        borrower.address,
        usdcAddress,
        allocation,
        start,
        end
      );
    const streamId = (await sablier.nextStreamId()) - 1n;

    const SablierV2OperatorWrapper = await ethers.getContractFactory(
      "SablierV2OperatorWrapper"
    );
    const wrapper = await SablierV2OperatorWrapper.connect(deployer).deploy(
      await sablier.getAddress(),
      streamId,
      borrower.address
    );
    await wrapper.waitForDeployment();
    await sablier
      .connect(borrower)
      .setApproved(streamId, await wrapper.getAddress(), true);

    const vestingAddress = await wrapper.getAddress();
    console.log("Sablier v2 wrapper (vesting contract) deployed:", vestingAddress);
    console.log("MockSablierV2Lockup:", await sablier.getAddress());
    console.log("Stream ID:", streamId.toString());
    console.log("Borrower:", borrower.address);
    console.log("Collateral ID (use in UI):", collateralId.toString());

    const escrowTx = await vestingAdapter
      .connect(borrower)
      .escrow(collateralId, vestingAddress, borrower.address);
    await escrowTx.wait();
    console.log("Escrowed Sablier-backed collateral. Use this ID in the UI.");
    return;
  }

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const vesting = await MockVestingWallet.connect(deployer).deploy(
    borrower.address,
    now,
    180 * ONE_DAY,
    await usdc.getAddress(),
    ethers.parseUnits("10000", 6)
  );
  await vesting.waitForDeployment();

  const vestingAddress = await vesting.getAddress();

  console.log("MockVestingWallet deployed:", vestingAddress);
  console.log("Borrower:", borrower.address);
  console.log("Collateral ID:", collateralId.toString());

  const escrowTx = await vestingAdapter
    .connect(borrower)
    .escrow(collateralId, vestingAddress, borrower.address);
  await escrowTx.wait();

  console.log("Escrowed collateral. Use this ID in the UI.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
