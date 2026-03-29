const { ethers } = require("ethers");

async function main() {
  const LM_ADDRESS = "0x3E6ce9289c20EC7822296aaBf8A48A6a2a857B56"; // Correct Sepolia address
  const GRM_ADDRESS = "0x38d1467eeb318846BF3B0c358BeFa9c35253D87c";
  const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/rnbX-ajOnoP1gse8FjH3v";
  const PK = "0x0880eea5bfb8ffe8f1be0a591b0810b5d46ff186196ca47c72945cdf95ce9a89";

  console.log("--- Manual Role Grant (Plain Ethers V3) ---");
  
  const provider = new ethers.JsonRpcProvider(RPC_URL, null, {
    staticNetwork: true,
  });
  
  const wallet = new ethers.Wallet(PK, provider);
  
  const ABI = [
    "function grantRole(bytes32 role, address account) external",
    "function PAUSER_ROLE() public view returns (bytes32)",
    "function GUARDIAN_ROLE() public view returns (bytes32)"
  ];
  
  const loanManager = new ethers.Contract(LM_ADDRESS, ABI, wallet);

  try {
    const PAUSER_ROLE = await loanManager.PAUSER_ROLE();
    const GUARDIAN_ROLE = await loanManager.GUARDIAN_ROLE();

    console.log("Granting PAUSER_ROLE...");
    const tx1 = await loanManager.grantRole(PAUSER_ROLE, GRM_ADDRESS);
    console.log("TX Hash:", tx1.hash);
    await tx1.wait();

    console.log("Granting GUARDIAN_ROLE...");
    const tx2 = await loanManager.grantRole(GUARDIAN_ROLE, GRM_ADDRESS);
    console.log("TX Hash:", tx2.hash);
    await tx2.wait();

    console.log("Roles granted successfully.");
  } catch (e) {
    console.error("Failed:", e.message);
  }
}

main();
