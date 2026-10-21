// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../src/LendingPool.sol";
import "../src/LoanManager.sol";
import "../src/VestingAdapter.sol";
import "../src/ValuationEngine.sol";
import "../src/VestingRegistry.sol";
import "../src/InsuranceVault.sol";
import "../src/adapters/PreTGEOracle.sol";
import "../src/mocks/MockUSDC.sol";
import "../src/mocks/MockProjectToken.sol";
import "../src/mocks/MockPriceFeed.sol";
import "../src/mocks/MockSablierV2Lockup.sol";

contract VestraCoreTest is Test {
    MockUSDC usdc;
    MockProjectToken token;
    MockPriceFeed feed;
    MockSablierV2Lockup sablier;

    VestingRegistry registry;
    ValuationEngine valuation;
    VestingAdapter adapter;
    LendingPool pool;
    InsuranceVault insurance;
    LoanManager manager;

    address governor = makeAddr("governor");
    address guardian = makeAddr("guardian");
    address treasury = makeAddr("treasury");
    address lender   = makeAddr("lender");
    address lender2  = makeAddr("lender2");
    address borrower = makeAddr("borrower");
    address keeper   = makeAddr("keeper");
    address buyer    = makeAddr("buyer");
    address attacker = makeAddr("attacker");

    uint256 constant QTY = 100_000e18;
    uint256 constant POOL_SIZE = 1_000_000e6;
    uint256 streamId;

    function setUp() public {
        vm.warp(1_800_000_000);

        usdc = new MockUSDC();
        token = new MockProjectToken("Project", "PRJ", 18, 10_000_000e18, address(this));
        feed = new MockPriceFeed();
        feed.setPrice(1e8); // $1.00, 8 decimals
        sablier = new MockSablierV2Lockup();

        registry = new VestingRegistry(governor);
        valuation = new ValuationEngine(address(registry), governor);
        adapter = new VestingAdapter(governor);
        pool = new LendingPool(IERC20(address(usdc)), governor);
        insurance = new InsuranceVault(IERC20(address(usdc)), governor);
        manager = new LoanManager(
            IERC20(address(usdc)),
            ILendingPool(address(pool)),
            adapter,
            IValuationEngine(address(valuation)),
            IInsuranceVault(address(insurance)),
            treasury,
            governor
        );

        vm.startPrank(governor);
        registry.vetContract(address(sablier), 2);
        valuation.setTokenPriceFeed(address(token), address(feed));
        valuation.setVolatility(60);
        valuation.grantRole(keccak256("GUARDIAN_ROLE"), guardian);
        adapter.setWhitelisted(VestingAdapter.Protocol.SABLIER_V2, address(sablier), true);
        adapter.setLoanManager(address(manager));
        pool.setLoanManager(address(manager));
        insurance.setLoanManager(address(manager));
        vm.stopPrank();

        _deposit(lender, POOL_SIZE);
        streamId = _createStream(borrower, QTY, false);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _deposit(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(pool), amount);
        pool.deposit(amount, who);
        vm.stopPrank();
    }

    function _createStream(address recipient, uint256 qty, bool cancelable) internal returns (uint256 id) {
        token.approve(address(sablier), qty);
        id = sablier.createStream(
            recipient, address(token), uint128(qty), uint40(block.timestamp), uint40(block.timestamp + 365 days), cancelable
        );
    }

    function _borrow(uint256 amount) internal returns (uint256 loanId) {
        vm.startPrank(borrower);
        sablier.approve(address(adapter), streamId);
        loanId = manager.borrow(address(sablier), streamId, VestingAdapter.Protocol.SABLIER_V2, amount, 0);
        vm.stopPrank();
    }

    function _repayFull(uint256 loanId) internal {
        uint256 debt = manager.debtOf(loanId);
        usdc.mint(borrower, debt);
        vm.startPrank(borrower);
        usdc.approve(address(manager), debt);
        manager.repay(loanId, debt);
        vm.stopPrank();
    }

    function _warpAndRefresh(uint256 secs) internal {
        vm.warp(block.timestamp + secs);
        (, int256 p, , , ) = feed.latestRoundData();
        feed.setPrice(p);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Valuation
    // ─────────────────────────────────────────────────────────────────────────

    /// Whitepaper v4.1 worked example: 100,000 tokens, $1, 1 year, rank 2, σ = 60%, Ω = 1.
    function test_Valuation_MatchesWhitepaperExample() public view {
        (uint256 pv, uint256 ltv) =
            valuation.computeDPV(QTY, address(token), block.timestamp + 365 days, address(sablier));
        // 100,000 · e^(−0.05) · (1 − 0.30) = 66,586.06
        assertApproxEqAbs(pv, 66_586_060_000, 10_000, "pv");
        assertEq(ltv, 3500, "ltv");
        assertApproxEqAbs((pv * ltv) / 10_000, 23_305_120_000, 10_000, "max borrow");
    }

    function test_Valuation_OmegaZeroMeansNoCredit() public {
        vm.prank(guardian);
        valuation.updateOmega(address(token), 0);
        (uint256 pv, ) = valuation.computeDPV(QTY, address(token), block.timestamp + 365 days, address(sablier));
        assertEq(pv, 0);

        vm.startPrank(borrower);
        sablier.approve(address(adapter), streamId);
        vm.expectRevert("exceeds max borrow");
        manager.borrow(address(sablier), streamId, VestingAdapter.Protocol.SABLIER_V2, 100e6, 0);
        vm.stopPrank();
    }

    function test_Valuation_PreTGEAppliesMandatoryHaircut() public {
        MockProjectToken preTge = new MockProjectToken("Pre", "PRE", 18, 1_000_000e18, address(this));
        PreTGEOracle oracle = new PreTGEOracle(address(this), address(this));
        oracle.setSyntheticPrice(address(preTge), 1e8, 8); // $1.00 implied
        vm.prank(governor);
        valuation.setPreTGEOracle(address(oracle));

        // Spot value reflects the 90% haircut: $1 → $0.10
        assertEq(valuation.spotValue(100_000e18, address(preTge)), 10_000e6);
    }

    function test_Valuation_StalePriceReverts() public {
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert("stale price");
        valuation.computeDPV(QTY, address(token), block.timestamp + 300 days, address(sablier));
    }

    function test_Valuation_EWMAUpdatesOncePerRound() public {
        valuation.updateEWMA(address(token));
        uint256 first = valuation.tokenEWMA(address(token));
        vm.warp(block.timestamp + 1 minutes);
        feed.setPrice(0.5e8);
        // Spamming in the same round does not drag the EWMA further down.
        valuation.updateEWMA(address(token));
        uint256 second = valuation.tokenEWMA(address(token));
        valuation.updateEWMA(address(token));
        valuation.updateEWMA(address(token));
        assertEq(valuation.tokenEWMA(address(token)), second);
        assertLt(second, first);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Borrow & repay
    // ─────────────────────────────────────────────────────────────────────────

    function test_Borrow_EscrowsFromRealBorrower() public {
        uint256 loanId = _borrow(20_000e6);

        VestingAdapter.EscrowRecord memory rec = adapter.getEscrow(manager.getLoan(loanId).escrowId);
        assertEq(rec.borrower, borrower, "escrow borrower");
        assertEq(rec.quantity, QTY, "quantity read from stream");
        assertEq(sablier.ownerOf(streamId), address(adapter));

        // 0.5% origination fee
        assertEq(usdc.balanceOf(borrower), 19_900e6);
        assertEq(usdc.balanceOf(treasury), 100e6);
        assertEq(pool.totalBorrowed(), 20_000e6);
    }

    function test_RevertWhen_BorrowAboveMax() public {
        vm.startPrank(borrower);
        sablier.approve(address(adapter), streamId);
        vm.expectRevert("exceeds max borrow");
        manager.borrow(address(sablier), streamId, VestingAdapter.Protocol.SABLIER_V2, 24_000e6, 0);
        vm.stopPrank();
    }

    function test_RevertWhen_CancelableStream() public {
        uint256 cancelableId = _createStream(borrower, QTY, true);
        vm.startPrank(borrower);
        sablier.approve(address(adapter), cancelableId);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.StreamCancelable.selector, cancelableId));
        manager.borrow(address(sablier), cancelableId, VestingAdapter.Protocol.SABLIER_V2, 1_000e6, 0);
        vm.stopPrank();
    }

    function test_RevertWhen_BorrowingAgainstSomeoneElsesStream() public {
        vm.prank(borrower);
        sablier.approve(address(adapter), streamId);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.NotOwner.selector, attacker, borrower));
        manager.borrow(address(sablier), streamId, VestingAdapter.Protocol.SABLIER_V2, 1_000e6, 0);
    }

    function test_RepayFull_ReturnsCollateralAndPaysLenders() public {
        uint256 loanId = _borrow(20_000e6);
        uint256 sharePriceBefore = pool.convertToAssets(1e12);

        _warpAndRefresh(180 days);
        uint256 debt = manager.debtOf(loanId);
        assertGt(debt, 20_000e6, "interest accrued");

        _repayFull(loanId);

        assertEq(sablier.ownerOf(streamId), borrower, "NFT returned");
        assertEq(uint256(manager.getLoan(loanId).status), uint256(LoanManager.Status.Repaid));
        assertEq(pool.totalBorrowed(), 0);
        assertGt(pool.convertToAssets(1e12), sharePriceBefore, "lenders earned interest");
        assertGt(usdc.balanceOf(address(insurance)), 0, "reserve factor funded insurance");

        // Lender can withdraw principal + interest
        uint256 maxOut = pool.maxWithdraw(lender);
        assertGt(maxOut, POOL_SIZE);
        vm.prank(lender);
        pool.withdraw(maxOut, lender, lender);
        assertEq(usdc.balanceOf(lender), maxOut);
    }

    function test_PartialRepay_PaysInterestFirst() public {
        uint256 loanId = _borrow(20_000e6);
        _warpAndRefresh(90 days);
        uint256 interest = manager.debtOf(loanId) - 20_000e6;

        usdc.mint(borrower, interest + 5_000e6);
        vm.startPrank(borrower);
        usdc.approve(address(manager), type(uint256).max);
        manager.repay(loanId, interest + 5_000e6);
        vm.stopPrank();

        assertEq(manager.getLoan(loanId).principal, 15_000e6);
        assertApproxEqAbs(manager.debtOf(loanId), 15_000e6, 10, "only principal left");
        assertApproxEqAbs(pool.totalBorrowed(), 15_000e6, 10);
    }

    function test_VestedTokensTravelWithTheNFT() public {
        uint256 loanId = _borrow(20_000e6);
        _warpAndRefresh(73 days); // ~20% vested

        // Anyone may push vested tokens to the recipient (the adapter) — they stay attributed to the escrow.
        vm.prank(attacker);
        sablier.withdrawMax(streamId, address(adapter));
        uint256 escrowId = manager.getLoan(loanId).escrowId;
        uint256 held = adapter.heldTokens(escrowId);
        assertApproxEqRel(held, QTY / 5, 0.01e18);

        _repayFull(loanId);
        assertEq(token.balanceOf(borrower), held, "vested tokens returned with NFT");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Liquidation
    // ─────────────────────────────────────────────────────────────────────────

    function test_Liquidation_PriceDrop_SurplusToBorrower() public {
        uint256 loanId = _borrow(20_000e6);
        assertFalse(manager.isLiquidatable(loanId));

        feed.setPrice(0.5e8);
        assertTrue(manager.isLiquidatable(loanId));

        vm.prank(keeper);
        manager.startLiquidation(loanId);
        uint256 price = manager.currentPrice(loanId);
        uint256 debt = manager.debtOf(loanId);
        assertEq(price, 60_000e6, "starts at 120% of spot value");

        usdc.mint(buyer, price);
        vm.startPrank(buyer);
        usdc.approve(address(manager), price);
        manager.bid(loanId, price);
        vm.stopPrank();

        assertEq(sablier.ownerOf(streamId), buyer, "buyer receives stream");
        assertEq(pool.totalBorrowed(), 0, "pool repaid");
        assertEq(manager.claimable(borrower), price - debt, "surplus owed to borrower");

        uint256 before = usdc.balanceOf(borrower);
        vm.prank(borrower);
        manager.claim();
        assertEq(usdc.balanceOf(borrower) - before, price - debt);
    }

    function test_Liquidation_Shortfall_InsuranceThenProRataWriteOff() public {
        _deposit(lender2, POOL_SIZE);
        uint256 loanId = _borrow(20_000e6);
        usdc.mint(address(insurance), 1_000e6);
        uint256 assetsBefore = pool.totalAssets();

        feed.setPrice(0.05e8); // collateral now worth $5,000
        manager.startLiquidation(loanId);
        // Marked down at once to the liquidation value (~$3,329): no exit at par during the auction.
        assertLt(pool.totalAssets(), assetsBefore - 16_000e6, "marked down at auction start");

        vm.warp(block.timestamp + 2.5 days);
        uint256 price = manager.currentPrice(loanId);
        // start 24,000 (120% of debt), floor 2,400, 5/6 of the way down
        assertEq(price, 6_000e6);

        usdc.mint(buyer, price);
        vm.startPrank(buyer);
        usdc.approve(address(manager), price);
        manager.bid(loanId, price);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(insurance)), 0, "insurance used first");
        assertEq(pool.totalBorrowed(), 0);
        assertEq(manager.totalLosses(), 13_000e6, "20,000 - 6,000 proceeds - 1,000 insurance");
        assertEq(pool.totalAssets(), assetsBefore - 13_000e6);

        // Both lenders bear the loss equally; neither can exit at par.
        assertEq(pool.maxWithdraw(lender), pool.maxWithdraw(lender2));
        assertLt(pool.maxWithdraw(lender), POOL_SIZE);
    }

    function test_Liquidation_AfterMaturityWithoutPriceMove() public {
        vm.startPrank(borrower);
        sablier.approve(address(adapter), streamId);
        uint256 loanId = manager.borrow(
            address(sablier), streamId, VestingAdapter.Protocol.SABLIER_V2, 10_000e6, block.timestamp + 30 days
        );
        vm.stopPrank();

        _warpAndRefresh(30 days + 3 days);
        assertFalse(manager.isLiquidatable(loanId), "inside grace period");
        _warpAndRefresh(1 hours);
        assertTrue(manager.isLiquidatable(loanId));
    }

    function test_Liquidation_NotBlockedByFreezeOmegaOrStaleOracle() public {
        uint256 loanId = _borrow(20_000e6);
        feed.setPrice(0.5e8);

        vm.startPrank(guardian);
        valuation.freezeToken(address(token), 7 days);
        valuation.updateOmega(address(token), 0);
        vm.stopPrank();
        assertTrue(manager.isLiquidatable(loanId), "risk controls never block liquidation");

        // A stale oracle disables health checks but never bricks the maturity path.
        vm.warp(block.timestamp + 400 days);
        assertTrue(manager.isLiquidatable(loanId));
    }

    function test_RepayDuringAuction_CancelsIt() public {
        uint256 loanId = _borrow(20_000e6);
        feed.setPrice(0.5e8);
        manager.startLiquidation(loanId);

        _repayFull(loanId);
        assertEq(sablier.ownerOf(streamId), borrower);
        assertEq(manager.currentPrice(loanId), 0);

        vm.expectRevert("no auction");
        manager.bid(loanId, type(uint256).max);
    }

    function test_RevertWhen_LiquidatingHealthyLoan() public {
        uint256 loanId = _borrow(20_000e6);
        vm.expectRevert("not liquidatable");
        manager.startLiquidation(loanId);
    }

    function test_RevertWhen_BidAboveMaxPrice() public {
        uint256 loanId = _borrow(20_000e6);
        feed.setPrice(0.5e8);
        manager.startLiquidation(loanId);
        vm.expectRevert("price above max");
        manager.bid(loanId, 1e6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lending pool
    // ─────────────────────────────────────────────────────────────────────────

    function test_Pool_DirectTransferDoesNotMoveSharePrice() public {
        uint256 before = pool.convertToAssets(1e12);
        usdc.mint(address(pool), 500_000e6);
        assertEq(pool.convertToAssets(1e12), before);
    }

    function test_Pool_WithdrawLimitedToIdleLiquidity() public {
        _borrow(20_000e6);
        assertEq(pool.maxWithdraw(lender), POOL_SIZE - 20_000e6);
        vm.prank(lender);
        vm.expectRevert();
        pool.withdraw(POOL_SIZE, lender, lender);
    }

    function test_Pool_PauseNeverBlocksWithdrawals() public {
        bytes32 role = pool.GUARDIAN_ROLE();
        vm.prank(governor);
        pool.grantRole(role, guardian);
        vm.prank(guardian);
        pool.pause();
        vm.prank(lender);
        pool.withdraw(1_000e6, lender, lender);
        assertEq(usdc.balanceOf(lender), 1_000e6);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Access control
    // ─────────────────────────────────────────────────────────────────────────

    function test_RevertWhen_NonManagerMovesFunds() public {
        vm.startPrank(attacker);
        vm.expectRevert("only loan manager");
        pool.lend(attacker, 1);
        vm.expectRevert("only loan manager");
        pool.repay(1);
        vm.expectRevert("only loan manager");
        insurance.cover(1);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.OnlyLoanManager.selector, attacker));
        adapter.release(1, attacker);
        vm.stopPrank();
    }

    function test_RevertWhen_GovernorRewiresLoanManager() public {
        vm.startPrank(governor);
        vm.expectRevert("already set");
        pool.setLoanManager(governor);
        vm.expectRevert("already set");
        insurance.setLoanManager(governor);
        vm.expectRevert(VestingAdapter.LoanManagerAlreadySet.selector);
        adapter.setLoanManager(governor);
        vm.stopPrank();
    }

    function test_GuardianCannotRaiseRank() public {
        bytes32 role = registry.GUARDIAN_ROLE();
        vm.prank(governor);
        registry.grantRole(role, guardian);
        vm.startPrank(guardian);
        vm.expectRevert("unauthorized");
        registry.vetContract(address(sablier), 1);
        registry.vetContract(address(sablier), 0); // revoke is allowed
        vm.stopPrank();
        assertEq(registry.getRank(address(sablier)), 0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Regressions from the adversarial review
    // ─────────────────────────────────────────────────────────────────────────

    /// H1: a flash deposit around `borrow` cannot lower the rate the loan pays.
    function test_FlashDepositCannotLowerRate() public {
        vm.prank(lender);
        pool.withdraw(970_000e6, lender, lender); // pool: 30,000

        address whale = makeAddr("whale");
        usdc.mint(whale, 10_000_000e6);
        vm.startPrank(whale);
        usdc.approve(address(pool), type(uint256).max);
        pool.deposit(10_000_000e6, whale);
        vm.stopPrank();

        uint256 loanId = _borrow(20_000e6);

        vm.startPrank(whale);
        pool.withdraw(pool.maxWithdraw(whale), whale, whale);
        vm.stopPrank();

        // Utilization is now ~66% → APR ≈ 5% + 0.66/0.8·10% ≈ 13.3%, not the 5.0% seen during the flash.
        assertGt(manager.currentRateBps(), 1_300);
        vm.warp(block.timestamp + 365 days);
        assertGt(manager.debtOf(loanId), 22_600e6, "pays the real utilization rate");
    }

    /// H2: depositing right before a large repayment captures (almost) none of the interest.
    function test_JITDepositCapturesNoInterest() public {
        uint256 loanId = _borrow(20_000e6);
        vm.warp(block.timestamp + 365 days);

        _deposit(lender2, POOL_SIZE);
        _repayFull(loanId);

        uint256 shares = pool.balanceOf(lender2);
        vm.prank(lender2);
        uint256 out = pool.redeem(shares, lender2, lender2);
        assertLe(out, POOL_SIZE + 1, "no interest captured");
        assertGe(out, POOL_SIZE - 1);
    }

    /// H1/H2: accrued interest reaches lenders continuously, before it is paid.
    function test_InterestAccruesIntoSharePrice() public {
        _borrow(20_000e6);
        uint256 before = pool.totalAssets();
        vm.warp(block.timestamp + 180 days);
        assertGt(pool.totalAssets(), before, "share price rises before repayment");
    }

    /// H3: a lender exiting during an auction does not get par.
    function test_ExitDuringAuctionBearsExpectedLoss() public {
        _deposit(lender2, POOL_SIZE);
        uint256 loanId = _borrow(20_000e6);
        feed.setPrice(0.05e8);
        manager.startLiquidation(loanId);

        uint256 maxOut = pool.maxWithdraw(lender);
        assertLt(maxOut, POOL_SIZE - 8_000e6, "half of the ~16.7k mark-down");
    }

    /// M2: an auction never hands the position out for free; rounds restart from the floor.
    function test_AuctionFloorAndRestart() public {
        uint256 loanId = _borrow(20_000e6);
        feed.setPrice(0.05e8);
        manager.startLiquidation(loanId);

        vm.warp(block.timestamp + 3 days + 1);
        assertEq(manager.currentPrice(loanId), 2_400e6, "floor = 10% of start");

        manager.restartAuction(loanId);
        assertEq(manager.currentPrice(loanId), 2_400e6);

        vm.warp(block.timestamp + 1 days);
        vm.expectRevert("round not over");
        manager.restartAuction(loanId);

        vm.warp(block.timestamp + 2 days);
        assertEq(manager.currentPrice(loanId), 240e6, "second round ends at 10% of its start");
    }

    /// M2: changing auction params does not affect a running round.
    function test_AuctionParamChangeDoesNotAffectRunningRound() public {
        uint256 loanId = _borrow(20_000e6);
        feed.setPrice(0.5e8);
        manager.startLiquidation(loanId);
        uint256 p0 = manager.currentPrice(loanId);

        vm.prank(governor);
        manager.setAuctionParams(1 hours, 12_000, 1000);
        vm.warp(block.timestamp + 2 hours);
        assertGt(manager.currentPrice(loanId), (p0 * 9) / 10, "still on the 3-day schedule");
    }

    /// M3: revoking a vesting contract's rank does not make existing loans liquidatable.
    function test_RegistryRevokeDoesNotLiquidateExistingLoans() public {
        uint256 loanId = _borrow(23_000e6);
        uint256 hfBefore = manager.healthFactorBps(loanId);
        vm.prank(governor);
        registry.vetContract(address(sablier), 0);
        assertEq(manager.healthFactorBps(loanId), hfBefore);
        assertFalse(manager.isLiquidatable(loanId));
    }

    /// M4: a caller-biased EWMA lowers new borrowing power but never health checks.
    function test_EWMANotUsedForLiquidationValue() public {
        uint256 unlock = block.timestamp + 365 days;
        uint256 v0 = valuation.liquidationValue(QTY, address(token), unlock, 2);

        valuation.updateEWMA(address(token));
        vm.warp(block.timestamp + 1 minutes);
        feed.setPrice(0.5e8);
        valuation.updateEWMA(address(token)); // EWMA → 0.9
        vm.warp(block.timestamp + 1 minutes);
        feed.setPrice(1e8);
        vm.warp(block.timestamp + 2 hours);
        feed.setPrice(1e8);

        (uint256 pv, ) = valuation.computeDPV(QTY, address(token), unlock, address(sablier));
        uint256 v1 = valuation.liquidationValue(QTY, address(token), unlock, 2);
        assertApproxEqRel(v1, v0, 0.001e18, "health value ignores the EWMA");
        assertLt(pv, (v1 * 95) / 100, "origination is more conservative");
    }

    /// H4: pre-TGE collateral needs a per-loan cap, and the signer cannot jump the price.
    function test_PreTGE_CapRequiredAndSignerBounded() public {
        MockProjectToken preTge = new MockProjectToken("Pre", "PRE", 18, 1_000_000e18, address(this));
        address signer = makeAddr("signer");
        PreTGEOracle oracle = new PreTGEOracle(address(this), signer);
        oracle.setSyntheticPrice(address(preTge), 1e8, 8);
        vm.prank(governor);
        valuation.setPreTGEOracle(address(oracle));

        vm.expectRevert("pre-TGE cap required");
        valuation.computeDPV(100_000e18, address(preTge), block.timestamp + 365 days, address(sablier));

        vm.prank(governor);
        valuation.setTokenMaxBorrowUsd(address(preTge), 5_000e6);
        (uint256 pv, ) = valuation.computeDPV(100_000e18, address(preTge), block.timestamp + 365 days, address(sablier));
        assertLe(pv, 5_000e6);

        vm.warp(block.timestamp + 2 hours);
        vm.startPrank(signer);
        vm.expectRevert("change too large");
        oracle.updateSyntheticPrice(address(preTge), 1e30);
        oracle.updateSyntheticPrice(address(preTge), 1.2e8);
        vm.expectRevert("too soon");
        oracle.updateSyntheticPrice(address(preTge), 1.3e8);
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fuzz
    // ─────────────────────────────────────────────────────────────────────────

    function testFuzz_InterestMonotonicAndRepayCloses(uint256 amount, uint32 elapsed) public {
        amount = bound(amount, 10e6, 23_000e6);
        uint256 dt = bound(uint256(elapsed), 1, 360 days);
        uint256 loanId = _borrow(amount);

        uint256 d0 = manager.debtOf(loanId);
        vm.warp(block.timestamp + dt);
        uint256 d1 = manager.debtOf(loanId);
        assertGe(d1, d0);

        _repayFull(loanId);
        assertEq(manager.debtOf(loanId), 0);
        assertEq(pool.totalBorrowed(), 0);
        assertGe(pool.totalAssets(), POOL_SIZE, "lenders never lose on a repaid loan");
    }
}
