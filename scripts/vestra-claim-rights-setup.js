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
  const vestTokenAddress = await vestToken.getAddress();

  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const price = ethers.parseUnits("1.05", 8); // $1.05 per VEST
  await (await priceFeed.setPrice(price)).wait();

  const poolAddress = await pool.getAddress();
  const depositAmount = ethers.parseUnits("1000000", 6);
  await usdc.connect(lender).faucet(depositAmount);
  await (await usdc.connect(lender).approve(poolAddress, depositAmount)).wait();
  await (await pool.connect(lender).deposit(depositAmount)).wait();

  let nextCollateral = BigInt(Math.floor(Date.now() / 1000));
  const logCollateral = (label, collateralId, vestingAddress) => {
    console.log(`${label} Wrapper:`, vestingAddress);
    console.log(`${label} Collateral ID:`, collateralId.toString());
  };

  const createLoanForWrapper = async (wrapper, label) => {
    const total = await wrapper.totalAllocation();
    const released = await wrapper.released(vestTokenAddress);
    const quantity = total - released;
    const unlockTime = (await wrapper.start()) + (await wrapper.duration());
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
        .createLoan(collateralId, await wrapper.getAddress(), borrowAmount)
    ).wait();
    logCollateral(label, collateralId, await wrapper.getAddress());
    console.log(`${label} Borrowed (USDC 6dp):`, borrowAmount.toString());
  };

  const OZVestingClaimWrapper = await ethers.getContractFactory(
    "OZVestingClaimWrapper"
  );
  const ozAllocation = ethers.parseUnits("400000", 18);
  const ozWrapper = await OZVestingClaimWrapper.connect(deployer).deploy(
    borrower.address,
    vestTokenAddress,
    ozAllocation
  );
  await ozWrapper.waitForDeployment();

  const MockOZVestingWallet = await ethers.getContractFactory("MockOZVestingWallet");
  const ozStart = now - 30 * ONE_DAY;
  const ozDuration = 540 * ONE_DAY;
  const ozVesting = await MockOZVestingWallet.connect(deployer).deploy(
    await ozWrapper.getAddress(),
    ozStart,
    ozDuration,
    vestTokenAddress,
    ozAllocation
  );
  await ozVesting.waitForDeployment();
  await (await vestToken.mint(await ozVesting.getAddress(), ozAllocation)).wait();
  await (await ozWrapper.initVesting(await ozVesting.getAddress())).wait();

  const TokenTimelockClaimWrapper = await ethers.getContractFactory(
    "TokenTimelockClaimWrapper"
  );
  const tlAllocation = ethers.parseUnits("220000", 18);
  const tlDuration = 180 * ONE_DAY;
  const tlWrapper = await TokenTimelockClaimWrapper.connect(deployer).deploy(
    borrower.address,
    vestTokenAddress,
    tlAllocation,
    tlDuration
  );
  await tlWrapper.waitForDeployment();

  const MockTokenTimelock = await ethers.getContractFactory("MockTokenTimelock");
  const tlStart = now - 10 * ONE_DAY;
  const tlVesting = await MockTokenTimelock.connect(deployer).deploy(
    await tlWrapper.getAddress(),
    vestTokenAddress,
    tlStart,
    tlDuration,
    tlAllocation
  );
  await tlVesting.waitForDeployment();
  await (await vestToken.mint(await tlVesting.getAddress(), tlAllocation)).wait();
  await (await tlWrapper.initTimelock(await tlVesting.getAddress())).wait();

  const MockSablierV2Lockup = await ethers.getContractFactory("MockSablierV2Lockup");
  const sablier = await MockSablierV2Lockup.connect(deployer).deploy();
  await sablier.waitForDeployment();

  const sablierAllocation = ethers.parseUnits("260000", 18);
  await (await vestToken.mint(deployer.address, sablierAllocation)).wait();
  await (await vestToken.approve(await sablier.getAddress(), sablierAllocation)).wait();
  const sablierStart = now - 15 * ONE_DAY;
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

  const SablierV2OperatorWrapper = await ethers.getContractFactory(
    "SablierV2OperatorWrapper"
  );
  const sablierWrapper = await SablierV2OperatorWrapper.connect(deployer).deploy(
    await sablier.getAddress(),
    streamId,
    borrower.address
  );
  await sablierWrapper.waitForDeployment();
  await (await sablier.connect(borrower).setApproved(streamId, await sablierWrapper.getAddress(), true)).wait();

  const SuperfluidClaimWrapper = await ethers.getContractFactory(
    "SuperfluidClaimWrapper"
  );
  const sfAllocation = ethers.parseUnits("180000", 18);
  const sfStart = now - 20 * ONE_DAY;
  const sfDuration = 300 * ONE_DAY;
  const sfWrapper = await SuperfluidClaimWrapper.connect(deployer).deploy(
    borrower.address,
    vestTokenAddress,
    sfAllocation,
    sfStart,
    sfDuration
  );
  await sfWrapper.waitForDeployment();
  await (await vestToken.mint(await sfWrapper.getAddress(), sfAllocation)).wait();

  await createLoanForWrapper(ozWrapper, "OZ VestingWallet");
  await createLoanForWrapper(tlWrapper, "TokenTimelock");
  await createLoanForWrapper(sablierWrapper, "Sablier v2");
  await createLoanForWrapper(sfWrapper, "Superfluid");

  console.log("VEST token:", vestTokenAddress);
  console.log("Borrower:", borrower.address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
