const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Auditing Treasury with account:", deployer.address);

    const lendingPoolAddress = "0x0914E18f160700d9ee70d0584F5E869e4CA2b6b6";
    const usdcAddress = "0x3dF11e82a5aBe55DE936418Cf89373FDAE1579C8";

    const LendingPool = await ethers.getContractAt([
        "function returnsTreasury() view returns (address)",
        "function totalDeposits() view returns (uint256)"
    ], lendingPoolAddress);

    const USDC = await ethers.getContractAt([
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ], usdcAddress);

    const returnsTreasury = await LendingPool.returnsTreasury();
    const totalDeposits = await LendingPool.totalDeposits();
    const treasuryBalance = await USDC.balanceOf(returnsTreasury);
    const decimals = await USDC.decimals();

    const suppliedFormatted = ethers.formatUnits(totalDeposits, decimals);
    const balanceFormatted = ethers.formatUnits(treasuryBalance, decimals);

    console.log("\n--- Treasury Audit Report ---");
    console.log("Lending Pool:", lendingPoolAddress);
    console.log("Returns Treasury:", returnsTreasury);
    console.log("USDC Token:", usdcAddress);
    console.log("----------------------------");
    console.log("Total Deposits in Pool:", suppliedFormatted, "USDC");
    console.log("Treasury Balance:", balanceFormatted, "USDC");
    
    const coverage = (Number(treasuryBalance) / Number(totalDeposits)) * 100;
    console.log("Liquidity Coverage:", coverage.toFixed(2) + "%");

    if (coverage < 100) {
        console.warn("\n⚠️ WARNING: Treasury liquidity is below 100% of deposited capital!");
        console.warn("Lending limits should NOT be scaled up until treasury is replenished.");
    } else {
        console.log("\n✅ SUCCESS: Treasury liquidity is sufficient to cover 100%+ of deposited capital.");
        console.log("Lender limits can be safely scaled up.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
