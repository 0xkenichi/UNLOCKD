const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();
    const address = await deployer.getAddress();
    console.log(`Checking status for deployer: ${address}`);

    const nonce = await deployer.getNonce("pending");
    const currentNonce = await deployer.getNonce("latest");
    const balance = await ethers.provider.getBalance(address);

    console.log(`Pending Nonce: ${nonce}`);
    console.log(`Latest Nonce: ${currentNonce}`);
    console.log(`Deployer Balance: ${ethers.formatEther(balance)} ETH`);

    console.log(`[!] Forcing clear of nonces from ${currentNonce} to ${nonce}...`);

    for (let i = currentNonce; i <= nonce; i++) {
        console.log(`    - Sending high-gas tx for nonce ${i}...`);
        try {
            const tx = await deployer.sendTransaction({
                to: address,
                value: 0,
                nonce: i,
                gasPrice: ethers.parseUnits("600", "gwei"),
            });
            console.log(`      Tx sent: ${tx.hash}`);
            await tx.wait();
            console.log(`      Nonce ${i} cleared!`);
        } catch (e) {
            console.log(`      Failed to clear nonce ${i}: ${e.message}`);
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
