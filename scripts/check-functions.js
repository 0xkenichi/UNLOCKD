const { ethers } = require("hardhat");

async function main() {
  const addr = "0x3ae02658c2f4928fa9a84c2b5fac41de78b67ef5";
  const resumeSig = ethers.id("resumeFromRiskModule()").substring(0, 10);
  console.log("Checking:", addr, "for sig:", resumeSig);
  const code = await ethers.provider.getCode(addr);
  if (code.includes(resumeSig.substring(2))) {
    console.log("  FOUND resumeFromRiskModule()!");
  } else {
    console.log("  NOT found.");
  }
}

main().catch(console.error);
