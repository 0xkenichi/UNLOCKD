const { ethers } = require("ethers");
require("dotenv").config({ path: "../../.env" });

async function main() {
  const RPC_URL = process.env.ALCHEMY_SEPOLIA_URL || "https://rpc.sepolia.org";
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  const relayerAddress = "0x39EcF94ed35451A67006dcCE4A467aecdfAB6940";
  const usdcAddress = "0x3dF11e82a5aBe55DE936418Cf89373FDAE1579C8";
  
  const usdc = new ethers.Contract(usdcAddress, [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ], provider);
  
  try {
    const balance = await usdc.balanceOf(relayerAddress);
    const decimals = await usdc.decimals();
    console.log(`Relayer USDC Balance: ${ethers.formatUnits(balance, decimals)}`);
  } catch (err) {
    console.error("Failed to fetch balance:", err.message);
  }
}

main();
