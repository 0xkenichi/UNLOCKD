/**
 * Deployment script for SablierV2FlowWrapper
 * Usage: npx hardhat run scripts/deploy-flow-wrapper.js --network [base|mainnet|sepolia]
 */
const hre = require("hardhat");

async function main() {
    const { ethers, network } = hre;
    const [deployer] = await ethers.getSigners();

    console.log(`Deploying SablierV2FlowWrapper to ${network.name}...`);

    // These should be provided via ENV or params if running manually
    const FLOW_CONTRACT = process.env.FLOW_CONTRACT;
    const FLOW_ID = process.env.FLOW_ID;
    const BENEFICIARY = process.env.BENEFICIARY;

    if (!FLOW_CONTRACT || !FLOW_ID || !BENEFICIARY) {
        console.error("Missing required environment variables: FLOW_CONTRACT, FLOW_ID, BENEFICIARY");
        process.exit(1);
    }

    const SablierV2FlowWrapper = await ethers.getContractFactory("SablierV2FlowWrapper");
    const wrapper = await SablierV2FlowWrapper.deploy(
        FLOW_CONTRACT,
        FLOW_ID,
        BENEFICIARY
    );

    await wrapper.waitForDeployment();
    const address = await wrapper.getAddress();

    console.log(`\n✅ SablierV2FlowWrapper deployed to: ${address}`);
    console.log(`Flow Contract: ${FLOW_CONTRACT}`);
    console.log(`Flow ID: ${FLOW_ID}`);
    console.log(`Beneficiary: ${BENEFICIARY}`);
    
    console.log("\nNext steps:");
    console.log("1. Add this wrapper address to the Vestra VestingAdapter via escrow().");
    console.log("2. Set the operator of this wrapper to the Vestra VestingAdapter.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
