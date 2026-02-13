const { expect } = require("chai");
const { ethers } = require("hardhat");

const ONE_DAY = 24 * 60 * 60;

async function deployTokenFixture() {
  const [deployer, beneficiary, recipient] = await ethers.getSigners();
  const MockProjectToken = await ethers.getContractFactory("MockProjectToken");
  const cap = 1_000_000n * 10n ** 6n;
  const token = await MockProjectToken.deploy("Mock USD", "mUSD", 6, cap, deployer.address);
  await token.waitForDeployment();
  return { deployer, beneficiary, recipient, token };
}

describe("Claim wrappers", () => {
  it("OZ wrapper initializes and releases vested amount", async () => {
    const { deployer, beneficiary, recipient, token } = await deployTokenFixture();
    const OZVestingClaimWrapper = await ethers.getContractFactory("OZVestingClaimWrapper");
    const total = 50_000n * 10n ** 6n;
    const wrapper = await OZVestingClaimWrapper.deploy(beneficiary.address, await token.getAddress(), total);
    await wrapper.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const MockOZVestingWallet = await ethers.getContractFactory("MockOZVestingWallet");
    const vesting = await MockOZVestingWallet.deploy(
      await wrapper.getAddress(),
      now,
      ONE_DAY,
      await token.getAddress(),
      total
    );
    await vesting.waitForDeployment();
    await token.transfer(await vesting.getAddress(), total);

    await wrapper.connect(deployer).initVesting(await vesting.getAddress());
    await expect(wrapper.connect(deployer).initVesting(await vesting.getAddress())).to.be.revertedWith(
      "already initialized"
    );

    await ethers.provider.send("evm_increaseTime", [ONE_DAY + 10]);
    await ethers.provider.send("evm_mine", []);

    const amount = 10_000n * 10n ** 6n;
    await wrapper.releaseTo(recipient.address, amount);
    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    expect(await wrapper.released(await token.getAddress())).to.equal(amount);
  });

  it("TokenTimelock wrapper validates initialization and release", async () => {
    const { beneficiary, recipient, token } = await deployTokenFixture();
    const TokenTimelockClaimWrapper = await ethers.getContractFactory("TokenTimelockClaimWrapper");
    const duration = 2 * ONE_DAY;
    const total = 40_000n * 10n ** 6n;
    const wrapper = await TokenTimelockClaimWrapper.deploy(
      beneficiary.address,
      await token.getAddress(),
      total,
      duration
    );
    await wrapper.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const MockTokenTimelock = await ethers.getContractFactory("MockTokenTimelock");
    const timelock = await MockTokenTimelock.deploy(
      await wrapper.getAddress(),
      await token.getAddress(),
      now,
      duration,
      total
    );
    await timelock.waitForDeployment();
    await token.transfer(await timelock.getAddress(), total);

    await wrapper.initTimelock(await timelock.getAddress());
    await expect(wrapper.releaseTo(recipient.address, 1)).to.be.revertedWith("not released");

    await ethers.provider.send("evm_increaseTime", [duration + 10]);
    await ethers.provider.send("evm_mine", []);
    const amount = 5_000n * 10n ** 6n;
    await wrapper.releaseTo(recipient.address, amount);
    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    expect(await wrapper.released(await token.getAddress())).to.equal(amount);
  });

  it("Superfluid wrapper enforces unlock time", async () => {
    const { beneficiary, recipient, token } = await deployTokenFixture();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const SuperfluidClaimWrapper = await ethers.getContractFactory("SuperfluidClaimWrapper");
    const total = 30_000n * 10n ** 6n;
    const wrapper = await SuperfluidClaimWrapper.deploy(
      beneficiary.address,
      await token.getAddress(),
      total,
      now,
      ONE_DAY
    );
    await wrapper.waitForDeployment();

    await token.transfer(await wrapper.getAddress(), total);
    await expect(wrapper.releaseTo(recipient.address, 1)).to.be.revertedWith("not unlocked");

    await ethers.provider.send("evm_increaseTime", [ONE_DAY + 10]);
    await ethers.provider.send("evm_mine", []);
    const amount = 1_000n * 10n ** 6n;
    await wrapper.releaseTo(recipient.address, amount);
    expect(await token.balanceOf(recipient.address)).to.equal(amount);
    expect(await wrapper.released(await token.getAddress())).to.equal(amount);
  });

  it("Sablier operator wrapper exposes stream data and releases via approval", async () => {
    const { beneficiary, recipient, token } = await deployTokenFixture();
    const MockSablierV2Lockup = await ethers.getContractFactory("MockSablierV2Lockup");
    const lockup = await MockSablierV2Lockup.deploy();
    await lockup.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const streamDeposit = 20_000n * 10n ** 6n;
    await token.approve(await lockup.getAddress(), streamDeposit);
    await lockup.createStream(
      beneficiary.address,
      await token.getAddress(),
      streamDeposit,
      now - ONE_DAY,
      now + ONE_DAY
    );
    const streamId = (await lockup.nextStreamId()) - 1n;

    const SablierV2OperatorWrapper = await ethers.getContractFactory("SablierV2OperatorWrapper");
    const wrapper = await SablierV2OperatorWrapper.deploy(
      await lockup.getAddress(),
      streamId,
      beneficiary.address
    );
    await wrapper.waitForDeployment();

    await lockup.connect(beneficiary).setApproved(streamId, await wrapper.getAddress(), true);
    expect(await wrapper.totalAllocation()).to.equal(streamDeposit);
    expect(await wrapper.token()).to.equal(await token.getAddress());
    expect(await wrapper.duration()).to.be.greaterThan(0);

    const releaseAmount = 500n * 10n ** 6n;
    await wrapper.releaseTo(recipient.address, releaseAmount);
    expect(await token.balanceOf(recipient.address)).to.equal(releaseAmount);
  });
});
