const { ethers, deployments, getNamedAccounts, network } = require("hardhat");

async function main() {
    console.log("=========================================");
    console.log("=== VESTRA E2E LIFECYCLE SIMULATION  ====");
    console.log("=========================================\n");

    const { deployer } = await getNamedAccounts();
    const signers = await ethers.getSigners();
    const borrower = signers[1];
    const liquidator = signers[2];

    // Contracts
    const lendingPoolDeployment = await deployments.get("LendingPool");
    const lendingPool = await ethers.getContractAt("LendingPool", lendingPoolDeployment.address);

    const loanManagerDeployment = await deployments.get("LoanManager");
    const loanManager = await ethers.getContractAt("LoanManager", loanManagerDeployment.address);

    const adapterDeployment = await deployments.get("VestingAdapter");
    const adapter = await ethers.getContractAt("VestingAdapter", adapterDeployment.address);

    const mockUSDCDeployment = await deployments.get("MockUSDC");
    const usdc = await ethers.getContractAt("MockUSDC", mockUSDCDeployment.address);

    const insuranceVaultDeployment = await deployments.get("InsuranceVault");

    // Create Dummy Vesting Token
    console.log("-> Deploying Mock Vesting Token (CRDT)");
    const Token = await ethers.getContractFactory("MockUSDC");
    const token = await Token.deploy();
    await token.waitForDeployment();

    // Set Valuation for Token
    console.log("-> Setting Valuation at $2.00 per token");
    const valuationDeployment = await deployments.get("ValuationEngine");
    const valuation = await ethers.getContractAt("ValuationEngine", valuationDeployment.address);
    const mockFeedDeployment = await deployments.get("MockPriceFeed");
    const mockFeed = await ethers.getContractAt("MockPriceFeed", mockFeedDeployment.address);
    // Add historical data for TWAP depth
    await mockFeed.addHistoricalRound(ethers.parseUnits("2.00", 8), 86400 * 2); // 2 days ago
    await mockFeed.addHistoricalRound(ethers.parseUnits("2.00", 8), 86400 * 1); // 1 day ago
    // 2.00 * 10^8 decimals for chainlink mock feed
    await mockFeed.setPrice(ethers.parseUnits("2.00", 8));
    await valuation.setTokenPriceFeed(token.target, mockFeedDeployment.address);

    // Create Vesting Contract for Borrower
    console.log("-> Creating Vesting Schedule for Borrower...");
    const deployerSigner = await ethers.getSigner(deployer);
    const VestingFactory = await ethers.getContractFactory("MockVestingWallet", deployerSigner);
    // Use latest block timestamp as base for relative times to avoid block timestamp issues
    const currentBlock = await ethers.provider.getBlock("latest");
    const start = currentBlock.timestamp - (86400 * 30); // Started 30 days ago
    const duration = 86400 * 730; // 2 years
    const allocation = ethers.parseEther("100000");
    const vestingStr = await VestingFactory.deploy(borrower.address, start, duration, token.target, allocation);
    await vestingStr.waitForDeployment();
    const vestingAddress = vestingStr.target;

    // Fund Vesting Contract AND Borrower 
    await token.mint(vestingAddress, ethers.parseEther("100000")); // 100k Tokens -> 200k Valuation
    await token.mint(borrower.address, ethers.parseEther("100000")); // The wrapper needs to find the tokens in borrower account to move to Escrow
    await token.connect(borrower).approve(adapter.target, ethers.MaxUint256); // Approve adapter to escrow mock wrapper token

    // Register Vesting Contract
    console.log("-> Registering Vesting Contract (Premium Rank 1)");
    const registryDeployment = await deployments.get("VestingRegistry");
    const registry = await ethers.getContractAt("VestingRegistry", registryDeployment.address);
    await registry.vetContract(vestingAddress, 1);

    // Pre-fund the Lending Pool
    console.log("-> Depositing 50k USDC into Lending Pool (Lender)");
    await usdc.mint(deployer, ethers.parseUnits("50000", 6));
    await usdc.approve(lendingPool.target, ethers.parseUnits("50000", 6));
    await lendingPool.deposit(ethers.parseUnits("50000", 6));

    // Set Recourse Allowance
    console.log("-> Borrower pre-approving USDC for Strict Recourse...");
    await usdc.connect(borrower).approve(loanManager.target, ethers.MaxUint256);

    // Create Loan
    console.log("\n[BORROWER] Requesting $15,000 against 50,000 CRDT Tokens...");
    await loanManager.connect(borrower).createLoanWithCollateralAmount(
        1,
        vestingAddress,
        ethers.parseUnits("15000", 6),
        ethers.parseEther("50000"), // 50k CRDT -> $100k Value -> 15% LTV -> Very Safe
        365 // 1 year duration
    );

    console.log("✅ Loan Created!");
    const initialBalance = await usdc.balanceOf(borrower.address);
    console.log(`[BORROWER] Wallet Balance: $${ethers.formatUnits(initialBalance, 6)} USDC`);

    // Fast forward to unlock time
    console.log("\n-> ⏳ Fast forwarding time by 1 year to maturity...");
    await network.provider.send("evm_increaseTime", [86400 * 365]);
    await network.provider.send("evm_mine");

    // Price Crash Scenario
    console.log("-> 📉 CRASH: Token price drops from $2.00 to $0.15 (92.5% drop)...");
    await mockFeed.setPrice(ethers.parseUnits("0.15", 8));

    // Settlement attempt
    console.log("\n[SYSTEM] Attempting standard settlement (Default Protocol)...");
    await loanManager.settleAtUnlock(1);

    const vaultBal = await usdc.balanceOf(insuranceVaultDeployment.address);
    console.log(`[INSURANCE VAULT] Balance Before: $${ethers.formatUnits(vaultBal, 6)}`);

    const deficit = await loanManager.loanDeficits(1);
    console.log(`[SYSTEM] 🚨 Deficit remaining on Loan #1: $${ethers.formatUnits(deficit, 6)}. Loan requires manual secondary sweep by Omega Agent.`);

    // Omega Agent Steps In
    console.log("\n============= OMEGA AI RISK AGENT =============");
    console.log("🔥 Risk Agent spotted Deficit!");
    console.log("🔥 Scanning Borrower Wallet for approved WETH/USDC...");

    await usdc.mint(borrower.address, ethers.parseUnits("10000", 6));
    const hidingBalance = await usdc.balanceOf(borrower.address);
    console.log(`🔥 Spotted $${ethers.formatUnits(hidingBalance, 6)} in Borrower Wallet.`);

    console.log("⚡ Executing Strict Recourse Seizure...");
    await loanManager.sweepSecondaryAssets(1, [usdc.target]);

    const newDeficit = await loanManager.loanDeficits(1);
    console.log(`\n✅ Outstanding Deficit after Seizure: $${ethers.formatUnits(newDeficit, 6)}`);

    const finalBorrower = await usdc.balanceOf(borrower.address);
    console.log(`📉 Vestra strictly penalized Borrower. Remaining wallet balance: $${ethers.formatUnits(finalBorrower, 6)}`);

    console.log("\n============= SIMULATION COMPLETE =============");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
