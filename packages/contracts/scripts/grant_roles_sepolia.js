const { ethers } = require("hardhat");

async function main() {
  const LM_ADDRESS = "0x11425a1d65686b88cef8a2455adc7b0d7594555f";
  const GRM_ADDRESS = "0x38d1467eeb318846BF3B0c358BeFa9c35253D87c";

  console.log("--- Granting Roles on Sepolia ---");
  const loanManager = await ethers.getContractAt("LoanManager", LM_ADDRESS);

  const PAUSER_ROLE = await loanManager.PAUSER_ROLE();
  const GUARDIAN_ROLE = await loanManager.GUARDIAN_ROLE();

  console.log("Granting PAUSER_ROLE...");
  const tx1 = await loanManager.grantRole(PAUSER_ROLE, GRM_ADDRESS);
  console.log("TX Hash:", tx1.hash);
  await tx1.wait();

  console.log("Granting GUARDIAN_ROLE...");
  const tx2 = await loanManager.grantRole(GUARDIAN_ROLE, GRM_ADDRESS);
  console.log("TX Hash:", tx2.hash);
  await tx2.wait();

  console.log("Roles granted successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
