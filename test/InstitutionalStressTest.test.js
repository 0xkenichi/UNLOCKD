const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Vestra Institutional Stress Tests (V5.0 Defenses)", function () {
    let owner, vcAuditor, retailAttacker;
    let usdc, valuation, adapter, pool, loanManager, registry, oracle, usdcOracle, coprocessor;
    let testToken;
    let mockFeedAddress;

    const BPS_DENOMINATOR = 10000;

    beforeEach(async function () {
        [owner, vcAuditor, retailAttacker, coprocessor] = await ethers.getSigners();

        // 1. Deploy Basics
        const MockUSDC = await ethers.getContractFactory("MockUSDC");
        usdc = await MockUSDC.deploy();

        const MockProjectToken = await ethers.getContractFactory("MockProjectToken");
        testToken = await MockProjectToken.deploy("IlliquidToken", "ILT", 18, ethers.parseEther("10000000"), await owner.getAddress());

        const Registry = await ethers.getContractFactory("VestingRegistry");
        registry = await Registry.deploy();

        const Valuation = await ethers.getContractFactory("ValuationEngine");
        valuation = await Valuation.deploy(await registry.getAddress());
        await valuation.setMaxPriceAge(7 * 86400); // 7 days

        const Adapter = await ethers.getContractFactory("VestingAdapter");
        adapter = await Adapter.deploy(await registry.getAddress());

        const Pool = await ethers.getContractFactory("LendingPool");
        pool = await Pool.deploy(await usdc.getAddress());

        const Loan = await ethers.getContractFactory("LoanManager");
        loanManager = await Loan.deploy(
            await valuation.getAddress(),
            await adapter.getAddress(),
            await pool.getAddress(),
            ethers.ZeroAddress,
            0,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            3000,
            100
        );

        // 2. Wire Permissions
        await pool.setLoanManager(await loanManager.getAddress());
        await adapter.setAuthorizedCaller(await loanManager.getAddress(), true);
        await loanManager.setSanctionsPass(owner.address, true);
        await loanManager.setSanctionsPass(vcAuditor.address, true);
        // By default, retailAttacker does not have sanctionsPass (representing US Citizen/Retail)

        // 4. Set Prices (Oracle says token is worth $10.00)
        const MockFeed = await ethers.getContractFactory("MockPriceFeed");
        oracle = await MockFeed.deploy();

        const currentBlockTime = (await ethers.provider.getBlock("latest")).timestamp;

        // Oracle requires historical rounds for TWAP calculations
        await oracle.addHistoricalRound(1000000000, 3600); // 1 hour ago
        await oracle.addHistoricalRound(1000000000, 1800); // 30 mins ago
        await oracle.setPrice(1000000000); // $10.00 current

        mockFeedAddress = await oracle.getAddress();
        await valuation.setTokenPriceFeed(await testToken.getAddress(), mockFeedAddress);

        // Setup USDC feed ($1)
        usdcOracle = await MockFeed.deploy();
        await usdcOracle.addHistoricalRound(100000000, 3600);
        await usdcOracle.addHistoricalRound(100000000, 1800);
        await usdcOracle.setPrice(100000000); // $1.00 current
        await valuation.setTokenPriceFeed(await usdc.getAddress(), await usdcOracle.getAddress());

        // 5. Provide Pool Liquidity
        await usdc.mint(vcAuditor.address, 10000000n * 10n ** 6n);
        await testToken.transfer(vcAuditor.address, ethers.parseEther("1000000"));
        await testToken.transfer(retailAttacker.address, ethers.parseEther("1000000"));
        await usdc.connect(vcAuditor).approve(await pool.getAddress(), ethers.MaxUint256);
        await pool.connect(vcAuditor).deposit(10000000n * 10n ** 6n); // $10m protocol TVL

        await valuation.setCoprocessor(coprocessor.address);
    });

    describe("Stage 1: The 'Float vs Locked' PV Capping Test", function () {
        it("Should aggressively squash PV extraction if the underlying liquidity is explicitly capped to prevent the inflation illusion", async function () {
            // Setup: Whale locks up 1,000,000 IlliquidTokens ($10m theoretical value at $10/per)
            const lockedAmount = ethers.parseEther("1000000");
            const unlockTime = (await time.latest()) + 86400 * 30; // 30 days

            const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
            const vesting = await MockVestingWallet.deploy(
                vcAuditor.address,
                (await time.latest()),
                86400 * 365,
                await testToken.getAddress(),
                lockedAmount
            );
            const vestAddr = await vesting.getAddress();
            await testToken.transfer(vestAddr, lockedAmount);

            await registry.vetContract(vestAddr, 3);

            // At $10 per token, Base LTV of Rank 3 is 20%. The theoretical loan on $10M is $2M.
            // But we know the exit liquidity for this token is only $50,000 in real life.
            // So we explicitly cap the protocol's liquidity allowance for this token to $50k.
            const realLiquidityCapUsd = ethers.parseUnits("50000", 18); // 50k USD (18 desc system)
            await valuation.connect(coprocessor).setTokenMaxLiquidityBorrow(await testToken.getAddress(), realLiquidityCapUsd);

            // Compute the DPV
            const [pv, ltvBps] = await valuation.computeDPV(lockedAmount, await testToken.getAddress(), unlockTime, vestAddr);

            // The PV mathematically must be truncated heavily, meaning the loan offered will be a fraction of the theoretical volume.
            // pv returned is in USD terms (scaled to 1e18). The PV shouldn't exceed the USD liquidity cap.
            expect(pv).to.be.lte(realLiquidityCapUsd);

            // The max borrow will be (5000 tokens * $10) = $50,000 * 20% LTV = $10,000.
            // Far cry from the $2,000,000 they would have walked away with if the protocol was naive.
            const borrowAmountReq = 10000n * 10n ** 6n; // $10k

            await expect(
                loanManager.connect(vcAuditor).createLoan(0, vestAddr, borrowAmountReq, 14)
            ).to.not.be.reverted;

            // But if they ask for $100k, they get hammered for ExceedsLTV().
            const greedyBorrowAmount = 100000n * 10n ** 6n; // $100k

            const vesting2 = await MockVestingWallet.deploy(
                vcAuditor.address,
                (await time.latest()),
                86400 * 365,
                await testToken.getAddress(),
                lockedAmount
            );
            const vestAddr2 = await vesting2.getAddress();
            await testToken.transfer(vestAddr2, lockedAmount);
            await registry.vetContract(vestAddr2, 3);

            await expect(
                loanManager.connect(vcAuditor).createLoan(1, vestAddr2, greedyBorrowAmount, 14)
            ).to.be.revertedWithCustomError(loanManager, "ExceedsLTV");
        });
    });

    describe("Stage 2: SEC Geo-blocking Evasion (Unauthorized Callers)", function () {
        it("Should hard-revert retail US wallets attempting to bypass the UI constraint via direct smart contract calls", async function () {
            // Retail attacker mimics the exact same flow as the approved auditor
            const lockedAmount = ethers.parseEther("1000");
            const unlockTime = (await time.latest()) + 86400 * 30;

            const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
            const vesting = await MockVestingWallet.deploy(
                retailAttacker.address,
                (await time.latest()),
                86400 * 365,
                await testToken.getAddress(),
                lockedAmount
            );
            const vestAddr = await vesting.getAddress();
            await testToken.transfer(vestAddr, lockedAmount);

            await registry.vetContract(vestAddr, 3);

            // Retail attacker calls createLoan directly on-chain using Etherscan
            const borrowAmountReq = 1000n * 10n ** 6n;

            await expect(
                loanManager.connect(retailAttacker).createLoan(0, vestAddr, borrowAmountReq, 14)
            ).to.be.revertedWithCustomError(loanManager, "Unauthorized");
        });
    });

    describe("Stage 3: Flash Pump AI Pre-Crime (Circuit Breaker)", function () {
        it("Should instantly freeze all origination against a token if Omega AI detects a suspicious liquidity delta", async function () {
            // Auditor sets up a legitimate lock
            const lockedAmount = ethers.parseEther("1000");
            const unlockTime = (await time.latest()) + 86400 * 30;

            const MockVestingWallet = await ethers.getContractFactory("MockVestingWallet");
            const vesting = await MockVestingWallet.deploy(
                vcAuditor.address,
                (await time.latest()),
                86400 * 365,
                await testToken.getAddress(),
                lockedAmount
            );
            const vestAddr = await vesting.getAddress();
            await testToken.transfer(vestAddr, lockedAmount);

            await registry.vetContract(vestAddr, 3);

            // Omega detects a 400% price spike in the last 15 minutes with no correlating DEX volume.
            // Omega fires a 48 hour freeze on the token via the Coprocessor permission.
            await valuation.connect(coprocessor).reportFlashPump(await testToken.getAddress(), 48 * 3600);

            const borrowAmountReq = 1000n * 10n ** 6n;

            // The auditor attempts to ride the pump and extract USDC
            await expect(
                loanManager.connect(vcAuditor).createLoan(0, vestAddr, borrowAmountReq, 14)
            ).to.be.revertedWithCustomError(loanManager, "CircuitBreakerTripped");

            // After 48 hours, the protocol clears up and resumes operations
            await time.increase(48 * 3600 + 1);

            // Give the oracle a fresh price heartbeat so the valuation engine doesn't revert with "stale price"
            const newTime = (await ethers.provider.getBlock("latest")).timestamp;
            await oracle.setStalePrice(1000000000, newTime);
            await usdcOracle.setStalePrice(100000000, newTime);

            await expect(
                loanManager.connect(vcAuditor).createLoan(0, vestAddr, borrowAmountReq, 14)
            ).to.not.be.reverted;
        });
    });

});
