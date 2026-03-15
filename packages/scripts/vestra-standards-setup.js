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
  const price = ethers.parseUnits("0.85", 8); // $0.85 per VEST
  await (await priceFeed.setPrice(price)).wait();

  const poolAddress = await pool.getAddress();
  const depositAmount = ethers.parseUnits("750000", 6);
  await usdc.connect(lender).faucet(depositAmount);
  await (await usdc.connect(lender).approve(poolAddress, depositAmount)).wait();
  await (await pool.connect(lender).deposit(depositAmount)).wait();
  // Allow the pool to lend from the issuance treasury after deposit.
  const issuanceTreasury = await pool.issuanceTreasury();
  const issuanceSigner =
    issuanceTreasury.toLowerCase() === deployer.address.toLowerCase()
      ? deployer
      : lender;
  await (
    await usdc.connect(issuanceSigner).approve(poolAddress, depositAmount)
  ).wait();

  const vestTokenAddress = await vestToken.getAddress();

  let nextCollateral = BigInt(Math.floor(Date.now() / 1000));
  const logCollateral = (label, collateralId, vestingAddress) => {
    console.log(`${label} Vesting:`, vestingAddress);
    console.log(`${label} Collateral ID:`, collateralId.toString());
  };

  const createLoanForVesting = async (vesting, label) => {
    const total = await vesting.totalAllocation();
    const released = await vesting.released(vestTokenAddress);
    const quantity = total - released;
    const unlockTime = (await vesting.start()) + (await vesting.duration());
    const [pv, ltvBps] = await valuation.computeDPV(
      quantity,
      vestTokenAddress,
      unlockTime
    );
    const maxBorrow = (pv * ltvBps) / 10_000n;
    const borrowAmount = (maxBorrow * 90n) / 100n;
    const collateralId = nextCollateral++;
    await (
      await loanManager
        .connect(borrower)
        .createLoan(collateralId, await vesting.getAddress(), borrowAmount)
    ).wait();
    logCollateral(label, collateralId, await vesting.getAddress());
    console.log(`${label} Borrowed (USDC 6dp):`, borrowAmount.toString());
  };

  const MockOZVestingWallet = await ethers.getContractFactory("MockOZVestingWallet");
  const ozStart = now - 60 * ONE_DAY;
  const ozDuration = 720 * ONE_DAY;
  // Keep allocations tiny to avoid ValuationEngine overflow on local networks.
  const ozAllocation = ethers.parseUnits("0.000001", 18);
  const ozVesting = await MockOZVestingWallet.connect(deployer).deploy(
    borrower.address,
    ozStart,
    ozDuration,
    vestTokenAddress,
    ozAllocation
  );
  await ozVesting.waitForDeployment();
  await (await vestToken.mint(await ozVesting.getAddress(), ozAllocation)).wait();

  const MockTokenTimelock = await ethers.getContractFactory("MockTokenTimelock");
  const tlStart = now - 30 * ONE_DAY;
  const tlDuration = 210 * ONE_DAY;
  const tlAllocation = ethers.parseUnits("0.000001", 18);
  const timelock = await MockTokenTimelock.connect(deployer).deploy(
    borrower.address,
    vestTokenAddress,
    tlStart,
    tlDuration,
    tlAllocation
  );
  await timelock.waitForDeployment();
  await (await vestToken.mint(await timelock.getAddress(), tlAllocation)).wait();

  const MockSablierV2Lockup = await ethers.getContractFactory("MockSablierV2Lockup");
  const sablier = await MockSablierV2Lockup.connect(deployer).deploy();
  await sablier.waitForDeployment();

  const sablierAllocation = ethers.parseUnits("0.000001", 18);
  await (await vestToken.mint(deployer.address, sablierAllocation)).wait();
  await (await vestToken.approve(await sablier.getAddress(), sablierAllocation)).wait();
  const sablierStart = now - 30 * ONE_DAY;
  const sablierEnd = now + 365 * ONE_DAY;
  await sablier
    .connect(deployer)
    .createStream(
      borrower.address,
      vestTokenAddress,
      sablierAllocation,
      sablierStart,
      sablierEnd
    );
  const streamId = (await sablier.nextStreamId()) - 1n;

  const MockSablierV2StreamWrapper = await ethers.getContractFactory(
    "MockSablierV2StreamWrapper"
  );
  const sablierWrapper = await MockSablierV2StreamWrapper.connect(deployer).deploy(
    await sablier.getAddress(),
    streamId
  );
  await sablierWrapper.waitForDeployment();
  await (await sablier.connect(borrower).setApproved(streamId, await sablierWrapper.getAddress(), true)).wait();

  const MockSuperfluidStream = await ethers.getContractFactory("MockSuperfluidStream");
  const sfStart = now - 45 * ONE_DAY;
  const sfEnd = now + 365 * ONE_DAY;
  const sfAllocation = ethers.parseUnits("0.000001", 18);
  const sfStream = await MockSuperfluidStream.connect(deployer).deploy(
    borrower.address,
    vestTokenAddress,
    sfStart,
    sfEnd,
    sfAllocation
  );
  await sfStream.waitForDeployment();
  await (await vestToken.mint(await sfStream.getAddress(), sfAllocation)).wait();

  const MockLinearVestingWallet = await ethers.getContractFactory("MockLinearVestingWallet");
  const linearStart = now - 90 * ONE_DAY;
  const linearDuration = 540 * ONE_DAY;
  const linearCliff = 120 * ONE_DAY;
  const linearAllocation = ethers.parseUnits("0.000001", 18);
  const linearVesting = await MockLinearVestingWallet.connect(deployer).deploy(
    borrower.address,
    linearStart,
    linearDuration,
    linearCliff,
    vestTokenAddress,
    linearAllocation
  );
  await linearVesting.waitForDeployment();
  await (await vestToken.mint(await linearVesting.getAddress(), linearAllocation)).wait();

  await createLoanForVesting(ozVesting, "OpenZeppelin VestingWallet");
  await createLoanForVesting(timelock, "TokenTimelock");
  await createLoanForVesting(sablierWrapper, "Sablier v2");
  await createLoanForVesting(sfStream, "Superfluid");
  await createLoanForVesting(linearVesting, "Linear DAO");

  console.log("VEST token:", vestTokenAddress);
  console.log("Borrower:", borrower.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
