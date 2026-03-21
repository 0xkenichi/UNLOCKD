const { ethers } = require("hardhat");

async function main() {
  console.log("--- Vestra Sovereign | ASI Chain DevNet Deployment ---");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with address:", deployer.address);

  // 1. Deploy Mock Project Token (Vestra Credit / $CRDT)
  const MockToken = await ethers.getContractFactory("MockProjectToken");
  const cap = ethers.parseEther("1000000000"); // 1B tokens
  const token = await MockToken.deploy(
    "Vestra Credit", 
    "$CRDT", 
    18, 
    cap, 
    deployer.address
  );
  await token.waitForDeployment();
  console.log("$CRDT Deployed to:", await token.getAddress());

  // 2. Deploy SovereignASIWallet
  const SovereignASIWallet = await ethers.getContractFactory("SovereignASIWallet");
  const wallet = await SovereignASIWallet.deploy();
  await wallet.waitForDeployment();
  const walletAddress = await wallet.getAddress();
  console.log("MockASIWallet Deployed to:", walletAddress);

  // 3. Transfer tokens to the wallet for vesting simulation
  const amount = ethers.parseEther("1000000"); // 1M tokens
  await token.transfer(walletAddress, amount);
  console.log("Transferred 1M $CRDT to MockASIWallet");

  // 4. Create Agentic Templates
  console.log("Initializing Agentic Templates...");

  // AGENT_ALPHA: 6m cliff, 24m linear
  const tx1 = await wallet.createAgentPosition(
    deployer.address,
    await token.getAddress(),
    ethers.parseEther("500000"),
    0 // Template.AGENT_ALPHA
  );
  await tx1.wait();
  console.log("- Template 'AGENT_ALPHA' Initialized [ID: 0]");

  // NEURAL_REWARD: 0-cliff, 12m linear
  const tx2 = await wallet.createAgentPosition(
    deployer.address,
    await token.getAddress(),
    ethers.parseEther("250000"),
    1 // Template.NEURAL_REWARD
  );
  await tx2.wait();
  console.log("- Template 'NEURAL_REWARD' Initialized [ID: 1]");

  // 5. Register in VestingRegistry
  const VESTING_REGISTRY_ADDR = "0x0090123bfa5dc5885c6b940D1ada3e908fF6c962";
  console.log("\nRegistering in VestingRegistry...");
  
  const registry = await ethers.getContractAt("VestingRegistry", VESTING_REGISTRY_ADDR);
  
  // Rank 1: Flagship (Best LTV)
  const txVet = await registry.vetContract(walletAddress, 1);
  await txVet.wait();
  console.log("- SovereignASIWallet ranked as FLAGSHIP in Registry");

  // Verified Bytecode
  const code = await ethers.provider.getCode(walletAddress);
  const codeHash = ethers.keccak256(code);
  const txBytecode = await registry.setVerifiedBytecode(codeHash, true);
  await txBytecode.wait();
  console.log("- Bytecode hash verified in Registry:", codeHash);

  console.log("\nSovereign Deployment & Registration Complete.");
  console.log("--- READY FOR AGENT DISCOVERY ---");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
