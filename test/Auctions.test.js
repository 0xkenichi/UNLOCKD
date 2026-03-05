// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { expect } = require("chai");
const { ethers } = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function deployAuctionFixture() {
  const [deployer, seller, bidderA, bidderB] = await ethers.getSigners();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  const VestingRegistry = await ethers.getContractFactory("VestingRegistry");
  const registry = await VestingRegistry.deploy();
  await registry.waitForDeployment();

  const VestingAdapter = await ethers.getContractFactory("VestingAdapter");
  const adapter = await VestingAdapter.deploy(await registry.getAddress());
  await adapter.waitForDeployment();

  const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
  const now = (await ethers.provider.getBlock("latest")).timestamp;
  const unlockDuration = 3 * ONE_DAY;
  const allocation = 50_000n * 10n ** 6n;
  const vesting = await MockVestingWallet.connect(seller).deploy(
    seller.address,
    now,
    unlockDuration,
    await usdc.getAddress(),
    allocation
  );
  await vesting.waitForDeployment();
  await usdc.transfer(await vesting.getAddress(), allocation);

  await registry.vetContract(await vesting.getAddress(), 1);

  const AuctionFactory = await ethers.getContractFactory("AuctionFactory");
  const factory = await AuctionFactory.deploy(await adapter.getAddress(), await usdc.getAddress());
  await factory.waitForDeployment();

  return { deployer, seller, bidderA, bidderB, usdc, adapter, vesting, factory, now, unlockDuration, allocation };
}

async function deployAuctionFromFactory(factory, eventName) {
  const tx = await factory[eventName]();
  const rc = await tx.wait();
  const evt = rc.logs.find((log) => log.fragment && log.fragment.name === "AuctionDeployed");
  return evt.args.auction;
}

describe("Auction contracts", () => {
  it("Factory deploys all auction types", async () => {
    const { factory } = await deployAuctionFixture();

    const dutchAddress = await deployAuctionFromFactory(factory, "createDutchAuction");
    const englishAddress = await deployAuctionFromFactory(factory, "createEnglishAuction");
    const sealedAddress = await deployAuctionFromFactory(factory, "createSealedBidAuction");

    expect(dutchAddress).to.properAddress;
    expect(englishAddress).to.properAddress;
    expect(sealedAddress).to.properAddress;
    expect(dutchAddress).to.not.equal(englishAddress);
  });

  it("Dutch auction supports decay, exact bid, finalize, and claim", async () => {
    const { seller, bidderA, usdc, adapter, vesting, factory, allocation } = await deployAuctionFixture();
    const dutchAddress = await deployAuctionFromFactory(factory, "createDutchAuction");
    const dutch = await ethers.getContractAt("DutchAuction", dutchAddress, seller);

    await adapter.setAuthorizedCaller(dutchAddress, true);

    const startPrice = 10_000n * 10n ** 6n;
    const endPrice = startPrice - 1n;
    const duration = 2 * ONE_DAY;

    await dutch.connect(seller).createAuction(1, await vesting.getAddress(), startPrice, endPrice, duration);

    await ethers.provider.send("evm_increaseTime", [ONE_DAY]);
    await ethers.provider.send("evm_mine", []);

    const currentPrice = await dutch.getCurrentPrice(0);
    expect(currentPrice).to.be.lessThanOrEqual(startPrice);
    expect(currentPrice).to.be.greaterThanOrEqual(endPrice);

    await usdc.connect(bidderA).mint(bidderA.address, startPrice);
    await usdc.connect(bidderA).approve(dutchAddress, startPrice);

    await expect(dutch.connect(bidderA).bid(0, currentPrice - 1n)).to.be.revertedWith("bad amount");
    await expect(dutch.connect(bidderA).bid(0, currentPrice))
      .to.emit(dutch, "AuctionFinalized")
      .withArgs(0, bidderA.address, currentPrice);

    await expect(dutch.connect(seller).endAuction(0)).to.be.revertedWith("active");
    await expect(dutch.connect(bidderA).claim(0)).to.be.revertedWith("not unlocked");

    await ethers.provider.send("evm_increaseTime", [4 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);
    await expect(dutch.connect(bidderA).claim(0))
      .to.emit(dutch, "AuctionClaimed")
      .withArgs(0, bidderA.address, allocation);
  });

  it("English auction handles reserve, outbid refund, and endAuction", async () => {
    const { seller, bidderA, bidderB, usdc, factory, adapter, vesting } = await deployAuctionFixture();
    const englishAddress = await deployAuctionFromFactory(factory, "createEnglishAuction");
    const english = await ethers.getContractAt("EnglishAuction", englishAddress, seller);

    await adapter.setAuthorizedCaller(englishAddress, true);

    const reserve = 5_000n * 10n ** 6n;
    await english.connect(seller).createAuction(
      2,
      await vesting.getAddress(),
      6_000n * 10n ** 6n,
      reserve,
      ONE_DAY
    );

    await usdc.connect(bidderA).mint(bidderA.address, 20_000n * 10n ** 6n);
    await usdc.connect(bidderB).mint(bidderB.address, 20_000n * 10n ** 6n);
    await usdc.connect(bidderA).approve(englishAddress, ethers.MaxUint256);
    await usdc.connect(bidderB).approve(englishAddress, ethers.MaxUint256);

    await expect(english.connect(bidderA).bid(0, reserve - 1n)).to.be.revertedWith("reserve");
    await english.connect(bidderA).bid(0, reserve);
    await expect(english.connect(bidderB).bid(0, reserve)).to.be.revertedWith("low bid");

    const bidderABalanceBefore = await usdc.balanceOf(bidderA.address);
    await english.connect(bidderB).bid(0, reserve + 1_000n * 10n ** 6n);
    const bidderABalanceAfter = await usdc.balanceOf(bidderA.address);
    expect(bidderABalanceAfter - bidderABalanceBefore).to.equal(reserve);

    await ethers.provider.send("evm_increaseTime", [2 * ONE_DAY]);
    await ethers.provider.send("evm_mine", []);
    await expect(english.connect(seller).endAuction(0))
      .to.emit(english, "AuctionEnded")
      .withArgs(0, bidderB.address, reserve + 1_000n * 10n ** 6n);
  });

  it("Sealed-bid auction enforces commit/reveal flow", async () => {
    const { seller, bidderA, bidderB, usdc, factory, adapter, vesting } = await deployAuctionFixture();
    const sealedAddress = await deployAuctionFromFactory(factory, "createSealedBidAuction");
    const sealed = await ethers.getContractAt("SealedBidAuction", sealedAddress, seller);

    await adapter.setAuthorizedCaller(sealedAddress, true);

    const reserve = 4_000n * 10n ** 6n;
    await sealed.connect(seller).createAuction(
      3,
      await vesting.getAddress(),
      8_000n * 10n ** 6n,
      reserve,
      2 * ONE_DAY
    );

    await usdc.connect(bidderA).mint(bidderA.address, 20_000n * 10n ** 6n);
    await usdc.connect(bidderB).mint(bidderB.address, 20_000n * 10n ** 6n);
    await usdc.connect(bidderA).approve(sealedAddress, ethers.MaxUint256);
    await usdc.connect(bidderB).approve(sealedAddress, ethers.MaxUint256);

    const nonceA = 12345;
    const nonceB = 98765;
    const bidA = reserve + 500n * 10n ** 6n;
    const bidB = reserve + 1_000n * 10n ** 6n;
    const commitA = await sealed.buildCommitment(0, bidA, nonceA);
    const commitB = await sealed.buildCommitment(0, bidB, nonceB);

    await sealed.connect(bidderA).commitBid(0, commitA);
    await sealed.connect(bidderB).commitBid(0, commitB);
    await expect(sealed.connect(bidderA).commitBid(0, commitA)).to.be.revertedWith("committed");
    await expect(sealed.connect(bidderA).bid(0, bidA)).to.be.revertedWith("use commit/reveal");

    await ethers.provider.send("evm_increaseTime", [ONE_DAY + 5]);
    await ethers.provider.send("evm_mine", []);

    await expect(sealed.connect(bidderA).revealBid(0, bidA, 999)).to.be.revertedWith("bad reveal");
    await sealed.connect(bidderA).revealBid(0, bidA, nonceA);

    const bidderABalancePre = await usdc.balanceOf(bidderA.address);
    await sealed.connect(bidderB).revealBid(0, bidB, nonceB);
    const bidderABalancePost = await usdc.balanceOf(bidderA.address);
    expect(bidderABalancePost - bidderABalancePre).to.equal(bidA);

    await ethers.provider.send("evm_increaseTime", [ONE_DAY + 5]);
    await ethers.provider.send("evm_mine", []);
    await expect(sealed.connect(seller).endAuction(0))
      .to.emit(sealed, "AuctionEnded")
      .withArgs(0, bidderB.address, bidB);
  });
});
