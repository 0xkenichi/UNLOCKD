// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const hre = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function main() {
  const { ethers, deployments, network } = hre;

  if (network.name !== "sepolia") {
    throw new Error("Run with --network sepolia");
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

  const poolAddress = await pool.getAddress();
  const loanManagerAddress = await loanManager.getAddress();
  const usdcAddress = await usdc.getAddress();

  const depositAmount = ethers.parseUnits("5000", 6);
  const allocation = ethers.parseUnits("100000", 6);
  const borrowAmount = ethers.parseUnits("250", 6);
  const repayAmount = ethers.parseUnits("50", 6);

  console.log("MockUSDC:", usdcAddress);
  console.log("LoanManager:", loanManagerAddress);
  console.log("LendingPool:", poolAddress);

  await usdc.connect(lender).faucet(depositAmount);
  await (await usdc.connect(lender).approve(poolAddress, depositAmount)).wait();
  await (await pool.connect(lender).deposit(depositAmount)).wait();
  await (await usdc.connect(deployer).approve(poolAddress, depositAmount)).wait();

  const priceFeedAddress = await valuation.priceFeed();
  const priceFeed = await ethers.getContractAt(
    "MockPriceFeed",
    priceFeedAddress,
    deployer
  );
  await (await priceFeed.setPrice(ethers.parseUnits("1", 8))).wait(); // $1

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const vesting = await MockVestingWallet.connect(deployer).deploy(
    borrower.address,
    now,
    90 * ONE_DAY,
    usdcAddress,
    allocation
  );
  await vesting.waitForDeployment();
  const vestingAddress = await vesting.getAddress();
  await (await usdc.connect(deployer).transfer(vestingAddress, allocation)).wait();

  const collateralId = BigInt(Math.floor(Date.now() / 1000));
  const loanId = await loanManager.loanCount();

  await (
    await loanManager
      .connect(borrower)
      .createLoan(collateralId, vestingAddress, borrowAmount)
  ).wait();

  await usdc.connect(borrower).faucet(repayAmount);
  await (
    await usdc.connect(borrower).approve(loanManagerAddress, repayAmount)
  ).wait();
  await (await loanManager.connect(borrower).repayLoan(loanId, repayAmount)).wait();

  const loan = await loanManager.loans(loanId);

  console.log("Vesting wallet:", vestingAddress);
  console.log("Borrower:", borrower.address);
  console.log("Collateral ID:", collateralId.toString());
  console.log("Loan ID:", loanId.toString());
  console.log("Loan principal:", loan.principal.toString());
  console.log("Loan interest:", loan.interest.toString());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
