const { expect } = require("chai");
const { ethers } = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

describe("ValuationEngine security", () => {
  it("uses token-specific feeds when configured", async () => {
    const [deployer] = await ethers.getSigners();

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const defaultFeed = await MockPriceFeed.deploy();
    await defaultFeed.waitForDeployment();
    await defaultFeed.setPrice(1e8); // $1

    const altFeed = await MockPriceFeed.deploy();
    await altFeed.waitForDeployment();
    await altFeed.setPrice(2e8); // $2

    const ValuationEngine = await ethers.getContractFactory("ValuationEngine");
    const valuation = await ValuationEngine.deploy(await defaultFeed.getAddress());
    await valuation.waitForDeployment();
    await valuation.setMaxPriceAge(7 * ONE_DAY);

    const MockProjectToken = await ethers.getContractFactory("MockProjectToken");
    const cap = 1_000_000n * 10n ** 6n;
    const token = await MockProjectToken.deploy(
      "Project Token",
      "PRJ",
      6,
      cap,
      deployer.address
    );
    await token.waitForDeployment();

    const quantity = 10_000n * 10n ** 6n;
    const unlockTime = (await ethers.provider.getBlock("latest")).timestamp + 30 * ONE_DAY;

    const [defaultPv] = await valuation.computeDPV(
      quantity,
      await token.getAddress(),
      unlockTime
    );

    await valuation.setTokenPriceFeed(await token.getAddress(), await altFeed.getAddress());
    const [mappedPv] = await valuation.computeDPV(
      quantity,
      await token.getAddress(),
      unlockTime
    );

    expect(mappedPv).to.be.greaterThan(defaultPv);
  });

  it("rejects stale oracle rounds", async () => {
    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const feed = await MockPriceFeed.deploy();
    await feed.waitForDeployment();

    const ValuationEngine = await ethers.getContractFactory("ValuationEngine");
    const valuation = await ValuationEngine.deploy(await feed.getAddress());
    await valuation.waitForDeployment();
    await valuation.setMaxPriceAge(ONE_DAY);

    await feed.setStalePrice(1e8, 1);

    const quantity = 1_000n * 10n ** 6n;
    const unlockTime = (await ethers.provider.getBlock("latest")).timestamp + 7 * ONE_DAY;

    await expect(
      valuation.computeDPV(quantity, ethers.ZeroAddress, unlockTime)
    ).to.be.revertedWith("stale price");
  });
});
