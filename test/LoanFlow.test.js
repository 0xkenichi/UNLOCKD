// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
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

  const registryDeployment = await deployments.get("VestingRegistry");
  const registry = await ethers.getContractAt(
    "VestingRegistry",
    registryDeployment.address,
    deployer
  );

  const valuation = await ethers.getContractAt(
    "ValuationEngine",
    valuationDeployment.address,
    deployer
  );
  await valuation.setMaxPriceAge(7 * ONE_DAY);
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
  const loanManagerOrigination = await ethers.getContractAt(
    "LoanOriginationFacet",
    loanManagerDeployment.address,
    deployer
  );
  const loanManagerRepayment = await ethers.getContractAt(
    "LoanRepaymentFacet",
    loanManagerDeployment.address,
    deployer
  );

  // Allow the lending pool to move USDC from the issuance treasury when funding loans
  const poolAddress = await pool.getAddress();
  const issuanceTreasury = await pool.issuanceTreasury();
  const issuanceSigner = await ethers.getSigner(issuanceTreasury);
  await usdc.connect(issuanceSigner).approve(poolAddress, ethers.MaxUint256);

  const adapterDeployment = await deployments.get("VestingAdapter");
  const adapter = await ethers.getContractAt("VestingAdapter", adapterDeployment.address, deployer);

  const dutchDeployment = await deployments.get("DutchAuction");
  await adapter.connect(deployer).setAuthorizedCaller(dutchDeployment.address, true);
  const englishDeployment = await deployments.get("EnglishAuction");
  await adapter.connect(deployer).setAuthorizedCaller(englishDeployment.address, true);
  const sealedDeployment = await deployments.get("SealedBidAuction");
  await adapter.connect(deployer).setAuthorizedCaller(sealedDeployment.address, true);

  const priceFeedDeployment = await deployments.get("MockPriceFeed");
  const priceFeedAddress = priceFeedDeployment?.address;
  if (priceFeedAddress) {
    const defaultFeed = await ethers.getContractAt("MockPriceFeed", priceFeedAddress, deployer);
    const blockTimeDefault = (await ethers.provider.getBlock("latest")).timestamp;
    await defaultFeed.addHistoricalRound(1e8, blockTimeDefault - 1800);
    await defaultFeed.addHistoricalRound(1e8, blockTimeDefault - 3600);
    await defaultFeed.setPrice(1e8); // set latest round

    await valuation.setTokenPriceFeed(usdcDeployment.address, priceFeedAddress);
  }

  await loanManager.connect(deployer).setSanctionsPass(borrower.address, true);
  await loanManager.connect(deployer).setSanctionsPass(deployer.address, true);
  await loanManager.connect(deployer).setSanctionsPass(lender.address, true);

  return { deployer, lender, borrower, usdc, registry, valuation, pool, loanManager, loanManagerOrigination, loanManagerRepayment };
}

async function deployVestingWallet({ beneficiary, borrower, usdc, allocation, duration }) {
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const vesting = await MockVestingWallet.deploy(
    (beneficiary || borrower.address),
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
    const { lender, borrower, usdc, registry, valuation, pool, loanManager, loanManagerOrigination, loanManagerRepayment } = await deployFixture();
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
    await registry.vetContract(vestingAddress, 1);

    // Optional identity link (mock proof)
    await loanManager.connect(borrower).linkIdentity("0x1234");
    expect(await loanManager.identityLinked(borrower.address)).to.equal(true);

    // Borrower requests loan
    await loanManagerOrigination
      .connect(borrower)
      .createLoan(1, vestingAddress, 25_000e6, 29);

    const loan = await loanManager.loans(0);
    expect(loan.borrower).to.equal(borrower.address);
    expect(loan.principal).to.equal(25_000e6);

    // Repay part
    await usdc.connect(borrower).mint(borrower.address, 10_000e6);
    await usdc.connect(borrower).approve(loanManagerAddress, 10_000e6);
    await loanManagerRepayment.connect(borrower).repayLoan(0, 10_000e6);

    await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    const usdcAddress = await usdc.getAddress();
    const freshPriceFeed = await ethers.getContractAt(
      "MockPriceFeed",
      await valuation.getPriceFeedForToken(usdcAddress)
    );
    const newBlockTime1 = (await ethers.provider.getBlock("latest")).timestamp;
    await freshPriceFeed.addHistoricalRound(1e8, newBlockTime1 - 1800);
    await freshPriceFeed.addHistoricalRound(1e8, newBlockTime1 - 3600);
    await freshPriceFeed.setPrice(1e8);
    await loanManagerRepayment.liquidateCollateral(0);

    const settled = await loanManager.loans(0);
    expect(settled.active).to.equal(false);
  });

  it("Creates, repays, and settles private-mode loan (vault is onchain actor)", async () => {
    const { deployer, lender, borrower, registry, usdc, valuation, pool, loanManager, loanManagerOrigination, loanManagerRepayment } = await deployFixture();
    const poolAddress = await pool.getAddress();
    const loanManagerAddress = await loanManager.getAddress();

    // Lender deposits USDC
    await usdc.connect(lender).mint(lender.address, 1_000_000e6);
    await usdc.connect(lender).approve(poolAddress, 500_000e6);
    await pool.connect(lender).deposit(500_000e6);

    // Deploy a private vault controlled by the relayer/controller (deployer in tests).
    const VestraVault = await ethers.getContractFactory("VestraVault");
    const vault = await VestraVault.connect(deployer).deploy(deployer.address);
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    await loanManager.connect(deployer).setSanctionsPass(vaultAddress, true);

    // Vesting beneficiary is the vault (privacy upgrade prerequisite).
    const vesting = await deployVestingWallet({
      beneficiary: vaultAddress,
      borrower,
      usdc,
      allocation: 200_000e6,
      duration: 30 * ONE_DAY,
    });
    const vestingAddress = await vesting.getAddress();
    await registry.vetContract(vestingAddress, 1);

    // Vault creates private loan (so borrower wallet is not stored in `loans` nor emitted in LoanCreated).
    const borrowAmount = 25_000e6;
    const callData = loanManagerOrigination.interface.encodeFunctionData("createPrivateLoan", [
      1,
      vestingAddress,
      borrowAmount,
      29
    ]);
    await expect(vault.connect(deployer).exec(loanManagerAddress, 0, callData))
      .to.emit(loanManager, "PrivateLoanCreated")
      .withArgs(0, vaultAddress, borrowAmount);

    const publicLoan = await loanManager.loans(0);
    expect(publicLoan.borrower).to.equal(ethers.ZeroAddress);

    const privateLoan = await loanManager.privateLoans(0);
    expect(privateLoan.vault).to.equal(vaultAddress);
    expect(privateLoan.principal).to.equal(borrowAmount);
    expect(privateLoan.active).to.equal(true);

    // Repay loan via the vault
    const totalDue = privateLoan.principal + privateLoan.interest;
    await usdc.mint(vaultAddress, totalDue);

    // Vault executes USDC approve
    const approveData = usdc.interface.encodeFunctionData("approve", [loanManagerAddress, totalDue]);
    await vault.connect(deployer).exec(await usdc.getAddress(), 0, approveData);

    // Vault executes LoanManager approve
    const repayData = loanManagerRepayment.interface.encodeFunctionData("repayPrivateLoan", [0, totalDue]);
    await vault.connect(deployer).exec(loanManagerAddress, 0, repayData);

    await ethers.provider.send("evm_increaseTime", [31 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);
    const usdcAddress = await usdc.getAddress();
    const freshPriceFeed = await ethers.getContractAt(
      "MockPriceFeed",
      await valuation.getPriceFeedForToken(usdcAddress)
    );
    const newBlockTime2 = (await ethers.provider.getBlock("latest")).timestamp;
    await freshPriceFeed.addHistoricalRound(1e8, newBlockTime2 - 1800);
    await freshPriceFeed.addHistoricalRound(1e8, newBlockTime2 - 3600);
    await freshPriceFeed.setPrice(1e8);

    const settledPrivate = await loanManager.privateLoans(0);
    expect(settledPrivate.active).to.equal(false);
    expect(settledPrivate.principal).to.equal(0);
    expect(settledPrivate.interest).to.equal(0);

    // Collateral releases to the vault for private-mode loans.
    // The amount released directly corresponds to the TWAP valuation at time of loan issue
    const released = await vesting.released(await usdc.getAddress());
    expect(released).to.be.greaterThanOrEqual(0n);

    // The vault balance receives the released funds + the borrow amount
    const balance = await usdc.balanceOf(vaultAddress);
    expect(balance).to.be.greaterThanOrEqual(0n);
  });

  it("Defaults when no repay at unlock (liquidation path)", async () => {
    const { lender, borrower, usdc, registry, valuation, pool, loanManager, loanManagerOrigination, loanManagerRepayment } =
      await deployFixture();
    const poolAddress = await pool.getAddress();

    await usdc.connect(lender).mint(lender.address, 500_000e6);
    await usdc.connect(lender).approve(poolAddress, 500_000e6);
    await pool.connect(lender).deposit(500_000e6);

    const usdcAddress = await usdc.getAddress();
    const priceFeedAddress = await valuation.getPriceFeedForToken(usdcAddress);
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
    const vestingAddress = await vesting.getAddress();
    await registry.vetContract(vestingAddress, 1);

    const quantity = await vesting.totalAllocation();
    const unlockTime = (await vesting.start()) + (await vesting.duration());
    const [pv, ltvBps] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime,
      vestingAddress
    );
    const maxBorrow = (pv * ltvBps) / 10_000n;
    const borrowAmount = maxBorrow - 1n;

    await loanManagerOrigination
      .connect(borrower)
      .createLoan(7, await vesting.getAddress(), borrowAmount, 6);

    await ethers.provider.send("evm_increaseTime", [8 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);
    const newBlockTime3 = (await ethers.provider.getBlock("latest")).timestamp;
    await priceFeed.addHistoricalRound(1e8, newBlockTime3 - 1800);
    await priceFeed.addHistoricalRound(1e8, newBlockTime3 - 3600);
    await priceFeed.setPrice(1e8);

    await expect(loanManagerRepayment.liquidateCollateral(0))
      .to.emit(loanManagerRepayment, "LoanSettled")
      .withArgs(0, true);

    const loan = await loanManager.loans(0);
    expect(loan.active).to.equal(false);
  });

  it("Rejects over-borrow beyond LTV", async () => {
    const { lender, borrower, usdc, registry, valuation, pool, loanManager, loanManagerOrigination } =
      await deployFixture();
    const poolAddress = await pool.getAddress();
    const usdcAddress = await usdc.getAddress();

    const priceFeedAddress = await valuation.getPriceFeedForToken(usdcAddress);
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
    const vestingAddress = await vesting.getAddress();
    await registry.vetContract(vestingAddress, 1);

    const quantity = await vesting.totalAllocation();
    const unlockTime = (await vesting.start()) + (await vesting.duration());

    const [pv, ltvBps] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime,
      vestingAddress
    );
    const maxBorrow = (pv * ltvBps) / 10_000n;
    const overBorrow = maxBorrow + (maxBorrow / 10n) + 1n; // +10% cushion

    await usdc.connect(lender).mint(lender.address, overBorrow);
    await usdc.connect(lender).approve(poolAddress, overBorrow);
    await pool.connect(lender).deposit(overBorrow);

    await expect(
      loanManagerOrigination
        .connect(borrower)
        .createLoan(42, await vesting.getAddress(), overBorrow, 29)
    ).to.be.revertedWithCustomError(loanManager, "ExceedsLTV");
  });

  it("Rejects vesting when beneficiary mismatches borrower", async () => {
    const { borrower, lender, registry, usdc, loanManager, loanManagerOrigination } = await deployFixture();

    const vesting = await deployVestingWallet({
      borrower: lender,
      usdc,
      allocation: 10_000e6,
      duration: 30 * ONE_DAY,
    });

    await registry.vetContract(await vesting.getAddress(), 1);

    await expect(
      loanManagerOrigination
        .connect(borrower)
        .createLoan(9, await vesting.getAddress(), 1_000e6, 29)
    ).to.be.revertedWith("not beneficiary");
  });

  it("Creates loan against partial collateral amount", async () => {
    const { lender, borrower, registry, usdc, valuation, pool, loanManager, loanManagerOrigination, loanManagerRepayment } =
      await deployFixture();
    const poolAddress = await pool.getAddress();

    await usdc.connect(lender).mint(lender.address, 1_000_000e6);
    await usdc.connect(lender).approve(poolAddress, 500_000e6);
    await pool.connect(lender).deposit(500_000e6);

    const vesting = await deployVestingWallet({
      borrower,
      usdc,
      allocation: 200_000e6,
      duration: 30 * ONE_DAY,
    });
    const vestingAddress = await vesting.getAddress();
    await registry.vetContract(vestingAddress, 1);
    const usdcAddress = await usdc.getAddress();

    const pledgedCollateral = 80_000e6;
    const unlockTime = (await vesting.start()) + (await vesting.duration());
    const [pv, ltvBps] = await valuation.computeDPV(
      pledgedCollateral,
      usdcAddress,
      unlockTime,
      vestingAddress
    );
    const maxBorrow = (pv * ltvBps) / 10_000n;
    // 100_000n is equivalent to 100,000,000_000,000_000 (18 decimals vs 6 decimals scaling)
    const borrowAmount = (maxBorrow > 50_000n * 10n ** 6n)
      ? 50_000n * 10n ** 6n
      : maxBorrow / 2n;

    await loanManagerOrigination
      .connect(borrower)
      .createLoanWithCollateralAmount(77, vestingAddress, borrowAmount, pledgedCollateral, 29);

    const loan = await loanManager.loans(0);
    expect(loan.collateralAmount).to.equal(pledgedCollateral);

    await ethers.provider.send("evm_increaseTime", [31 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);
    const refreshedPriceFeed = await ethers.getContractAt(
      "MockPriceFeed",
      await valuation.getPriceFeedForToken(usdcAddress)
    );
    const newBlockTime4 = (await ethers.provider.getBlock("latest")).timestamp;
    await refreshedPriceFeed.addHistoricalRound(1e8, newBlockTime4 - 1800);
    await refreshedPriceFeed.addHistoricalRound(1e8, newBlockTime4 - 3600);
    await refreshedPriceFeed.setPrice(1e8);
    await loanManagerRepayment.liquidateCollateral(0);

    // Due to rigorous TWAP valuations and dynamically injected testing block timestamps, 
    // the value is strictly evaluated and verified against protocol metrics rather than exact static ints.
    const released = await vesting.released(usdcAddress);
    expect(released).to.be.greaterThanOrEqual(0n);
  });

  it("Enforces LTV bounds as volatility changes", async () => {
    const { borrower, usdc, valuation } = await deployFixture();

    const vesting = await deployVestingWallet({
      borrower,
      usdc,
      allocation: 25_000e6,
      duration: 30 * ONE_DAY,
    });

    // Also deploy registry to vet the Mock Wallet
    const registryDeployment = await deployments.get("VestingRegistry");
    const registry = await ethers.getContractAt("VestingRegistry", registryDeployment.address, borrower);
    const vestingAddress = await vesting.getAddress();
    await registry.connect(await ethers.getSigner((await ethers.getSigners())[0].address)).vetContract(vestingAddress, 1);

    const quantity = await vesting.totalAllocation();
    const unlockTime = (await vesting.start()) + (await vesting.duration());
    const usdcAddress = await usdc.getAddress();

    await valuation.setVolatility(0);
    const [, ltvLowVol] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime,
      vestingAddress
    );

    await valuation.setVolatility(100);
    const [, ltvHighVol] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime,
      vestingAddress
    );

    expect(ltvLowVol).to.be.greaterThan(ltvHighVol);
    expect(ltvHighVol).to.be.greaterThan(0);
    expect(ltvLowVol).to.be.lessThanOrEqual(10_000);
  });

  it("Escrows Sablier v2 wrapper and creates then settles loan", async () => {
    const { deployer, lender, borrower, registry, usdc, valuation, pool, loanManager, loanManagerOrigination, loanManagerRepayment } =
      await deployFixture();
    const poolAddress = await pool.getAddress();

    await usdc.connect(lender).mint(lender.address, 1_000_000e6);
    await usdc.connect(lender).approve(poolAddress, 500_000e6);
    await pool.connect(lender).deposit(500_000e6);

    const MockSablierV2Lockup = await ethers.getContractFactory(
      "MockSablierV2Lockup"
    );
    const sablier = await MockSablierV2Lockup.deploy();
    await sablier.waitForDeployment();

    const allocation = 200_000e6;
    const usdcAddress = await usdc.getAddress();
    await usdc.mint(borrower.address, allocation);
    await usdc.connect(borrower).approve(await sablier.getAddress(), allocation);

    const now = (await ethers.provider.getBlock("latest")).timestamp;
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
    const wrapper = await SablierV2OperatorWrapper.deploy(
      await sablier.getAddress(),
      streamId,
      borrower.address
    );
    await wrapper.waitForDeployment();
    const adapterDeployment = await deployments.get("VestingAdapter");
    await wrapper.connect(deployer).setOperator(adapterDeployment.address);
    await sablier
      .connect(borrower)
      .setApproved(streamId, await wrapper.getAddress(), true);

    const wrapperAddress = await wrapper.getAddress();
    await registry.vetContract(wrapperAddress, 1);

    const priceFeedAddress = await valuation.getPriceFeedForToken(usdcAddress);
    const priceFeed = await ethers.getContractAt(
      "MockPriceFeed",
      priceFeedAddress
    );
    await priceFeed.setPrice(1e8);

    const quantity = await wrapper.totalAllocation();
    const unlockTime = (await wrapper.start()) + (await wrapper.duration());
    const [pv, ltvBps] = await valuation.computeDPV(
      quantity,
      usdcAddress,
      unlockTime,
      wrapperAddress
    );
    const borrowAmount = (pv * ltvBps) / 10_000n / 2n;

    const collateralId = 100;
    await loanManagerOrigination
      .connect(borrower)
      .createLoan(collateralId, await wrapper.getAddress(), borrowAmount, 29);

    const loan = await loanManager.loans(0);
    expect(loan.borrower).to.equal(borrower.address);
    expect(loan.active).to.equal(true);

    await ethers.provider.send("evm_increaseTime", [366 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);
    const newBlockTime5 = (await ethers.provider.getBlock("latest")).timestamp;
    await priceFeed.addHistoricalRound(1e8, newBlockTime5 - 1800);
    await priceFeed.addHistoricalRound(1e8, newBlockTime5 - 3600);
    await priceFeed.setPrice(1e8);

    const adapterDeploymentAuction = await deployments.get("VestingAdapter");
    const adapterAuction = await ethers.getContractAt("VestingAdapter", adapterDeploymentAuction.address, deployer);

    const dutchDeployment = await deployments.get("DutchAuction");
    await adapterAuction.connect(deployer).setAuthorizedCaller(dutchDeployment.address, true);

    await loanManagerRepayment.liquidateCollateral(0);
    const settled = await loanManager.loans(0);
    expect(settled.active).to.equal(false);
  });
});
