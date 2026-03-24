const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/vFg0i2LwT6-VD2bja4ZB3');
const address = '0x0914E18f160700d9ee70d0584F5E869e4CA2b6b6';
const abi = ['function communityPoolCount() view returns (uint256)'];
async function main() {
  const contract = new ethers.Contract(address, abi, provider);
  try {
    const count = await contract.communityPoolCount();
    console.log(`Pool Count: ${count}`);
  } catch (e) {
    console.error(`Call failed: ${e.message}`);
  }
}
main();
