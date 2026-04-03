// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const hre = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function main() {
  const { ethers, deployments } = hre;

  await deployments.fixture(["full"]);

  const [deployer, lender, borrower] = await ethers.getSigners();

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

  const depositAmount = ethers.parseUnits("100000", 6);
  const allocation = ethers.parseUnits("200000", 6);

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
  await (await priceFeed.setPrice(1e8)).wait(); // $1

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const vesting = await MockVestingWallet.connect(deployer).deploy(
    borrower.address,
    now,
    30 * ONE_DAY,
    usdcAddress,
    allocation
  );
  await vesting.waitForDeployment();
  const vestingAddress = await vesting.getAddress();
  await (await usdc.transfer(vestingAddress, allocation)).wait();

  console.log("MockVestingWallet:", vestingAddress);

  const mockProof = ethers.hexlify(ethers.randomBytes(8));
  await (await loanManager.connect(borrower).linkIdentity(mockProof)).wait();

  const quantity = await vesting.totalAllocation();
  const unlockTime = (await vesting.start()) + (await vesting.duration());
  const [pv, ltvBps] = await valuation.computeDPV(
    quantity,
    usdcAddress,
    unlockTime
  );
  const maxBorrow = (pv * ltvBps) / 10_000n;
  const borrowAmount = maxBorrow - 1n;

  await (
    await loanManager
      .connect(borrower)
      .createLoan(1, vestingAddress, borrowAmount)
  ).wait();

  const partialRepay = borrowAmount / 2n;
  await usdc.connect(borrower).faucet(partialRepay);
  await (
    await usdc.connect(borrower).approve(loanManagerAddress, partialRepay)
  ).wait();
  await (await loanManager.connect(borrower).repayLoan(0, partialRepay)).wait();

  await ethers.provider.send("evm_increaseTime", [31 * ONE_DAY]);
  await ethers.provider.send("evm_mine", []);
  await (await priceFeed.setPrice(1e8)).wait();

  await (await loanManager.settleAtUnlock(0)).wait();

  const loan = await loanManager.loans(0);
  if (loan.active) {
    throw new Error("Loan still active after settlement");
  }

  const poolDebt = await pool.totalBorrowed();
  if (poolDebt !== 0n) {
    throw new Error("Pool debt not cleared after settlement");
  }

  const released = await vesting.released(usdcAddress);
  if (released !== allocation) {
    throw new Error("Vesting not fully released after settlement");
  }

  console.log("E2E local flow complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
