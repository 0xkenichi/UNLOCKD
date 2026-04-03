const { ethers } = require("hardhat");

async function main() {
  const addresses = [
    "0xf70a3b29cf5f806b4b7d2d397376ea7161339b1d",
    "0x7C64fE0f473D10B9bf7296fD1310FFAa1a312e10",
    "0xfaa8fb747885904f3b622f2986ce7568363e3646"
  ];

  for (const addr of addresses) {
    console.log("Checking:", addr);
    try {
      const code = await ethers.provider.getCode(addr);
      if (code === "0x") {
        console.log("  No code at address");
        continue;
      }
      const LM = await ethers.getContractAt([
        "function paused() external view returns (bool)"
      ], addr);
      const isPaused = await LM.paused();
      console.log("  Responder! paused:", isPaused);
    } catch (e) {
      console.log("  Failed:", e.shortMessage || e.message);
    }
  }
}

main().catch(console.error);
