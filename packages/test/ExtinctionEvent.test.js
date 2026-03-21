const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Vestra Milestone 4: Extinction-Event Chaos Simulation", function () {
    let owner, borrower, liquidator, insuranceAdmin;
    let usdc, pool, valuation, registry, adapter, wrapper, auctionFactory, liquidationAuction, insuranceVault;
    let testToken, priceFeed;

    const BPS_DENOMINATOR = 10000;
    const INITIAL_PRICE = 1000000000; // $10.00 (8 decimals)

    beforeEach(async function () {
        [owner, borrower, liquidator, insuranceAdmin] = await ethers.getSigners();

        // 1. Core Tokens
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();
        const usdcAddr = await usdc.getAddress();

        const MockToken = await ethers.getContractFactory("MockProjectToken");
        testToken = await MockToken.deploy("Chaos", "CHS", 18, ethers.parseEther("1000000"), owner.address);
        const tokenAddr = await testToken.getAddress();

        // 2. Oracle
        const MockFeed = await ethers.getContractFactory("MockPriceFeed");
        priceFeed = await MockFeed.deploy();
        // Add explicitly backdated mock rounds for TWAP testing
        for (let i = 5; i > 0; i--) {
            await priceFeed.addHistoricalRound(INITIAL_PRICE, 3600 * i);
        }
        await priceFeed.setPrice(INITIAL_PRICE);

        // 3. Registry & Adapter
        const Registry = await ethers.getContractFactory("VestingRegistry");
        registry = await Registry.deploy(owner.address);
        const registryAddr = await registry.getAddress();

        const Adapter = await ethers.getContractFactory("VestingAdapter");
        adapter = await Adapter.deploy(registryAddr, owner.address);
        const adapterAddr = await adapter.getAddress();

        const Wrapper = await ethers.getContractFactory("VestraWrapperNFT");
        wrapper = await Wrapper.deploy(owner.address);
        const wrapperAddr = await wrapper.getAddress();
        await wrapper.setVestingAdapter(adapterAddr);
        await adapter.setWrapperNFT(wrapperAddr);

        // 4. Valuation Engine
        const Valuation = await ethers.getContractFactory("ValuationEngine");
        valuation = await Valuation.deploy(registryAddr, owner.address);
        await valuation.setTokenPriceFeed(tokenAddr, await priceFeed.getAddress());
        await valuation.setTwapInterval(3600); // 1 hour TWAP
        await valuation.setMaxPriceAge(86400); // 24 hour max age for chaos test
        
        // 5. Lending Pool
        const Pool = await ethers.getContractFactory("LendingPool");
        pool = await Pool.deploy(usdcAddr, owner.address);
        const poolAddr = await pool.getAddress();

        // 6. Insurance Vault
        const Insurance = await ethers.getContractFactory("InsuranceVault");
        insuranceVault = await Insurance.deploy(usdcAddr, owner.address);
        const insuranceAddr = await insuranceVault.getAddress();
        await usdc.mint(insuranceAddr, ethers.parseUnits("1000000", 6)); // Fund the backstop

        // 7. Auction Factory & Liquidation Auction
        const Factory = await ethers.getContractFactory("AuctionFactory");
        auctionFactory = await Factory.deploy(adapterAddr, usdcAddr, owner.address);
        const factoryAddr = await auctionFactory.getAddress();

        const Liquidation = await ethers.getContractFactory("LiquidationAuction");
        liquidationAuction = await Liquidation.deploy(adapterAddr, usdcAddr, owner.address, owner.address);
        const auctionAddr = await liquidationAuction.getAddress();
        await auctionFactory.registerAuction("LIQUIDATION", auctionAddr);
        await liquidationAuction.setInsuranceVault(insuranceAddr);
        
        // --- PROPER ROLE SETUP ---
        // Grant Guardian role to LiquidationAuction on Insurance Vault
        const GUARDIAN_ROLE = await insuranceVault.GUARDIAN_ROLE();
        await insuranceVault.grantRole(GUARDIAN_ROLE, auctionAddr);

        // 8. LoanManager (Diamond Facet Pattern Simulation)
        const LoanLogicLib = await ethers.getContractFactory("LoanLogicLib");
        const lib = await LoanLogicLib.deploy();
        const libAddr = await lib.getAddress();

        const RepaymentFacet = await ethers.getContractFactory("LoanRepaymentFacet", {
            libraries: {
                LoanLogicLib: libAddr
            }
        });
        this.repayment = await RepaymentFacet.deploy(owner.address);
        const repaymentAddr = await this.repayment.getAddress();
        
        // Configure Repayment Facet
        await this.repayment.setPool(poolAddr);
        await this.repayment.setValuation(await valuation.getAddress());
        await this.repayment.setAdapter(adapterAddr);
        await this.repayment.setAuctionFactory(factoryAddr);
        await this.repayment.setInsuranceVault(insuranceAddr);
        await liquidationAuction.setLoanManager(repaymentAddr);
        await liquidationAuction.setInsuranceVault(insuranceAddr);
        await this.repayment.setUsdc(usdcAddr);
        await this.repayment.setInsuranceVault(insuranceAddr);
        await adapter.setLoanManager(repaymentAddr);
        await pool.setLoanManager(repaymentAddr);
        await liquidationAuction.setLoanManager(repaymentAddr);

        // 9. Setup Borrower & Collateral
        await usdc.mint(poolAddr, ethers.parseUnits("1000000", 6)); // Fill pool
        
        // Create Mock Vesting
        const MockVesting = await ethers.getContractFactory("MockVestingWallet");
        this.vesting = await MockVesting.deploy(borrower.address, (await time.latest()), 365 * 86400, tokenAddr, ethers.parseEther("1000"));
        this.vestingAddr = await this.vesting.getAddress();
        await registry.vetContract(this.vestingAddr, 1); // Rank 1 (Flagship)

        // Escrow collateral
        await adapter.connect(borrower).escrow(101, this.vestingAddr, borrower.address);

        // 10. Mint initial loan to put debt on books
        // We'll manually set the loan in storage to bypass origination logic for speed
        // Or call createLoan on OriginationFacet. Let's do a manual inject for state control.
        await this.repayment.injectLoan(
            0, // loanId
            borrower.address,
            tokenAddr,
            ethers.parseUnits("5000", 6), // Borrow $5000 against 1000 tokens ($10k value)
            0, // interest
            101, // collateralId
            ethers.parseEther("1000"), // quantity
            (await time.latest()) + 365*86400 // unlockTime
        );
        await pool.setTotalBorrowed(ethers.parseUnits("5000", 6));
        
        // --- Setup Liquidator ---
        await usdc.mint(liquidator.address, ethers.parseUnits("100000", 6));
        await usdc.connect(liquidator).approve(auctionAddr, ethers.MaxUint256);
    });

    describe("Chaos Scenario: 50% Market Crash", function () {
        it("Should survive an extinction-level event via Dutch Auction repayment", async function () {
            // 1. Trigger the Crash
            const CRASH_PRICE = 450000000; // $4.50 (55% drop)
            await priceFeed.setPrice(CRASH_PRICE);
            await time.increase(1200);
            await priceFeed.setPrice(CRASH_PRICE);
            await time.increase(1200);
            await priceFeed.setPrice(CRASH_PRICE);
            await time.increase(1300); // Total > 3600 and covered by 1200s rounds
            
            // Check eligibility (Debt 5000, PV (Min of TWAP/Spot) = 4500 * Multipliers)
            // LTV Threshold for Rank 1 is 75%. 
            // PV = 4500 * 0.9 (liq) * 0.95 (shock) * 0.95 (vol) = ~3660. PV < Debt. Trigger!
            
            // Check eligibility manually in test
            const tokenAddress = await testToken.getAddress();
            const [pv, ltv] = await valuation.computeDPV(ethers.parseEther("1000"), tokenAddress, (await time.latest()) + 365*86400, this.vestingAddr);
            const debt = 5000 * 1e6;
            console.log("   - PV for Liquidation:", ethers.formatUnits(pv, 6), "USDC");
            console.log("   - Current Debt:", ethers.formatUnits(debt, 6), "USDC");
            
            // 2. Initiate Liquidation
            await this.repayment.liquidateCollateral(0);
            expect(await this.repayment.inLiquidation(0)).to.be.true;

            // 3. Auction checks
            const auctionId = 0;
            const startPrice = await liquidationAuction.getCurrentPrice(auctionId);
            console.log("   - Auction Start Price:", ethers.formatUnits(startPrice, 6), "USDC");

            // 4. Liquidator Bids
            const bidAmount = startPrice; // Bid immediately to snag the position
            await liquidationAuction.connect(liquidator).bid(auctionId, bidAmount);

            // 5. Verify Pool Solvency
            expect(await pool.totalBorrowed()).to.equal(0);
            expect(await wrapper.ownerOf(1)).to.equal(liquidator.address);
            
            console.log("   [Simulation 1 Passed]: Positions liquidated successfully during volatility.");
        });

        it("Should use Insurance Vault as backstop when no bidders arrive (Final Solvency Proof)", async function () {
            // 1. The Super-Crash
            await priceFeed.setPrice(100000000); // $1.00 (90% drop)
            await time.increase(1200);
            await priceFeed.setPrice(100000000);
            await time.increase(1200);
            await priceFeed.setPrice(100000000);
            await time.increase(1300);
            
            await this.repayment.liquidateCollateral(0);
            const auctionId = 0;

            // 2. Fast forward past auction duration (24 hours)
            await time.increase(25 * 3600);

            // 3. No one bid. The debt is $5000. Start Price was ~5500. End Price was ~4000.
            // Pool is underwater. Settle with Insurance.
            const vaultBalanceBefore = await usdc.balanceOf(await insuranceVault.getAddress());
            await liquidationAuction.settleWithInsurance(auctionId);
            const vaultBalanceAfter = await usdc.balanceOf(await insuranceVault.getAddress());

            // 4. Verify
            expect(await pool.totalBorrowed()).to.equal(0);
            expect(await wrapper.ownerOf(1)).to.equal(await insuranceVault.getAddress());
            expect(vaultBalanceBefore - vaultBalanceAfter).to.equal(ethers.parseUnits("5000", 6));

            console.log("   [Simulation 2 Passed]: Insurance backstop saved the protocol.");
        });
    });
});
