// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { expect } = require("chai");
const { deployments, ethers } = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function deployFixture() {
  await deployments.fixture(["full"]);

  const [deployer, lender, keeper, ...borrowers] = await ethers.getSigners();

  const usdcDeployment = await deployments.get("MockUSDC");
  const valuationDeployment = await deployments.get("ValuationEngine");
  const poolDeployment = await deployments.get("LendingPool");
  const loanManagerDeployment = await deployments.get("LoanManager");

  const usdc = await ethers.getContractAt("MockUSDC", usdcDeployment.address, deployer);
  const valuation = await ethers.getContractAt(
    "ValuationEngine",
    valuationDeployment.address,
    deployer
  );

  const registryDeployment = await deployments.get("VestingRegistry");
  const registry = await ethers.getContractAt("VestingRegistry", registryDeployment.address, deployer);
  const pool = await ethers.getContractAt("LendingPool", poolDeployment.address, deployer);
  const loanManager = await ethers.getContractAt(
    "LoanManager",
    loanManagerDeployment.address,
    deployer
  );

  await valuation.setMaxPriceAge(7 * ONE_DAY);
  const priceFeedDeployment = await deployments.get("MockPriceFeed");
  const priceFeed = await ethers.getContractAt("MockPriceFeed", priceFeedDeployment.address, deployer);

  const usdcAddress = await usdc.getAddress();
  await valuation.setTokenPriceFeed(usdcAddress, priceFeedDeployment.address);

  const blockTimeSetup = (await ethers.provider.getBlock("latest")).timestamp;
  await priceFeed.addHistoricalRound(1e8, blockTimeSetup - 1800);
  await priceFeed.addHistoricalRound(1e8, blockTimeSetup - 3600);
  await priceFeed.setPrice(1e8);

  const issuanceTreasury = await pool.issuanceTreasury();
  const issuanceSigner = await ethers.getSigner(issuanceTreasury);
  await usdc.connect(issuanceSigner).approve(await pool.getAddress(), ethers.MaxUint256);

  for (const b of borrowers) {
    await loanManager.connect(deployer).setSanctionsPass(b.address, true);
  }

  return { deployer, lender, keeper, borrowers, usdc, registry, valuation, pool, loanManager, priceFeed };
}

async function deployVestingWallet({ borrower, usdc, allocation, durationDays }) {
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const vesting = await MockVestingWallet.deploy(
    borrower.address,
    now,
    durationDays * ONE_DAY,
    await usdc.getAddress(),
    allocation
  );
  await vesting.waitForDeployment();
  await usdc.transfer(await vesting.getAddress(), allocation);
  return vesting;
}

describe("LoanManager security invariants", () => {
  it("allows permissionless keeper settlement across many loans", async () => {
    const { lender, keeper, borrowers, usdc, pool, registry, loanManager, valuation, priceFeed } =
      await deployFixture();

    const poolAddress = await pool.getAddress();
    await usdc.connect(lender).mint(lender.address, 5_000_000e6);
    await usdc.connect(lender).approve(poolAddress, 5_000_000e6);
    await pool.connect(lender).deposit(5_000_000e6);

    const createdLoanIds = [];
    for (let i = 0; i < 8; i += 1) {
      const borrower = borrowers[i];
      const allocation = BigInt(120_000 + i * 5_000) * 10n ** 6n;
      const vesting = await deployVestingWallet({
        borrower,
        usdc,
        allocation,
        durationDays: 7 + i
      });

      const vestingAddress = await vesting.getAddress();
      await registry.vetContract(vestingAddress, 1);

      const unlockTime = (await vesting.start()) + (await vesting.duration());
      const [pv, ltvBps] = await valuation.computeDPV(
        allocation,
        await usdc.getAddress(),
        unlockTime,
        vestingAddress
      );
      const borrowAmount = (pv * ltvBps) / 10_000n / 2n;
      const collateralId = 1_000 + i;

      await loanManager
        .connect(borrower)
        .createLoan(collateralId, vestingAddress, borrowAmount, 5);
      createdLoanIds.push(i);

      if (i % 3 === 0) {
        const partialRepay = borrowAmount / 3n;
        await usdc.connect(borrower).mint(borrower.address, partialRepay);
        await usdc.connect(borrower).approve(await loanManager.getAddress(), partialRepay);
        await loanManager.connect(borrower).repayLoan(i, partialRepay);
      }
    }

    await ethers.provider.send("evm_increaseTime", [20 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);
    const newBlockTime = (await ethers.provider.getBlock("latest")).timestamp;
    await priceFeed.addHistoricalRound(1e8, newBlockTime - 1800);
    await priceFeed.addHistoricalRound(1e8, newBlockTime - 3600);
    await priceFeed.setPrice(1e8);

    for (const loanId of createdLoanIds) {
      const loanBefore = await loanManager.loans(loanId);
      if (!loanBefore.active) continue;
      await expect(loanManager.connect(keeper).settleAtUnlock(loanId)).to.not.be.reverted;
      const loanAfter = await loanManager.loans(loanId);
      expect(loanAfter.active).to.equal(false);
    }
  });
});
