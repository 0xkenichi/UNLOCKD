const { expect } = require("chai");
const { deployments, ethers } = require("hardhat");

describe("Governance timelock controls", () => {
  it("enforces queue+execute flow for LoanManager treasury changes", async () => {
    await deployments.fixture(["full"]);
    const [deployer, other] = await ethers.getSigners();

    const loanManagerDeployment = await deployments.get("LoanManager");
    const loanManager = await ethers.getContractAt(
      "LoanManager",
      loanManagerDeployment.address,
      deployer
    );

    await loanManager.setAdminTimelockConfig(true, 60);

    await expect(
      loanManager.setTreasuries(other.address, deployer.address)
    ).to.be.revertedWith("timelocked");

    await loanManager.queueTreasuries(other.address, deployer.address);
    await expect(loanManager.executeQueuedTreasuries()).to.be.revertedWith("timelock pending");

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await loanManager.executeQueuedTreasuries();
    expect(await loanManager.issuanceTreasury()).to.equal(other.address);
    expect(await loanManager.returnsTreasury()).to.equal(deployer.address);
  });

  it("enforces queue+execute flow for valuation feed updates", async () => {
    await deployments.fixture(["full"]);
    const [deployer] = await ethers.getSigners();

    const valuationDeployment = await deployments.get("ValuationEngine");
    const valuation = await ethers.getContractAt(
      "ValuationEngine",
      valuationDeployment.address,
      deployer
    );

    const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
    const newDefaultFeed = await MockPriceFeed.deploy();
    await newDefaultFeed.waitForDeployment();

    const tokenFeed = await MockPriceFeed.deploy();
    await tokenFeed.waitForDeployment();

    const MockProjectToken = await ethers.getContractFactory("MockProjectToken");
    const token = await MockProjectToken.deploy(
      "Test Token",
      "TT",
      6,
      1_000_000n * 10n ** 6n,
      deployer.address
    );
    await token.waitForDeployment();

    await valuation.setAdminTimelockConfig(true, 60);

    await expect(
      valuation.setTokenPriceFeed(await token.getAddress(), await tokenFeed.getAddress())
    ).to.be.revertedWith("timelocked");

    await valuation.queueTokenPriceFeed(await token.getAddress(), await tokenFeed.getAddress());

    await expect(
      valuation.executeQueuedTokenPriceFeed(await token.getAddress())
    ).to.be.revertedWith("timelock pending");

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await valuation.executeQueuedTokenPriceFeed(await token.getAddress());

    expect(await valuation.getPriceFeedForToken(await token.getAddress())).to.equal(
      await tokenFeed.getAddress()
    );
  });

  it("enforces queue+execute flow for LendingPool admin updates", async () => {
    await deployments.fixture(["full"]);
    const [deployer, other] = await ethers.getSigners();

    const poolDeployment = await deployments.get("LendingPool");
    const pool = await ethers.getContractAt("LendingPool", poolDeployment.address, deployer);

    await pool.setAdminTimelockConfig(true, 60);

    await expect(pool.setLoanManager(other.address)).to.be.revertedWith("timelocked");
    await expect(pool.setTreasuries(other.address, deployer.address)).to.be.revertedWith(
      "timelocked"
    );
    await expect(
      pool.setRateModel(3500, 8000, 1000, 1500, 2200)
    ).to.be.revertedWith("timelocked");

    await pool.queueLoanManager(other.address);
    await pool.queueTreasuries(other.address, deployer.address);
    await pool.queueRateModel(3500, 8000, 1000, 1500, 2200);

    await expect(pool.executeQueuedLoanManager()).to.be.revertedWith("timelock pending");
    await expect(pool.executeQueuedTreasuries()).to.be.revertedWith("timelock pending");
    await expect(pool.executeQueuedRateModel()).to.be.revertedWith("timelock pending");

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await pool.executeQueuedLoanManager();
    await pool.executeQueuedTreasuries();
    await pool.executeQueuedRateModel();

    expect(await pool.loanManager()).to.equal(other.address);
    expect(await pool.issuanceTreasury()).to.equal(other.address);
    expect(await pool.returnsTreasury()).to.equal(deployer.address);
    expect(await pool.lowUtilizationThresholdBps()).to.equal(3500n);
    expect(await pool.highUtilizationThresholdBps()).to.equal(8000n);
  });

  it("enforces queue+execute flow for VestingAdapter admin updates", async () => {
    await deployments.fixture(["full"]);
    const [deployer, other] = await ethers.getSigners();

    const adapterDeployment = await deployments.get("VestingAdapter");
    const adapter = await ethers.getContractAt(
      "VestingAdapter",
      adapterDeployment.address,
      deployer
    );

    await adapter.setAdminTimelockConfig(true, 60);

    await expect(adapter.setLoanManager(other.address)).to.be.revertedWith("timelocked");
    await expect(adapter.setAuthorizedCaller(other.address, true)).to.be.revertedWith(
      "timelocked"
    );

    await adapter.queueLoanManager(other.address);
    await adapter.queueAuthorizedCaller(other.address, true);

    await expect(adapter.executeQueuedLoanManager()).to.be.revertedWith("timelock pending");
    await expect(adapter.executeQueuedAuthorizedCaller(other.address)).to.be.revertedWith(
      "timelock pending"
    );

    await ethers.provider.send("evm_increaseTime", [61]);
    await ethers.provider.send("evm_mine", []);

    await adapter.executeQueuedLoanManager();
    await adapter.executeQueuedAuthorizedCaller(other.address);

    expect(await adapter.loanManager()).to.equal(other.address);
    expect(await adapter.authorizedCallers(other.address)).to.equal(true);
  });
});
