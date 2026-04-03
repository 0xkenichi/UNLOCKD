const { ethers } = require("hardhat");
const path = require("path");
const fs = require("fs");

async function main() {
    const deploymentsDir = path.join(process.cwd(), "deployments", "sepolia");
    const deployments = [
        "ValuationEngine", "LoanManager", "VestingAdapter", "LendingPool",
        "AuctionFactory", "LoanNFT", "OpenClawLighthouse", "GlobalRiskModule",
        "DutchAuction", "EnglishAuction", "SealedBidAuction", "StagedTrancheAuction"
    ];

    console.log("--- Vestra Protocol Sepolia Verification ---");

    for (const name of deployments) {
        const filePath = path.join(deploymentsDir, `${name}.json`);
        if (fs.existsSync(filePath)) {
            const deployment = JSON.parse(fs.readFileSync(filePath, "utf8"));
            const code = await ethers.provider.getCode(deployment.address);
            console.log(`[+] ${name}: ${deployment.address} (${code.length > 2 ? "CONFIRMED" : "EMPTY CODE!"})`);
        } else {
            console.log(`[-] ${name}: ARTIFACT MISSING`);
        }
    }

    // Checking Structural Links on LoanManager
    const lmAddress = "0x3E6ce9289c20EC7822296aaBf8A48A6a2a857B56";
    const lm = await ethers.getContractAt("LoanManager", lmAddress);

    console.log("\n--- structural_links ---");
    try {
        const nft = await lm.loanNFT();
        const risk = await lm.riskModule();
        const val = await lm.valuation();
        console.log(`LoanNFT: ${nft}`);
        console.log(`RiskModule: ${risk}`);
        console.log(`Valuation: ${val}`);

        const origination = await lm.originationFacet();
        console.log(`OriginationFacet: ${origination}`);

        const insurance = await lm.insuranceVault();
        console.log(`InsuranceVault Link in LM: ${insurance}`);
        if (insurance !== ethers.ZeroAddress && insurance !== "0x0000000000000000000000000000000000000000") {
            const code = await ethers.provider.getCode(insurance);
            console.log(`InsuranceVault Code: ${code.length > 2 ? "CONFIRMED" : "EMPTY"}`);
        }

        const poolAddress = "0x0914E18f160700d9ee70d0584F5E869e4CA2b6b6";
        const pool = await ethers.getContractAt("LendingPool", poolAddress);
        const lmInPool = await pool.loanManager();
        console.log(`LendingPool -> LoanManager: ${lmInPool === lmAddress ? "MATCH" : "MISMATCH (" + lmInPool + ")"}`);
    } catch (e) {
        console.log(`Link check failed: ${e.message}`);
    }
}

main().catch(console.error);
