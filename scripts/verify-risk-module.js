const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Verifying with account:", deployer.address);

  const loanManagerAddress = "0xfaa8fb747885904f3b622f2986ce7568363e3646";
  const riskModuleAddress = "0xC6B0600cBf34eC6401c66fD7ce8Ac7aDE2386868";

  const loanManager = await ethers.getContractAt("LoanManager", loanManagerAddress);
  const riskModule = await ethers.getContractAt("GlobalRiskModule", riskModuleAddress);

  const PAUSER_ROLE = ethers.id("PAUSER_ROLE");
  const GUARDIAN_ROLE = ethers.id("GUARDIAN_ROLE");

  console.log("PAUSER_ROLE:", PAUSER_ROLE);
  console.log("GUARDIAN_ROLE:", GUARDIAN_ROLE);

  // 1. Grant PAUSER_ROLE
  console.log("Granting PAUSER_ROLE...");
  const tx1 = await loanManager.grantRole(PAUSER_ROLE, riskModuleAddress);
  await tx1.wait();
  console.log("Granting PAUSER_ROLE TX:", tx1.hash);

  // 2. Grant GUARDIAN_ROLE
  console.log("Granting GUARDIAN_ROLE...");
  const tx2 = await loanManager.grantRole(GUARDIAN_ROLE, riskModuleAddress);
  await tx2.wait();
  console.log("Granting GUARDIAN_ROLE TX:", tx2.hash);

  // 3 & 4. Confirm roles
  const hasPauser = await loanManager.hasRole(PAUSER_ROLE, riskModuleAddress);
  const hasGuardian = await loanManager.hasRole(GUARDIAN_ROLE, riskModuleAddress);
  console.log("Has PAUSER_ROLE:", hasPauser);
  console.log("Has GUARDIAN_ROLE:", hasGuardian);

  // 5. Check Initial Pause State
  const isPausedInitial = await loanManager.paused();
  console.log("Initial paused state:", isPausedInitial);

  // 6. Trigger emergencyHalt via riskModule
  console.log("Triggering emergencyHalt...");
  const tx3 = await riskModule.emergencyHalt("Vestra Protocol Maintenance");
  await tx3.wait();
  console.log("emergencyHalt TX:", tx3.hash);

  // 7. Verify Paused
  const isPausedAfterHalt = await loanManager.paused();
  console.log("Paused state after halt:", isPausedAfterHalt);

  // 8. Trigger resume via riskModule
  console.log("Skipping resume for now to check state...");
  /*
  const tx4 = await riskModule.resume();
  await tx4.wait();
  console.log("resume TX:", tx4.hash);

  // 9. Verify Unpaused
  const isPausedAfterResume = await loanManager.paused();
  console.log("Paused state after resume:", isPausedAfterResume);
  */
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
