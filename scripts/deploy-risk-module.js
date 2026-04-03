const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const loanManagerAddress = "0xfaa8fb747885904f3b622f2986ce7568363e3646";
  
  const GlobalRiskModule = await ethers.getContractFactory("GlobalRiskModule");
  const riskModule = await GlobalRiskModule.deploy(loanManagerAddress, deployer.address);

  await riskModule.waitForDeployment();
  const riskModuleAddress = await riskModule.getAddress();

  console.log("GlobalRiskModule deployed to:", riskModuleAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
