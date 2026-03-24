import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying Vestra ValuationEngine v2 with account: ${deployer.address}`);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log(`Target Network ChainId: ${chainId}`);

  // Base Mainnet (8453) and ASI Chain (which we assume has a specific target chainId like 9001)
  if (chainId !== 8453n && chainId !== 9001n && chainId !== 11155111n) {
    console.warn(`Warning: Deploying to unrecognized chain ID ${chainId}. Expected 8453 (Base), 9001 (ASI), or 11155111 (Sepolia).`);
  }

  const ValuationEngine = await ethers.getContractFactory("ValuationEngine");
  
  // Deploying with the deployer as the initial admin
  const engine = await ValuationEngine.deploy(deployer.address);
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();

  console.log(`✅ ValuationEngine v2 deployed to: ${engineAddr}`);

  // Setup initial state: 5% base rate
  console.log("Setting default 5% Base Rate...");
  
  // In production, relayer role should be granted to the off-chain relayer address
  // For script, we grant it temporarily to deployer to setup base rate, then we can renounce or setup properly
  const RELAYER_ROLE = await engine.RELAYER_ROLE();
  const tx1 = await engine.grantRole(RELAYER_ROLE, deployer.address);
  await tx1.wait();

  const tx2 = await engine.updateBaseRate(500); // 500 bps = 5%
  await tx2.wait();

  console.log("🚀 Deployment and Initial Configuration Complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
