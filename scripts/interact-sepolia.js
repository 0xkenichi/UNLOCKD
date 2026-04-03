// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const hre = require("hardhat");

async function main() {
  const { ethers, deployments, network } = hre;

  if (network.name !== "sepolia") {
    throw new Error("Run with --network sepolia");
  }

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const lender = signers[1] || deployer;
  const borrower = signers[2] || deployer;

  const usdcDeployment = await deployments.get("MockUSDC");
  const loanManagerDeployment = await deployments.get("LoanManager");
  const poolDeployment = await deployments.get("LendingPool");

  const usdc = await ethers.getContractAt(
    "MockUSDC",
    usdcDeployment.address,
    deployer
  );
  const loanManager = await ethers.getContractAt(
    "LoanManager",
    loanManagerDeployment.address,
    deployer
  );
  const pool = await ethers.getContractAt(
    "LendingPool",
    poolDeployment.address,
    deployer
  );

  const poolAddress = await pool.getAddress();
  const loanManagerAddress = await loanManager.getAddress();
  const usdcAddress = await usdc.getAddress();

  const depositAmount = ethers.parseUnits("1000", 6);
  const borrowAmount = ethers.parseUnits("200", 6);
  const repayAmount = ethers.parseUnits("50", 6);
  const collateralId = process.env.COLLATERAL_ID
    ? BigInt(process.env.COLLATERAL_ID)
    : BigInt(Math.floor(Date.now() / 1000));

  console.log("Using MockUSDC:", usdcAddress);
  console.log("LoanManager:", loanManagerAddress);
  console.log("LendingPool:", poolAddress);

  // Fund lender and deposit into pool
  await ensureBalance(usdc, deployer, lender.address, depositAmount, "lender");
  await (await usdc.connect(lender).approve(poolAddress, depositAmount)).wait();
  await (await pool.connect(lender).deposit(depositAmount)).wait();
  // Allow pool to lend from issuance treasury after deposit.
  await (await usdc.connect(lender).approve(poolAddress, depositAmount)).wait();

  // Deploy mock vesting wallet for borrower
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const vesting = await MockVestingWallet.connect(deployer).deploy(
    borrower.address,
    now,
    30 * 24 * 60 * 60,
    usdcAddress,
    ethers.parseUnits("5000", 6)
  );
  await vesting.waitForDeployment();
  const vestingAddress = await vesting.getAddress();

  console.log("MockVestingWallet:", vestingAddress);

  // Mock identity link (Semaphore-style proof)
  const mockProof = ethers.hexlify(ethers.randomBytes(8));
  await (await loanManager.connect(borrower).linkIdentity(mockProof)).wait();
  console.log("Identity linked with mock proof:", mockProof);

  // Create loan
  const loanId = await loanManager.loanCount();
  await (
    await loanManager
      .connect(borrower)
      .createLoan(collateralId, vestingAddress, borrowAmount)
  ).wait();

  console.log("Loan created. Loan ID:", loanId.toString());

  // Partial repay
  await ensureBalance(
    usdc,
    deployer,
    borrower.address,
    repayAmount,
    "borrower"
  );
  await (
    await usdc.connect(borrower).approve(loanManagerAddress, repayAmount)
  ).wait();
  await (await loanManager.connect(borrower).repayLoan(loanId, repayAmount)).wait();

  console.log("Partial repayment complete.");
}

async function ensureBalance(usdc, minter, target, amount, label) {
  try {
    const tx = await usdc.connect(minter).mint(target, amount);
    await tx.wait();
  } catch (error) {
    const current = await usdc.balanceOf(target);
    if (current < amount) {
      throw new Error(
        `Insufficient USDC for ${label}. Need ${amount} (6 decimals).`
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
