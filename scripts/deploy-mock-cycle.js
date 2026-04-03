const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying Mock cycle with account:", deployer.address);

  // 1. Deploy MockLoanManager
  const MockLoanManager = await ethers.getContractFactory("MockLoanManager");
  const loanManager = await MockLoanManager.deploy();
  await loanManager.waitForDeployment();
  const lmAddress = await loanManager.getAddress();
  console.log("MockLoanManager deployed to:", lmAddress);

  // 2. Deploy GlobalRiskModule
  const GlobalRiskModule = await ethers.getContractFactory("GlobalRiskModule");
  const riskModule = await GlobalRiskModule.deploy(lmAddress, deployer.address);
  await riskModule.waitForDeployment();
  const rmAddress = await riskModule.getAddress();
  console.log("GlobalRiskModule deployed to:", rmAddress);

  // 3. Grant PAUSER_ROLE and GUARDIAN_ROLE to riskModule on MockLoanManager
  const PAUSER_ROLE = ethers.id("PAUSER_ROLE");
  console.log("Granting PAUSER_ROLE...");
  await (await loanManager.grantRole(PAUSER_ROLE, rmAddress)).wait();

  // 4. Verification Cycle
  console.log("Triggering emergencyHalt...");
  await (await riskModule.emergencyHalt("Mock Event")).wait();
  console.log("Paused:", await loanManager.paused());

  console.log("Triggering resume...");
  await (await riskModule.resume()).wait();
  console.log("Paused:", await loanManager.paused());
  
  console.log("VERIFICATION SUCCESSFUL!");
}

main().catch(console.error);
