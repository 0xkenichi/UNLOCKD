// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const hre = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function main() {
  const { ethers, deployments, network } = hre;

  if (network.name === "hardhat" || network.name === "localhost") {
    await deployments.fixture(["full"]);
  }

  const [deployer, lenderFallback, borrowerFallback] = await ethers.getSigners();
  const lender = lenderFallback || deployer;
  const borrower = borrowerFallback || deployer;

  const usdcDeployment = await deployments.get("MockUSDC");
  const valuationDeployment = await deployments.get("ValuationEngine");
  const poolDeployment = await deployments.get("LendingPool");
  const loanManagerDeployment = await deployments.get("LoanManager");

  const usdc = await ethers.getContractAt(
    "MockUSDC",
    usdcDeployment.address,
    deployer
  );
  const valuation = await ethers.getContractAt(
    "ValuationEngine",
    valuationDeployment.address,
    deployer
  );
  const pool = await ethers.getContractAt(
    "LendingPool",
    poolDeployment.address,
    deployer
  );
  const loanManager = await ethers.getContractAt(
    "LoanManager",
    loanManagerDeployment.address,
    deployer
  );

  const priceFeedAddress = await valuation.priceFeed();
  const priceFeed = await ethers.getContractAt(
    "MockPriceFeed",
    priceFeedAddress,
    deployer
  );

  const MockVestraToken = await ethers.getContractFactory("MockVestraToken");
  const vestToken = await MockVestraToken.connect(deployer).deploy();
  await vestToken.waitForDeployment();

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const start = now - 120 * ONE_DAY; // vesting started ~4 months ago
  const duration = 720 * ONE_DAY; // 24 months total
  const cliff = 90 * ONE_DAY; // 3 month cliff

  // Keep allocation tiny to avoid ValuationEngine overflow and pool limits.
  const allocation = ethers.parseUnits("0.000001", 18); // 1e-6 VEST

  const MockLinearVestingWallet = await ethers.getContractFactory(
    "MockLinearVestingWallet"
  );
  const vesting = await MockLinearVestingWallet.connect(deployer).deploy(
    borrower.address,
    start,
    duration,
    cliff,
    await vestToken.getAddress(),
    allocation
  );
  await vesting.waitForDeployment();

  const vestingAddress = await vesting.getAddress();
  await (await vestToken.mint(vestingAddress, allocation)).wait();

  const releasable = await vesting.releasableAmount();
  if (releasable > 0n) {
    const partialRelease = releasable / 2n;
    if (partialRelease > 0n) {
      await (await vesting.connect(borrower).release(partialRelease)).wait();
    }
  }

  const depositAmount = ethers.parseUnits("500000", 6); // 500k USDC liquidity
  const poolAddress = await pool.getAddress();
  const issuanceTreasury = await pool.issuanceTreasury();
  const issuanceSigner =
    issuanceTreasury.toLowerCase() === deployer.address.toLowerCase()
      ? deployer
      : lender;
  await usdc.connect(lender).faucet(depositAmount);
  await (await usdc.connect(lender).approve(poolAddress, depositAmount)).wait();
  await (await pool.connect(lender).deposit(depositAmount)).wait();
  // Allow the pool to lend from the issuance treasury after deposit.
  await (
    await usdc.connect(issuanceSigner).approve(poolAddress, depositAmount)
  ).wait();

  const price = ethers.parseUnits("0.72", 8); // $0.72 per VEST
  await (await priceFeed.setPrice(price)).wait();

  const released = await vesting.released(await vestToken.getAddress());
  const quantity = allocation - released;
  const unlockTime = start + duration;

  const [pv, ltvBps] = await valuation.computeDPV(
    quantity,
    await vestToken.getAddress(),
    unlockTime
  );
  const maxBorrow = (pv * ltvBps) / 10_000n;
  let borrowAmount = (maxBorrow * 90n) / 100n; // 90% of max LTV
  const availableLiquidity = await pool.availableLiquidity();
  const liquidityBorrow = availableLiquidity / 2n;
  if (borrowAmount > liquidityBorrow) {
    borrowAmount = liquidityBorrow;
  }
  if (borrowAmount > maxBorrow) {
    borrowAmount = maxBorrow;
  }
  if (borrowAmount === 0n) {
    throw new Error("insufficient liquidity for test borrow");
  }
  console.log("Available liquidity (USDC 6dp):", availableLiquidity.toString());
  console.log("Max borrow (USDC 6dp):", maxBorrow.toString());
  console.log("Borrow amount (USDC 6dp):", borrowAmount.toString());

  const collateralId = process.env.COLLATERAL_ID
    ? BigInt(process.env.COLLATERAL_ID)
    : BigInt(Math.floor(Date.now() / 1000));

  await (
    await loanManager
      .connect(borrower)
      .createLoan(collateralId, vestingAddress, borrowAmount)
  ).wait();

  console.log("VEST token:", await vestToken.getAddress());
  console.log("Vesting wallet:", vestingAddress);
  console.log("Borrower:", borrower.address);
  console.log("Collateral ID:", collateralId.toString());
  console.log("Unlock time:", unlockTime.toString());
  console.log("Remaining vested amount:", quantity.toString());
  console.log("DPV (USD 6dp):", pv.toString());
  console.log("LTV (bps):", ltvBps.toString());
  console.log("Borrowed (USDC 6dp):", borrowAmount.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
