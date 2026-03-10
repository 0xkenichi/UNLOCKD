const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    console.log("Starting Mint Vault Liquidity Script");
    const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_SEPOLIA_URL || "https://eth-sepolia.g.alchemy.com/v2/vFg0i2LwT6-VD2bja4ZB3");
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) throw new Error("Missing PRIVATE_KEY in environment");
    
    const wallet = new ethers.Wallet(privateKey, provider);
    console.log(`Using wallet: ${wallet.address}`);

    const artifactsPath = path.join(__dirname, "../deployments/sepolia");
    
    const getAddress = (name) => {
       const p = path.join(artifactsPath, `${name}.json`);
       if (!fs.existsSync(p)) throw new Error(`Missing ${name}.json in sepolia deployments`);
       return JSON.parse(fs.readFileSync(p, 'utf8')).address;
    };

    const usdcAddress = getAddress('MockUSDC');
    const termVaultAddress = getAddress('TermVault');
    const lendingPoolAddress = getAddress('LendingPool');

    console.log(`MockUSDC: ${usdcAddress}`);
    console.log(`TermVault: ${termVaultAddress}`);
    console.log(`LendingPool: ${lendingPoolAddress}`);

    const erc20MockAbi = ["function mint(address account, uint256 amount) public", "function balanceOf(address) view returns (uint256)", "function approve(address spender, uint256 amount) returns (bool)", "function transfer(address to, uint256 amount) returns (bool)"];
    const usdc = new ethers.Contract(usdcAddress, erc20MockAbi, wallet);

    let balance = await usdc.balanceOf(wallet.address);
    console.log(`Initial USDC Balance: ${ethers.formatUnits(balance, 6)} USDC`);

    if (balance < ethers.parseUnits("1000000", 6)) {
        const mintAmount = ethers.parseUnits("1000000", 6);
        console.log(`Attempting to mint 1,000,000 USDC...`);
        try {
            const mintTx = await usdc.mint(wallet.address, mintAmount, { gasLimit: 500000 });
            await mintTx.wait(1);
            console.log(`Mint successful! Tx: ${mintTx.hash}`);
        } catch(e) {
            console.error("Direct mint failed:", e.message);
        }
    }

    balance = await usdc.balanceOf(wallet.address);
    console.log(`Current USDC Balance: ${ethers.formatUnits(balance, 6)} USDC`);

    if (balance < ethers.parseUnits("20000", 6)) {
        throw new Error("Insufficient USDC to fund the vault. Need at least 20k");
    }

    const fundAmountVault = ethers.parseUnits("50000", 6);
    console.log(`Approving TermVault to take ${ethers.formatUnits(fundAmountVault, 6)} USDC...`);
    try {
       const approveTx1 = await usdc.approve(termVaultAddress, ethers.MaxUint256);
       await approveTx1.wait(1);
       
       console.log("Funding TermVault Rewards...");
       const termVaultAbi = ["function fundRewards(uint256 amount) external"];
       const vault = new ethers.Contract(termVaultAddress, termVaultAbi, wallet);
       const txVault = await vault.fundRewards(fundAmountVault, { gasLimit: 500000 });
       await txVault.wait(1);
       console.log(`TermVault funded! Tx: ${txVault.hash}`);
    } catch(e) {
       console.error("Failed funding TermVault", e.message);
    }

    const fundAmountPool = ethers.parseUnits("50000", 6);
    console.log(`Sending ${ethers.formatUnits(fundAmountPool, 6)} USDC directly to LendingPool for initial liquidity...`);
    
    try {
         const txPool = await usdc.transfer(lendingPoolAddress, fundAmountPool);
         await txPool.wait(1);
         console.log(`LendingPool funded with transfer! Tx: ${txPool.hash}`);
    } catch(e) {
         console.error("Funding LendingPool failed:", e.message);
    }

    console.log("Liquidity setup complete!");
}

main().catch(console.error);
