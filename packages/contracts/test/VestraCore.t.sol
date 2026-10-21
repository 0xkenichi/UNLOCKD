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
        PreTGEOracle oracle = new PreTGEOracle(address(this));
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
        assertEq(manager.getLoan(loanId).interestOwed, 0);
        assertEq(pool.totalBorrowed(), 15_000e6);
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
        vm.warp(block.timestamp + 2.5 days);
        uint256 price = manager.currentPrice(loanId);
        assertEq(price, 4_000e6);

        usdc.mint(buyer, price);
        vm.startPrank(buyer);
        usdc.approve(address(manager), price);
        manager.bid(loanId, price);
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(insurance)), 0, "insurance used first");
        assertEq(pool.totalBorrowed(), 0);
        assertEq(pool.totalWrittenOff(), 15_000e6, "20,000 - 4,000 proceeds - 1,000 insurance");
        assertEq(pool.totalAssets(), assetsBefore - 15_000e6);

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
        pool.writeOff(0);
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
