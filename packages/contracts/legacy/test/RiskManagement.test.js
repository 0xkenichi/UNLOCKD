const { expect } = require("chai");
const { ethers, deployments } = require("hardhat");

describe("PAUSER_ROLE + GlobalRiskModule Integration", function () {
  let loanManager, globalRiskModule, deployer, guardian, attacker;
  const CEILING = ethers.parseUnits("1000000", 6);

  beforeEach(async () => {
    await deployments.fixture(["full"]);
    [deployer, guardian, attacker] = await ethers.getSigners();
    
    const loanManagerDeployment = await deployments.get("LoanManager");
    loanManager = await ethers.getContractAt("LoanManager", loanManagerDeployment.address);
    
    const globalRiskModuleDeployment = await deployments.get("GlobalRiskModule");
    globalRiskModule = await ethers.getContractAt("GlobalRiskModule", globalRiskModuleDeployment.address);

    // Grant GUARDIAN_ROLE on GlobalRiskModule to the guardian signer for testing
    const GUARDIAN_ROLE = await globalRiskModule.GUARDIAN_ROLE();
    await globalRiskModule.connect(deployer).grantRole(GUARDIAN_ROLE, guardian.address);
  });

  // ── Baseline ──────────────────────────────────────────────────────────────
  it("LoanManager starts unpaused", async () => {
    expect(await loanManager.paused()).to.be.false;
  });

  it("GlobalRiskModule holds PAUSER_ROLE on LoanManager", async () => {
    const PAUSER_ROLE = await loanManager.PAUSER_ROLE();
    expect(await loanManager.hasRole(PAUSER_ROLE, globalRiskModule.target)).to.be.true;
  });

  it("GlobalRiskModule holds GUARDIAN_ROLE on LoanManager", async () => {
    const GUARDIAN_ROLE = await loanManager.GUARDIAN_ROLE();
    expect(await loanManager.hasRole(GUARDIAN_ROLE, globalRiskModule.target)).to.be.true;
  });

  it("GlobalRiskModule DOES NOT hold GOVERNOR_ROLE on LoanManager", async () => {
    const GOVERNOR_ROLE = await loanManager.GOVERNOR_ROLE();
    expect(await loanManager.hasRole(GOVERNOR_ROLE, globalRiskModule.target)).to.be.false;
  });

  // ── Access control ────────────────────────────────────────────────────────
  it("unauthorized address cannot call LoanManager.pause()", async () => {
    await expect(loanManager.connect(attacker).pause())
      .to.be.revertedWith("Caller is not pauser");
  });

  it("unauthorized address cannot call GlobalRiskModule.syncBadDebt()", async () => {
    await expect(globalRiskModule.connect(attacker).syncBadDebt(CEILING + 1n))
      .to.be.revertedWith("Caller is not guardian");
  });

  it("unauthorized address cannot call GlobalRiskModule.emergencyHalt()", async () => {
    await expect(globalRiskModule.connect(attacker).emergencyHalt("test"))
      .to.be.revertedWith("Caller is not governor");
  });

  // ── syncBadDebt happy path ────────────────────────────────────────────────
  it("syncBadDebt below ceiling: LoanManager stays unpaused", async () => {
    await globalRiskModule.connect(guardian).syncBadDebt(CEILING - 1n);
    expect(await loanManager.paused()).to.be.false;
  });

  it("syncBadDebt at ceiling breach: LoanManager pauses", async () => {
    await globalRiskModule.connect(guardian).syncBadDebt(CEILING + 1n);
    expect(await loanManager.paused()).to.be.true;
  });

  it("syncBadDebt is idempotent when already paused", async () => {
    await globalRiskModule.connect(guardian).syncBadDebt(CEILING + 1n);
    // Second call must not revert because of our new guard in LoanManager.sol
    await expect(globalRiskModule.connect(guardian).syncBadDebt(CEILING + 2n))
      .to.not.be.reverted;
  });

  // ── emergencyHalt ─────────────────────────────────────────────────────────
  it("emergencyHalt pauses LoanManager immediately", async () => {
    await globalRiskModule.connect(deployer).emergencyHalt("test exploit detected");
    expect(await loanManager.paused()).to.be.true;
  });

  it("emergencyHalt is idempotent when already paused", async () => {
    await globalRiskModule.connect(deployer).emergencyHalt("first halt");
    await expect(globalRiskModule.connect(deployer).emergencyHalt("second halt"))
      .to.not.be.reverted;
  });

  // ── resume ────────────────────────────────────────────────────────────────
  it("governor can resume after emergencyHalt (via risk module)", async () => {
    await globalRiskModule.connect(deployer).emergencyHalt("test");
    await globalRiskModule.connect(deployer).resume();
    expect(await loanManager.paused()).to.be.false;
  });

  it("guardian cannot resume (onlyGovernor restriction on module resume)", async () => {
    await globalRiskModule.connect(guardian).syncBadDebt(CEILING + 1n);
    await expect(globalRiskModule.connect(guardian).resume())
      .to.be.revertedWith("Caller is not governor");
  });
});
