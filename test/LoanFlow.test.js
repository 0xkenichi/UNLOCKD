const { expect } = require("chai");
const { deployments, ethers } = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function deployFixture() {
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

  return { deployer, lender, borrower, usdc, valuation, pool, loanManager };
}

async function deployVestingWallet({ borrower, usdc, allocation, duration }) {
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const vesting = await MockVestingWallet.deploy(
    borrower.address,
    now,
    duration,
    await usdc.getAddress(),
    allocation
  );
  await vesting.waitForDeployment();
  await usdc.transfer(await vesting.getAddress(), allocation);
  return vesting;
}

describe("Full MVP Flow", () => {
  it("Creates, repays, and settles loan", async () => {
    const { lender, borrower, usdc, pool, loanManager } = await deployFixture();
    const poolAddress = await pool.getAddress();
    const loanManagerAddress = await loanManager.getAddress();

    // Lender deposits USDC
    await usdc.connect(lender).mint(lender.address, 1_000_000e6);
    await usdc.connect(lender).approve(poolAddress, 500_000e6);
    await pool.connect(lender).deposit(500_000e6);

    // Borrower vesting setup
    const vesting = await deployVestingWallet({
      borrower,
      usdc,
      allocation: 200_000e6,
      duration: 30 * ONE_DAY,
    });
    const vestingAddress = await vesting.getAddress();

    // Optional identity link (mock proof)
    await loanManager.connect(borrower).linkIdentity("0x1234");
    expect(await loanManager.identityLinked(borrower.address)).to.equal(true);

    // Borrower requests loan
    await loanManager
      .connect(borrower)
      .createLoan(1, vestingAddress, 50_000e6);

    const loan = await loanManager.loans(0);
    expect(loan.borrower).to.equal(borrower.address);
    expect(loan.principal).to.equal(50_000e6);

    // Repay part
    await usdc.connect(borrower).mint(borrower.address, 10_000e6);
    await usdc.connect(borrower).approve(loanManagerAddress, 10_000e6);
    await loanManager.connect(borrower).repayLoan(0, 10_000e6);

    // Advance time to unlock and settle
    await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await loanManager.settleAtUnlock(0);

    const settled = await loanManager.loans(0);
    expect(settled.active).to.equal(false);
  });

  it("Defaults when no repay at unlock (liquidation path)", async () => {
    const { lender, borrower, usdc, valuation, pool, loanManager } =
      await deployFixture();
    const poolAddress = await pool.getAddress();

    await usdc.connect(lender).mint(lender.address, 500_000e6);
    await usdc.connect(lender).approve(poolAddress, 500_000e6);
    await pool.connect(lender).deposit(500_000e6);

    const priceFeedAddress = await valuation.priceFeed();
    const priceFeed = await ethers.getContractAt(
      "MockPriceFeed",
      priceFeedAddress
    );
    await priceFeed.setPrice(1e8); // $1 with 8 decimals

    const vesting = await deployVestingWallet({
      borrower,
      usdc,
      allocation: 100_000e6,
      duration: 7 * ONE_DAY,
    });

    const quantity = await vesting.totalAllocation();
    const unlockTime = (await vesting.start()) + (await vesting.duration());
    const usdcAddress = await usdc.getAddress();
    const [pv, ltvBps] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime
    );
    const maxBorrow = (pv * ltvBps) / 10_000n;
    const borrowAmount = maxBorrow - 1n;

    await loanManager
      .connect(borrower)
      .createLoan(7, await vesting.getAddress(), borrowAmount);

    await ethers.provider.send("evm_increaseTime", [8 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);

    await expect(loanManager.settleAtUnlock(0))
      .to.emit(loanManager, "LoanSettled")
      .withArgs(0, true);

    const loan = await loanManager.loans(0);
    expect(loan.active).to.equal(false);
    expect(await pool.totalBorrowed()).to.equal(0);
  });

  it("Rejects over-borrow beyond LTV", async () => {
    const { lender, borrower, usdc, valuation, pool, loanManager } =
      await deployFixture();
    const poolAddress = await pool.getAddress();

    const priceFeedAddress = await valuation.priceFeed();
    const priceFeed = await ethers.getContractAt(
      "MockPriceFeed",
      priceFeedAddress
    );
    await priceFeed.setPrice(1e8); // $1 with 8 decimals to keep maxBorrow small

    const vesting = await deployVestingWallet({
      borrower,
      usdc,
      allocation: 50_000e6,
      duration: 30 * ONE_DAY,
    });

    const quantity = await vesting.totalAllocation();
    const unlockTime = (await vesting.start()) + (await vesting.duration());
    const usdcAddress = await usdc.getAddress();

    const [pv, ltvBps] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime
    );
    const maxBorrow = (pv * ltvBps) / 10_000n;
    const overBorrow = maxBorrow + (maxBorrow / 10n) + 1n; // +10% cushion

    await usdc.connect(lender).mint(lender.address, overBorrow);
    await usdc.connect(lender).approve(poolAddress, overBorrow);
    await pool.connect(lender).deposit(overBorrow);

    await expect(
      loanManager
        .connect(borrower)
        .createLoan(42, await vesting.getAddress(), overBorrow)
    ).to.be.revertedWith("exceeds LTV");
  });

  it("Rejects vesting when beneficiary mismatches borrower", async () => {
    const { borrower, lender, usdc, loanManager } = await deployFixture();

    const vesting = await deployVestingWallet({
      borrower: lender,
      usdc,
      allocation: 10_000e6,
      duration: 30 * ONE_DAY,
    });

    await expect(
      loanManager
        .connect(borrower)
        .createLoan(9, await vesting.getAddress(), 1_000e6)
    ).to.be.revertedWith("not beneficiary");
  });

  it("Enforces LTV bounds as volatility changes", async () => {
    const { borrower, usdc, valuation } = await deployFixture();

    const vesting = await deployVestingWallet({
      borrower,
      usdc,
      allocation: 25_000e6,
      duration: 30 * ONE_DAY,
    });

    const quantity = await vesting.totalAllocation();
    const unlockTime = (await vesting.start()) + (await vesting.duration());
    const usdcAddress = await usdc.getAddress();

    await valuation.setVolatility(0);
    const [, ltvLowVol] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime
    );

    await valuation.setVolatility(100);
    const [, ltvHighVol] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime
    );

    expect(ltvLowVol).to.be.greaterThan(ltvHighVol);
    expect(ltvHighVol).to.be.greaterThan(0);
    expect(ltvLowVol).to.be.lessThanOrEqual(10_000);
  });
});
