const { ethers } = require("hardhat");

async function main() {
    const feeData = await ethers.provider.getFeeData();
    console.log(`Current Sepolia Gas Data:`);
    console.log(`- Base Fee: ${ethers.formatUnits(feeData.gasPrice, "gwei")} Gwei`);
    console.log(`- Max Fee: ${ethers.formatUnits(feeData.maxFeePerGas, "gwei")} Gwei`);
    console.log(`- Max Priority Fee: ${ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei")} Gwei`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
