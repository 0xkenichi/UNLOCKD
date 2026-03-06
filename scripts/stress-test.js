const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    const [deployer, ...users] = await ethers.getSigners();

    console.log("🚀 Starting Vestra Stress Test...");

    // 1. Deploy the Vault (if not already deployed)
    const Vault = await ethers.getContractFactory("VestraVault");
    const vault = await Vault.deploy();
    await vault.waitForDeployment();
    const vaultAddress = await vault.getAddress();

    console.log(`📡 Vault Deployed to: ${vaultAddress}`);
    console.log(`👉 Add this to your .env: VAULT_CONTRACT_ADDRESS=${vaultAddress}\n`);

    // 2. Simulation Loop
    for (let i = 0; i < users.length; i++) {
        const user = users[i];

        // Randomize behavior: 80% safe borrowers, 20% "High Risk" whales
        const isWhale = Math.random() > 0.8;
        const amount = isWhale
            ? ethers.parseUnits((Math.random() * 500 + 500).toString(), 18) // 500-1000 ETH
            : ethers.parseUnits((Math.random() * 10 + 1).toString(), 18);   // 1-10 ETH

        const token = "0x4200000000000000000000000000000000000006"; // Mock WETH

        console.log(`[User ${i}] 📝 Requesting ${isWhale ? '🚨 LARGE' : 'Safe'} Loan: ${ethers.formatUnits(amount, 18)} tokens...`);

        try {
            const tx = await vault.connect(user).requestLoan(amount, token);
            await tx.wait();
        } catch (e) {
            console.error(`Transaction failed for user ${i}`);
        }

        // Wait 5 seconds between requests so MeTTa has time to process and log
        await new Promise(r => setTimeout(r, 5000));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});