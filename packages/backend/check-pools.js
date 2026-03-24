const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/vFg0i2LwT6-VD2bja4ZB3');
const address = '0xfa515a43b9d010a398ff6a3253c1c7a9374f8c95';
const abi = ['function communityPoolCount() view returns (uint256)'];
async function main() {
  const contract = new ethers.Contract(address, abi, provider);
  const count = await contract.communityPoolCount();
  console.log(`Pool Count: ${count}`);
}
main();
