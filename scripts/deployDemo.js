// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const { ethers, deployments } = hre;

    // Deploy standard core protocol infrastructure
    await deployments.fixture(["full"]);

    const [deployer, lender] = await ethers.getSigners();

    // Get protocol contracts
    const usdcDeployment = await deployments.get("MockUSDC");
    const valuationDeployment = await deployments.get("ValuationEngine");
    const poolDeployment = await deployments.get("LendingPool");
    const loanManagerDeployment = await deployments.get("LoanManager");
    const registryDeployment = await deployments.get("VestingRegistry");

    // Get signers connected to contracts
    const usdc = await ethers.getContractAt("MockUSDC", usdcDeployment.address, deployer);
    const valuation = await ethers.getContractAt("ValuationEngine", valuationDeployment.address, deployer);
    const pool = await ethers.getContractAt("LendingPool", poolDeployment.address, deployer);
    const registry = await ethers.getContractAt("VestingRegistry", registryDeployment.address, deployer);
    const loanManager = await ethers.getContractAt("LoanManager", loanManagerDeployment.address, deployer);

    const mockPriceFeedDeployment = await deployments.get("MockPriceFeed");
    const priceFeedAddress = mockPriceFeedDeployment.address;
    const priceFeed = await ethers.getContractAt("MockPriceFeed", priceFeedAddress, deployer);

    console.log("Setting up Lending Pool...");
    const poolLiquidity = ethers.parseUnits("1000000", 6); // 1 million USDC
    await (await usdc.connect(lender).faucet(poolLiquidity)).wait();
    await (await usdc.connect(lender).approve(await pool.getAddress(), poolLiquidity)).wait();
    await (await pool.connect(lender).deposit(poolLiquidity)).wait();

    console.log("Deploying Mock Project Token...");
    const MockProjectToken = await ethers.getContractFactory("MockProjectToken");
    const projectToken = await MockProjectToken.deploy(
        "Mock Project Token",
        "MPT",
        18,
        ethers.parseUnits("10000000", 18),
        deployer.address
    );
    await projectToken.waitForDeployment();
    const projectTokenAddress = await projectToken.getAddress();

    console.log("Configuring Price Oracle...");
    await (await priceFeed.setPrice(ethers.parseUnits("2", 8))).wait();
    await (await valuation.setTokenPriceFeed(projectTokenAddress, priceFeedAddress)).wait();

    const totalAmountPerWallet = ethers.parseUnits("100000", 18);
    const totalRequired = totalAmountPerWallet * 3n;
    // Tokens are minted to deployer in constructor

    console.log("Setting up Vesting Mocks...");
    const MockVestingDemoFactory = await ethers.getContractFactory("MockVestingDemo");
    const demoFactory = await MockVestingDemoFactory.deploy();
    await demoFactory.waitForDeployment();
    const demoFactoryAddress = await demoFactory.getAddress();

    await (await projectToken.approve(demoFactoryAddress, totalRequired)).wait();

    // Hardhat test account #3 as borrower (second account is lender)
    const borrowerWallet = new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
    const demoBorrower = borrowerWallet.address; // 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

    const result = await demoFactory.setupDemo.staticCall(demoBorrower, projectTokenAddress, totalAmountPerWallet);
    const [wallet1, wallet2, wallet3] = result;

    const tx = await demoFactory.setupDemo(demoBorrower, projectTokenAddress, totalAmountPerWallet);
    await tx.wait();

    console.log("Registering vesting wallets...");
    await (await registry.vetContract(wallet1, 1)).wait(); // rank 1
    await (await registry.vetContract(wallet2, 1)).wait();
    await (await registry.vetContract(wallet3, 1)).wait();

    // Additionally, ensure this user has an identity token if loan creation demands it.
    const identityVerifierAddress = await loanManager.identityVerifier();
    const identityVerifier = await ethers.getContractAt("IdentityVerifierMock", identityVerifierAddress, deployer);
    // Assuming identity is linked on creation, let's link it for demoBorrower if needed
    // LoanManager linkIdentity checks sender, but we can bypass or link it via borrower signer

    const borrowerSigner = await ethers.getImpersonatedSigner(demoBorrower);
    await deployer.sendTransaction({
        to: demoBorrower,
        value: ethers.parseEther("1.0"), // Send ETH to impersonated account
    });

    const mockProof = ethers.hexlify(ethers.randomBytes(8));
    await (await loanManager.connect(borrowerSigner).linkIdentity(mockProof)).wait();
    console.log("Identity linked for borrower");

    const config = {
        usdcAddress: await usdc.getAddress(),
        lendingPoolAddress: await pool.getAddress(),
        loanManagerAddress: await loanManager.getAddress(),
        valuationEngineAddress: await valuation.getAddress(),
        vestingAdapterAddress: await loanManager.adapter(),
        scenarios: {
            notLive: wallet1,
            liveVesting: wallet2,
            customVesting: wallet3
        },
        demoBorrower: demoBorrower
    };

    const configPath = path.join(__dirname, "../frontend/src/config/demoConfig.json");
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`Demo configuration exported to ${configPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
