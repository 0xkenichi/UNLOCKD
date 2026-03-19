// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying DemoFaucet with account:", deployer.address);

  // Address from packages/deployments/sepolia/VestingRegistry.json
  const registryAddress = "0x0090123bfa5dc5885c6b940D1ada3e908fF6c962";
  
  const DemoFaucet = await ethers.getContractFactory("DemoFaucet");
  const faucet = await DemoFaucet.deploy(registryAddress);
  await faucet.waitForDeployment();

  const faucetAddress = await faucet.getAddress();
  console.log("DemoFaucet deployed to:", faucetAddress);

  // Grant GOVERNOR_ROLE to DemoFaucet on VestingRegistry
  const registry = await ethers.getContractAt("VestingRegistry", registryAddress, deployer);
  const GOVERNOR_ROLE = await registry.GOVERNOR_ROLE();
  
  console.log("Granting GOVERNOR_ROLE to DemoFaucet...");
  const tx = await registry.grantRole(GOVERNOR_ROLE, faucetAddress);
  await tx.wait();
  console.log("GOVERNOR_ROLE granted.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
