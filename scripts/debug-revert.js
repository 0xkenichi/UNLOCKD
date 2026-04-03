const { ethers } = require("hardhat");

async function main() {
  const loanManagerAddress = "0xfaa8fb747885904f3b622f2986ce7568363e3646";
  const riskModuleAddress = "0xC6B0600cBf34eC6401c66fD7ce8Ac7aDE2386868";

  const loanManager = await ethers.getContractAt("LoanManager", loanManagerAddress);
  const riskModule = await ethers.getContractAt("GlobalRiskModule", riskModuleAddress);

  const lmAddrInRM = await riskModule.loanManager();
  const governorRole = ethers.id("GOVERNOR_ROLE");
  const caller = (await ethers.getSigners())[0].address;
  const isGov = await riskModule.hasRole(governorRole, caller);
  const pauserRole = ethers.id("PAUSER_ROLE");
  const isPauser = await loanManager.hasRole(pauserRole, riskModuleAddress);
  const isPaused = await loanManager.paused();

  console.log("LM address in RM:", lmAddrInRM);
  console.log("Caller is Gov of RM:", isGov);
  console.log("RM has PAUSER_ROLE on LM:", isPauser);
  console.log("LM is currently paused:", isPaused);

  console.log("Static calling riskModule.resume()...");
  try {
    await riskModule.resume.staticCall();
    console.log("Static call succeeded!");
  } catch (e) {
    console.log("Static call failed!");
    console.log("Error Message:", e.message);
  }
}

main().catch(console.error);
