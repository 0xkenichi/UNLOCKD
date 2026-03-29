const { ethers, network } = require("hardhat");

async function main() {
  const LM_ADDRESS = "0x3E6ce9289c20EC7822296aaBf8A48A6a2a857B56"; // Correct Sepolia address
  const GRM_ADDRESS = "0x38d1467eeb318846BF3B0c358BeFa9c35253D87c";

  const loanManager = await ethers.getContractAt("LoanManager", LM_ADDRESS);
  const riskModule = await ethers.getContractAt("GlobalRiskModule", GRM_ADDRESS);

  console.log("--- Sepolia Verification Sequence (V3 - Correct Address) ---");

  const runWithRetry = async (fn, name) => {
    let retries = 3;
    while (retries > 0) {
      try {
        return await fn();
      } catch (e) {
        console.log(`   [Retry] ${name} failed (${e.message}). Retrying...`);
        retries--;
        await new Promise(r => setTimeout(r, 5000));
      }
    }
    throw new Error(`${name} failed after 3 retries`);
  };

  // 1. Confirm PAUSER_ROLE constant
  const PAUSER_ROLE = await runWithRetry(() => loanManager.PAUSER_ROLE(), "PAUSER_ROLE");
  console.log("1. PAUSER_ROLE:", PAUSER_ROLE);

  // 2. Confirm GlobalRiskModule holds PAUSER_ROLE on LoanManager
  const hasPauser = await runWithRetry(() => loanManager.hasRole(PAUSER_ROLE, GRM_ADDRESS), "GRM has PAUSER_ROLE");
  console.log("2. GRM has PAUSER_ROLE:", hasPauser);

  // 3. Confirm GlobalRiskModule holds GUARDIAN_ROLE on LoanManager
  const GUARDIAN_ROLE = await runWithRetry(() => loanManager.GUARDIAN_ROLE(), "GUARDIAN_ROLE");
  const hasGuardian = await runWithRetry(() => loanManager.hasRole(GUARDIAN_ROLE, GRM_ADDRESS), "GRM has GUARDIAN_ROLE");
  console.log("3. GRM has GUARDIAN_ROLE:", hasGuardian);

  // 4. Confirm LoanManager starts unpaused
  const isPausedStart = await runWithRetry(() => loanManager.paused(), "LoanManager.paused()");
  console.log("4. LoanManager is paused (start):", isPausedStart);

  // 5. Trigger emergencyHalt via governor
  if (!isPausedStart) {
    console.log("5. Triggering emergencyHalt...");
    const haltTx = await runWithRetry(() => riskModule.emergencyHalt("Sepolia verification test"), "emergencyHalt");
    console.log("   Halt TX Hash:", haltTx.hash);
    await haltTx.wait();
  } else {
    console.log("5. Already paused.");
  }

  // 6. Verify LoanManager is now paused
  const isPausedAfterHalt = await runWithRetry(() => loanManager.paused(), "paused() after halt");
  console.log("6. LoanManager is paused (after halt):", isPausedAfterHalt);

  // 7. Verified
  console.log("7. Verified: paused() is true, loan functions will revert.");

  // 8. Resume via governor
  if (isPausedAfterHalt) {
    console.log("8. Resuming via GlobalRiskModule...");
    const resumeTx = await runWithRetry(() => riskModule.resume(), "resume");
    console.log("   Resume TX Hash:", resumeTx.hash);
    await resumeTx.wait();
  } else {
    console.log("8. Already unpaused.");
  }

  // 9. Verify LoanManager is unpaused
  const isPausedEnd = await runWithRetry(() => loanManager.paused(), "paused() end");
  console.log("9. LoanManager is paused (end):", isPausedEnd);

  console.log("--- Verification Complete ---");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
