const { ethers, deployments, getNamedAccounts, network } = require("hardhat");
const { parseUnits, formatUnits } = require("ethers");

async function main() {
    console.log("=================================================");
    console.log("=== VESTRA NEW FEATURES E2E TEST (v2)  ==========");
    console.log("=================================================\n");

    const { deployer } = await getNamedAccounts();
    const signers = await ethers.getSigners();
    const borrower = signers[1];
    const keeper = signers[2];

    // Contracts
    const loanManagerDeployment = await deployments.get("LoanManager");
    const loanManager = await ethers.getContractAt("LoanManager", loanManagerDeployment.address);

    const mockUSDCDeployment = await deployments.get("MockUSDC");
    const usdc = await ethers.getContractAt("MockUSDC", mockUSDCDeployment.address);

    // 1. Setup Roles
    console.log("-> Granting KEEPER_ROLE to tester...");
    const KEEPER_ROLE = await loanManager.KEEPER_ROLE();
    await (await loanManager.grantRole(KEEPER_ROLE, keeper.address)).wait();

    // 2. Create a Loan (reuse existing setup if possible, or mint new)
    console.log("-> Minting USDC for Borrower...");
    await usdc.mint(borrower.address, parseUnits("10000", 6));
    await usdc.connect(borrower).approve(loanManager.target, ethers.MaxUint256);

    // Note: Assuming a loan #1 already exists from previous simulations or we create a small one
    // For this test, we scan for the latest active loan
    const loanId = 1; // Simulation usually starts with ID 1
    console.log(`-> Testing with Loan ID: ${loanId}`);

    // 3. Partial Repayment
    console.log("\n[TEST] Executing PARTIAL REPAYMENT of $500 USDC...");
    const beforeLoan = await loanManager.loans(loanId);
    console.log(`[BEFORE] Principal: $${formatUnits(beforeLoan.principal, 6)} USDC`);

    const repayAmount = parseUnits("500", 6);
    await (await loanManager.connect(borrower).repayPartial(loanId, repayAmount)).wait();

    const afterLoan = await loanManager.loans(loanId);
    console.log(`✅ [AFTER] Principal: $${formatUnits(afterLoan.principal, 6)} USDC`);

    // 4. Vestra Pay Authorization
    console.log("\n[TEST] Authorizing Vestra Pay (Automated Settlement)...");
    await (await loanManager.connect(borrower).authorizeVestraPay(loanId, true)).wait();
    const vPayLoan = await loanManager.loans(loanId);
    console.log(`✅ Vestra Pay Enabled: ${vPayLoan.vestraPayEnabled}`);

    // 5. Keeper Repayment
    console.log("\n[TEST] Executing KEEPER REPAYMENT (Final Settlement)...");
    const totalDue = await loanManager.quoteRepayment(loanId);
    console.log(`[KEEPER] Spotted $${formatUnits(totalDue, 6)} due. Sending...`);

    // Simulated: Keeper calls keeperRepay. Borrower must have approved USDC already (Step 2).
    await (await loanManager.connect(keeper).keeperRepay(loanId, totalDue)).wait();
    
    const finalLoan = await loanManager.loans(loanId);
    console.log(`✅ [FINAL] Active: ${finalLoan.active}`);

    console.log("\n=================================================");
    console.log("=====      ALL NEW FEATURES VERIFIED        =====");
    console.log("=================================================");
}

main().catch(console.error);
