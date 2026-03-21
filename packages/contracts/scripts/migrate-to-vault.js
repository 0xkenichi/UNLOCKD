const { ethers, deployments } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying Protocol Treasury Vault with account:", deployer.address);

    // 1. Deploy VestraVault
    const VestraVault = await ethers.getContractFactory("VestraVault");
    const vault = await VestraVault.deploy(deployer.address);
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();
    console.log("VestraVault (Protocol Treasury) deployed to:", vaultAddress);

    // 2. Get Protocol Contracts
    const loanManagerDeployment = await deployments.get("LoanManager");
    const lendingPoolDeployment = await deployments.get("LendingPool");
    const usdcDeployment = await deployments.get("MockUSDC");

    const loanManager = await ethers.getContractAt("LoanManager", loanManagerDeployment.address);
    const lendingPool = await ethers.getContractAt("LendingPool", lendingPoolDeployment.address);
    const usdc = await ethers.getContractAt("MockUSDC", usdcDeployment.address);

    // 3. Update Treasuries
    console.log("Updating treasuries to:", vaultAddress);
    await (await loanManager.setTreasuries(vaultAddress, vaultAddress)).wait();
    await (await lendingPool.setTreasuries(vaultAddress, vaultAddress)).wait();

    // 4. Critical: Vault must approve LendingPool to pull USDC
    console.log("Approving LendingPool via Vault.exec...");
    const approveData = usdc.interface.encodeFunctionData("approve", [
        lendingPoolDeployment.address,
        ethers.MaxUint256
    ]);
    await (await vault.exec(await usdc.getAddress(), 0, approveData)).wait();

    console.log("Migration complete.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
