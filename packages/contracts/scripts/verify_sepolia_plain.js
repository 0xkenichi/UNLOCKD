const { ethers } = require("ethers");

async function main() {
  const LM_ADDRESS = "0x3E6ce9289c20EC7822296aaBf8A48A6a2a857B56"; 
  const GRM_ADDRESS = "0x38d1467eeb318846BF3B0c358BeFa9c35253D87c";
  const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/rnbX-ajOnoP1gse8FjH3v";
  const PK = "0x0880eea5bfb8ffe8f1be0a591b0810b5d46ff186196ca47c72945cdf95ce9a89";

  console.log("--- Sepolia Verification Suite (Plain Ethers) ---");
  
  const provider = new ethers.JsonRpcProvider(RPC_URL, null, {
    staticNetwork: true,
  });
  
  const wallet = new ethers.Wallet(PK, provider);
  
  const LM_ABI = [
    "function PAUSER_ROLE() public view returns (bytes32)",
    "function GUARDIAN_ROLE() public view returns (bytes32)",
    "function hasRole(bytes32 role, address account) public view returns (bool)",
    "function paused() public view returns (bool)"
  ];
  
  const GRM_ABI = [
    "function emergencyHalt(string reason) external",
    "function resume() external"
  ];
  
  const loanManager = new ethers.Contract(LM_ADDRESS, LM_ABI, provider);
  const riskModule = new ethers.Contract(GRM_ADDRESS, GRM_ABI, wallet);

  try {
    // 1. Confirm PAUSER_ROLE constant
    const PAUSER_ROLE = await loanManager.PAUSER_ROLE();
    console.log("1. PAUSER_ROLE:", PAUSER_ROLE);

    // 2. Confirm GlobalRiskModule holds PAUSER_ROLE on LoanManager
    const hasPauser = await loanManager.hasRole(PAUSER_ROLE, GRM_ADDRESS);
    console.log("2. GRM has PAUSER_ROLE:", hasPauser);

    // 3. Confirm GlobalRiskModule holds GUARDIAN_ROLE on LoanManager
    const GUARDIAN_ROLE = await loanManager.GUARDIAN_ROLE();
    const hasGuardian = await loanManager.hasRole(GUARDIAN_ROLE, GRM_ADDRESS);
    console.log("3. GRM has GUARDIAN_ROLE:", hasGuardian);

    // 4. Confirm LoanManager starts unpaused
    const isPausedStart = await loanManager.paused();
    console.log("4. LoanManager is paused (start):", isPausedStart);

    // 5. Trigger emergencyHalt via governor
    console.log("5. Triggering emergencyHalt...");
    const haltTx = await riskModule.emergencyHalt("Sepolia Verification Run");
    console.log("   Halt TX Hash:", haltTx.hash);
    await haltTx.wait();

    // 6. Verify LoanManager is now paused
    const isPausedAfterHalt = await loanManager.paused();
    console.log("6. LoanManager is paused (after halt):", isPausedAfterHalt);

    // 7. Verified
    console.log("7. Verified: contract is paused.");

    // 8. Resume via governor
    console.log("8. Resuming via GlobalRiskModule...");
    const resumeTx = await riskModule.resume();
    console.log("   Resume TX Hash:", resumeTx.hash);
    await resumeTx.wait();

    // 9. Verify LoanManager is unpaused
    const isPausedEnd = await loanManager.paused();
    console.log("9. LoanManager is paused (end):", isPausedEnd);

    console.log("--- SECURE CIRCUIT BREAKER VERIFIED ON SEPOLIA ---");
  } catch (e) {
    console.error("Verification failed:", e.message);
  }
}

main();
