// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../src/LendingPool.sol";
import "../src/VestingAdapter.sol";
import "../src/InsuranceVault.sol";
import "../src/v2/CreditEngineV2.sol";
import "../src/v2/RiskOracle.sol";
import "../src/v2/BackstopVault.sol";
import "../src/v2/LoanManagerV2.sol";
import "../src/mocks/MockUSDC.sol";
import "../src/mocks/MockProjectToken.sol";
import "../src/mocks/MockPriceFeed.sol";
import "../src/mocks/MockSablierV2Lockup.sol";

/// The credit formula on its own: reference vectors from packages/risk/src/onchainV2.js, and the
/// theorems of docs/RISK_PROOFS.md as fuzz properties.
contract CreditEngineV2Test is Test {
    CreditEngineV2 engine;
    uint256 constant T0 = 1_800_000_000;
    uint256 constant D = 1 days;
    uint256 constant Y = 365 days;

    function setUp() public {
        engine = new CreditEngineV2();
    }

    function _sch(uint256 cliffDays, uint256 endDays, uint256 consumed) internal pure returns (CreditEngineV2.Schedule memory) {
        return CreditEngineV2.Schedule(uint64(T0), uint64(T0 + cliffDays * D), uint64(T0 + endDays * D), 100_000e18, consumed);
    }

    function _mk(uint256 advUsd, uint32 dragBps) internal pure returns (CreditEngineV2.Market memory) {
        return CreditEngineV2.Market({price: 1e6, decimals: 18, sigmaBps: 8000, advUsd: advUsd, dragBps: dragBps});
    }

    function _close(uint256 got, uint256 want) internal pure {
        assertApproxEqRel(got, want, 1e14, "vs onchainV2.js"); // within 0.01%
    }

    function test_Vectors_MatchTheJsReference() public view {
        CreditEngineV2.Market memory mk = _mk(5_000_000e6, 10_000);
        CreditEngineV2.Tier S = CreditEngineV2.Tier.Standard;
        CreditEngineV2.Tier O = CreditEngineV2.Tier.OptIn;
        _close(engine.creditValue(_sch(0, 365, 0), T0, mk, engine.liquidationCurve(S)), 44_565_128_451);
        _close(engine.creditValue(_sch(365, 365, 0), T0, mk, engine.originationCurve(O)), 17_421_930_689);
        _close(engine.creditValue(_sch(182, 730, 5000e18), T0 + 200 * D, mk, engine.liquidationCurve(O)), 56_763_973_240);
        _close(engine.maxBorrow(_sch(0, 365, 0), T0, T0 + Y, 1500, mk, S, 10_000), 30_994_285_441);
        _close(engine.maxBorrow(_sch(365, 365, 0), T0, T0 + Y, 1700, mk, O, 10_000), 17_378_375_862);
        _close(engine.maxBorrow(_sch(182, 730, 0), T0, T0 + Y, 1500, _mk(200_000e6, 8000), S, 10_000), 12_337_572_291);
    }

    function _fuzzCase(uint256 seed)
        internal
        pure
        returns (CreditEngineV2.Schedule memory s, CreditEngineV2.Market memory m, CreditEngineV2.Tier tier, uint256 tm, uint256 rate)
    {
        uint256 endDays = bound(uint256(keccak256(abi.encode(seed, 1))), 30, 1460);
        uint256 shape = seed % 3;
        uint256 cliffDays = shape == 0 ? 0 : shape == 1 ? endDays : bound(uint256(keccak256(abi.encode(seed, 2))), 7, endDays - 7);
        s = _sch(cliffDays, endDays, 0);
        m = CreditEngineV2.Market({
            price: bound(uint256(keccak256(abi.encode(seed, 3))), 1, 1e12),
            decimals: 18,
            sigmaBps: uint32(bound(uint256(keccak256(abi.encode(seed, 4))), 1000, 30_000)),
            advUsd: bound(uint256(keccak256(abi.encode(seed, 5))), 1e9, 1e16),
            dragBps: uint32(bound(uint256(keccak256(abi.encode(seed, 6))), 500, 10_000))
        });
        tier = seed % 2 == 0 ? CreditEngineV2.Tier.Standard : CreditEngineV2.Tier.OptIn;
        tm = T0 + bound(uint256(keccak256(abi.encode(seed, 7))), 1, endDays) * D;
        rate = bound(uint256(keccak256(abi.encode(seed, 8))), 0, 10_000);
    }

    /// T1: never worth more than the spot value of what remains.
    function testFuzz_T1_NeverAboveSpot(uint256 seed, uint256 dayFrac) public view {
        (CreditEngineV2.Schedule memory s, CreditEngineV2.Market memory m, CreditEngineV2.Tier tier, , ) = _fuzzCase(seed);
        uint256 t = T0 + bound(dayFrac, 0, s.end - T0 + 30 days);
        uint256 spot = (s.total * m.price) / 1e18;
        assertLe(engine.creditValue(s, t, m, engine.liquidationCurve(tier)), spot);
        assertLe(engine.creditValue(s, t, m, engine.fairCurve(tier)), spot);
    }

    /// T3: the origination curve never values more than the liquidation curve.
    function testFuzz_T3_OriginationStricter(uint256 seed, uint256 dayFrac) public view {
        (CreditEngineV2.Schedule memory s, CreditEngineV2.Market memory m, CreditEngineV2.Tier tier, , ) = _fuzzCase(seed);
        uint256 t = T0 + bound(dayFrac, 0, s.end - T0);
        assertLe(engine.creditValue(s, t, m, engine.originationCurve(tier)), engine.creditValue(s, t, m, engine.liquidationCurve(tier)));
        assertLe(engine.creditValue(s, t, m, engine.liquidationCurve(tier)), engine.creditValue(s, t, m, engine.fairCurve(tier)));
    }

    /// T7: a loan at the maximum is not liquidatable on any checked day if the price does not move.
    /// (Daily checks of the same formula run in packages/risk/test/onchainV2.test.js.)
    function testFuzz_T7_MaxLoanNeverLiquidatableAtFlatPrice(uint256 seed) public view {
        (CreditEngineV2.Schedule memory s, CreditEngineV2.Market memory m, CreditEngineV2.Tier tier, uint256 tm, uint256 rate) = _fuzzCase(seed);
        uint256 b = engine.maxBorrow(s, T0, tm, rate, m, tier, 10_000);
        CreditEngineV2.Curve memory liq = engine.liquidationCurve(tier);
        uint256 step = (tm - T0) / 12 + 1;
        for (uint256 t = T0; t <= tm; t += step) {
            uint256 debt = b + (b * rate * (t - T0)) / (Y * 10_000);
            assertLe(debt, engine.creditValue(s, t, m, liq), "liquidatable at a flat price");
        }
        assertLe(b + (b * rate * (tm - T0)) / (Y * 10_000), engine.creditValue(s, tm, m, liq), "at maturity");
    }

    /// T6: more tokens or a higher price never lend more than proportionally.
    function testFuzz_T6_SizeIsPenalised(uint256 seed, uint8 lam) public view {
        (CreditEngineV2.Schedule memory s, CreditEngineV2.Market memory m, CreditEngineV2.Tier tier, , ) = _fuzzCase(seed);
        uint256 l = bound(lam, 2, 50);
        CreditEngineV2.Curve memory liq = engine.liquidationCurve(tier);
        uint256 base = engine.creditValue(s, T0, m, liq);
        s.total *= l;
        assertLe(engine.creditValue(s, T0, m, liq), base * l + l);
    }

    function test_Omega_ScalesTheLimit() public view {
        CreditEngineV2.Market memory mk = _mk(5_000_000e6, 10_000);
        uint256 full = engine.maxBorrow(_sch(0, 365, 0), T0, T0 + Y, 1500, mk, CreditEngineV2.Tier.Standard, 10_000);
        uint256 half = engine.maxBorrow(_sch(0, 365, 0), T0, T0 + Y, 1500, mk, CreditEngineV2.Tier.Standard, 5000);
        assertApproxEqAbs(half * 2, full, 2);
        assertEq(engine.maxBorrow(_sch(0, 365, 0), T0, T0 + Y, 1500, mk, CreditEngineV2.Tier.Standard, 0), 0);
    }
}

/// The loan lifecycle end to end.
contract LoanManagerV2Test is Test {
    MockUSDC usdc;
    MockProjectToken token;
    MockPriceFeed feed;
    MockSablierV2Lockup sablier;
    VestingAdapter adapter;
    LendingPool pool;
    InsuranceVault insurance;
    CreditEngineV2 engine;
    RiskOracle oracle;
    BackstopVault backstop;
    LoanManagerV2 manager;

    address governor = makeAddr("governor");
    address guardian = makeAddr("guardian");
    address poster = makeAddr("poster");
    address treasury = makeAddr("treasury");
    address lender = makeAddr("lender");
    address borrower = makeAddr("borrower");
    address partner = makeAddr("partner");
    address buyer = makeAddr("buyer");
    address keeper = makeAddr("keeper");

    uint256 constant QTY = 100_000e18;
    uint256 constant POOL_SIZE = 10_000_000e6;

    CreditEngineV2.Tier constant STD = CreditEngineV2.Tier.Standard;
    CreditEngineV2.Tier constant OPT = CreditEngineV2.Tier.OptIn;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        token = new MockProjectToken("Project", "PRJ", 18, 10_000_000e18, address(this));
        feed = new MockPriceFeed();
        sablier = new MockSablierV2Lockup();
        adapter = new VestingAdapter(governor);
        pool = new LendingPool(IERC20(address(usdc)), governor);
        insurance = new InsuranceVault(IERC20(address(usdc)), governor);
        engine = new CreditEngineV2();
        oracle = new RiskOracle(governor);
        backstop = new BackstopVault(IERC20(address(usdc)), governor);
        manager = new LoanManagerV2(
            IERC20(address(usdc)), ILendingPoolV2(address(pool)), adapter, engine, oracle, backstop,
            IInsuranceVaultV2(address(insurance)), treasury, governor
        );

        vm.startPrank(governor);
        adapter.setWhitelisted(VestingAdapter.Protocol.SABLIER_V2, address(sablier), true);
        adapter.setLoanManager(address(manager));
        pool.setLoanManager(address(manager));
        insurance.setLoanManager(address(manager));
        backstop.setLoanManager(address(manager));
        oracle.grantRole(oracle.RISK_POSTER_ROLE(), poster);
        oracle.grantRole(keccak256("GUARDIAN_ROLE"), guardian);
        oracle.listToken(address(token), address(feed), 18, 3000, 10_000);
        manager.grantRole(manager.PAYDOWN_BUYER_ROLE(), buyer);
        vm.stopPrank();

        _setPrice(1e8);
        vm.prank(poster);
        oracle.postRisk(address(token), 8000, 5_000_000e6, 10_000);

        usdc.mint(lender, POOL_SIZE);
        vm.startPrank(lender);
        usdc.approve(address(pool), POOL_SIZE);
        pool.deposit(POOL_SIZE, lender);
        vm.stopPrank();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /// Set the price and let the TWAP settle on it.
    function _setPrice(int256 p) internal {
        feed.setPrice(p);
        vm.warp(block.timestamp + 1 hours + 1);
        feed.setPrice(p);
    }

    function _warp(uint256 secs) internal {
        vm.warp(block.timestamp + secs);
        this.refreshPrice();
    }

    /// Refresh the price after a warp (external so the loop below can report the week it fails in).
    function refreshPrice() external {
        (, int256 p, , , ) = feed.latestRoundData();
        feed.setPrice(p);
        vm.warp(block.timestamp + 1 hours + 1);
        feed.setPrice(p);
    }

    function _stream(uint256 cliffDays, uint256 endDays) internal returns (uint256 id) {
        token.approve(address(sablier), QTY);
        id = sablier.createStreamWithCliff(
            borrower, address(token), uint128(QTY), uint40(block.timestamp), uint40(block.timestamp + cliffDays * 1 days),
            uint40(block.timestamp + endDays * 1 days), false
        );
    }

    function _maxFor(uint256 id, uint256 maturity, CreditEngineV2.Tier tier) internal view returns (uint256 maxB) {
        (maxB, ) = manager.quoteMaxBorrow(VestingAdapter.Protocol.SABLIER_V2, address(sablier), id, 1_000e6, maturity, tier);
    }

    function _borrow(uint256 id, uint256 amount, uint256 maturity, CreditEngineV2.Tier tier) internal returns (uint256 loanId) {
        vm.startPrank(borrower);
        sablier.approve(address(adapter), id);
        loanId = manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, amount, maturity, tier, 10_000));
        vm.stopPrank();
    }

    function _fundBackstop(uint256 amount) internal {
        vm.prank(governor);
        backstop.setPartner(address(token), partner);
        usdc.mint(partner, amount);
        vm.startPrank(partner);
        usdc.approve(address(backstop), amount);
        backstop.deposit(address(token), amount);
        vm.stopPrank();
    }

    function _pay(address who, uint256 loanId, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(manager), amount);
        manager.repay(loanId, amount);
        vm.stopPrank();
    }

    // ── Origination ──────────────────────────────────────────────────────────

    function test_Borrow_UpToTheLimitAndNotAbove() public {
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 300 days;
        uint256 maxB = _maxFor(id, maturity, STD);
        assertGt(maxB, 15_000e6, "a linear $100k stream lends something useful");
        assertLt(maxB, 40_000e6, "and not too much");

        vm.startPrank(borrower);
        sablier.approve(address(adapter), id);
        vm.expectRevert("exceeds max borrow");
        manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, maxB + 1e6, maturity, STD, 10_000));
        vm.stopPrank();

        uint256 loanId = _borrow(id, maxB, maturity, STD);
        assertEq(usdc.balanceOf(borrower), maxB - (maxB * 50) / 10_000, "net of the 0.5% fee");
        assertEq(sablier.ownerOf(id), address(adapter), "stream escrowed");
        assertEq(uint256(manager.getLoan(loanId).status), uint256(LoanManagerV2.Status.Active));
    }

    function test_Borrow_OptInLendsMoreButNeedsTheBackstop() public {
        uint256 id = _stream(365, 365); // a 12-month cliff
        uint256 maturity = block.timestamp + 360 days;
        uint256 std = _maxFor(id, maturity, STD);
        uint256 opt = _maxFor(id, maturity, OPT);
        assertGt(opt, std, "opt-in lends more on a cliff");

        vm.prank(governor);
        backstop.setPartner(address(token), partner);
        vm.startPrank(borrower);
        sablier.approve(address(adapter), id);
        vm.expectRevert("insufficient backstop");
        manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, opt, maturity, OPT, 10_000));
        vm.stopPrank();

        _fundBackstop(1_000_000e6);
        uint256 loanId = _borrow(id, opt, maturity, OPT);
        assertEq(backstop.lockedFor(loanId), (opt * 1600 + 9999) / 10_000, "16% of principal locked");
    }

    function test_Borrow_RespectsRateLimitExposureCapAndPause() public {
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 300 days;
        vm.startPrank(borrower);
        sablier.approve(address(adapter), id);
        vm.expectRevert("rate above limit");
        manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, 1_000e6, maturity, STD, 1));
        vm.stopPrank();

        vm.prank(governor);
        manager.setLimits(1, 3 * 365 days, 10e6); // 0.01% of the pool per token = $1,000
        vm.startPrank(borrower);
        vm.expectRevert("token exposure cap");
        manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, 2_000e6, maturity, STD, 10_000));
        vm.stopPrank();

        vm.prank(governor);
        manager.setLimits(1000, 3 * 365 days, 10e6);
        vm.prank(governor);
        manager.grantRole(keccak256("GUARDIAN_ROLE"), guardian);
        vm.prank(guardian);
        manager.pause();
        vm.startPrank(borrower);
        vm.expectRevert();
        manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, 1_000e6, maturity, STD, 10_000));
        vm.stopPrank();
    }

    function test_Borrow_RefusesStaleRiskInputsAndZeroOmega() public {
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 300 days;
        _warp(3 days); // risk inputs older than maxRiskAge
        vm.startPrank(borrower);
        sablier.approve(address(adapter), id);
        vm.expectRevert("stale risk inputs");
        manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, 1_000e6, maturity, STD, 10_000));
        vm.stopPrank();

        vm.prank(poster);
        oracle.postRisk(address(token), 8000, 5_000_000e6, 10_000);
        vm.prank(guardian);
        oracle.setOmega(address(token), 0);
        vm.startPrank(borrower);
        vm.expectRevert("no credit for token");
        manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, 1_000e6, maturity, STD, 10_000));
        vm.stopPrank();
    }

    // ── Interest and lender accounting ───────────────────────────────────────

    function test_Interest_SimpleFixedAndReachesLenders() public {
        uint256 id = _stream(0, 365);
        uint256 principal = 20_000e6;
        uint256 loanId = _borrow(id, principal, block.timestamp + 300 days, STD);
        uint256 rate = manager.getLoan(loanId).rateBps;
        uint256 assetsBefore = pool.totalAssets();

        uint256 start = manager.getLoan(loanId).openedAt;
        _warp(100 days);
        uint256 elapsed = block.timestamp - start;
        uint256 interest = (principal * rate * elapsed) / (365 days * 10_000);
        assertEq(manager.debtOf(loanId), principal + interest, "simple interest at the fixed rate");
        assertApproxEqAbs(pool.totalAssets() - assetsBefore, (interest * 9000) / 10_000, 2, "90% of interest accrues to lenders");

        // A deposit that moves utilisation does not change an open loan's rate.
        usdc.mint(lender, 5_000_000e6);
        vm.startPrank(lender);
        usdc.approve(address(pool), 5_000_000e6);
        pool.deposit(5_000_000e6, lender);
        vm.stopPrank();
        assertEq(manager.getLoan(loanId).rateBps, rate);

        uint256 insuranceBefore = usdc.balanceOf(address(insurance));
        _pay(borrower, loanId, manager.debtOf(loanId));
        assertEq(sablier.ownerOf(id), borrower, "stream back to the borrower");
        assertEq(uint256(manager.getLoan(loanId).status), uint256(LoanManagerV2.Status.Repaid));
        assertApproxEqAbs(usdc.balanceOf(address(insurance)) - insuranceBefore, interest / 10, 2, "10% of interest to insurance");
        assertEq(manager.lenderClaim(), 0, "book empty");
    }

    function test_Repay_InterestFirstThenPrincipal() public {
        uint256 id = _stream(0, 365);
        uint256 loanId = _borrow(id, 20_000e6, block.timestamp + 300 days, STD);
        _warp(60 days);
        uint256 interest = manager.debtOf(loanId) - 20_000e6;
        _pay(borrower, loanId, interest / 2);
        assertEq(manager.getLoan(loanId).principal, 20_000e6, "principal untouched");
        _pay(borrower, loanId, interest - interest / 2 + 5_000e6);
        assertEq(manager.getLoan(loanId).principal, 15_000e6, "then principal");
    }

    // ── Health: only the price can liquidate ─────────────────────────────────

    function test_Health_AMaxLoanSurvivesEveryWeekAtAFlatPrice() public {
        uint256 id = _stream(182, 730);
        uint256 maturity = block.timestamp + 365 days;
        uint256 loanId = _borrow(id, _maxFor(id, maturity, STD), maturity, STD);
        for (uint256 w = 0; w < 52; w++) {
            vm.warp(block.timestamp + 7 days - 1 hours - 1);
            try this.refreshPrice() {} catch { revert(string(abi.encodePacked("refresh panicked at week ", vm.toString(w)))); }
            uint256 debt; uint256 cv;
            try manager.health(loanId) returns (uint256 a, uint256 b) { debt = a; cv = b; } catch { revert(string(abi.encodePacked("health panicked at week ", vm.toString(w)))); }
            assertLe(debt, cv, "liquidatable with no price move");
            try manager.isLiquidatable(loanId) returns (bool l) { assertFalse(l); } catch { revert(string(abi.encodePacked("isLiq panicked at week ", vm.toString(w)))); }
        }
    }

    function test_Health_RiskSignalsNeverLiquidateAnOpenLoan() public {
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 300 days;
        uint256 loanId = _borrow(id, _maxFor(id, maturity, STD), maturity, STD);
        (, uint256 cvBefore) = manager.health(loanId);

        vm.prank(poster);
        oracle.postRisk(address(token), 50_000, 1e6, 500); // σ 500%, $1 volume, 95% drag
        vm.prank(guardian);
        oracle.setOmega(address(token), 0);
        (, uint256 cvAfter) = manager.health(loanId);
        assertEq(cvAfter, cvBefore, "health uses inputs frozen at origination");
        vm.expectRevert("healthy");
        manager.flagBreach(loanId);
    }

    function test_Health_StalePriceOnlyMaturityCanLiquidate() public {
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 100 days;
        uint256 loanId = _borrow(id, 20_000e6, maturity, STD);
        feed.setStalePrice(1e6, block.timestamp - 2 days); // a crash, but stale
        vm.expectRevert("stale price");
        manager.flagBreach(loanId);
        assertFalse(manager.isLiquidatable(loanId));
        vm.warp(maturity + 3 days + 1);
        assertTrue(manager.isLiquidatable(loanId), "maturity + grace still liquidates");
    }

    // ── The ladder ───────────────────────────────────────────────────────────

    function test_Ladder_CureWindowThenTheBorrowerRepairsTheLoan() public {
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 300 days;
        uint256 loanId = _borrow(id, _maxFor(id, maturity, STD), maturity, STD);
        _setPrice(0.5e8);
        manager.flagBreach(loanId);
        assertFalse(manager.isLiquidatable(loanId), "not during the cure window");

        (uint256 debt, uint256 cv) = manager.health(loanId);
        _pay(borrower, loanId, debt - (cv * 9) / 10);
        assertEq(manager.getLoan(loanId).breachAt, 0, "repaying clears the breach");
        vm.warp(block.timestamp + 3 days);
        assertFalse(manager.isLiquidatable(loanId));
    }

    function test_Ladder_PaydownFromVestedTokensWithinTheDailyCap() public {
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 360 days;
        uint256 loanId = _borrow(id, _maxFor(id, maturity, STD), maturity, STD);
        _warp(120 days); // a third has vested into the stream
        _setPrice(0.3e8);
        manager.flagBreach(loanId);
        vm.prank(governor);
        manager.setLadder(3 days, 2 days, 5 days, 10, 300, 500); // cap: 0.1% of $5M = $5,000 a day

        vm.startPrank(buyer);
        usdc.mint(buyer, 1_000_000e6);
        usdc.approve(address(manager), type(uint256).max);
        vm.expectRevert("outside paydown window");
        manager.paydown(loanId, 1_000e18, type(uint256).max);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);
        feed.setPrice(0.3e8);
        // The buyer pays $0.30 × 97% = $0.291 a token.
        uint256 debtBefore = manager.debtOf(loanId);
        vm.startPrank(buyer);
        vm.expectRevert("daily cap");
        manager.paydown(loanId, 20_000e18, type(uint256).max); // $5,820 > $5,000
        manager.paydown(loanId, 10_000e18, type(uint256).max); // $2,910
        vm.expectRevert("daily cap");
        manager.paydown(loanId, 10_000e18, type(uint256).max); // would make $5,820 today
        vm.stopPrank();
        assertEq(token.balanceOf(buyer), 10_000e18, "buyer receives vested tokens, not the stream");
        assertApproxEqAbs(debtBefore - manager.debtOf(loanId), 2_910e6, 1e6, "proceeds pay the loan down");
        assertEq(sablier.ownerOf(id), address(adapter), "the stream stays in escrow");
    }

    function test_Ladder_PartnerBuysBackAtMaturityAndTheBorrowerGetsTheSurplus() public {
        _fundBackstop(100_000e6);
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 200 days;
        uint256 loanId = _borrow(id, 10_000e6, maturity, STD);
        vm.warp(maturity + 3 days + 1);
        _setPrice(1e8);
        manager.startLiquidation(loanId);
        (, , uint256 debt, , , uint256 partnerPrice, , ) = manager.auctions(loanId);
        assertGe(partnerPrice, debt);

        vm.expectRevert("partner's right of first refusal");
        vm.prank(buyer);
        manager.bid(loanId, type(uint256).max);

        usdc.mint(partner, partnerPrice);
        vm.startPrank(partner);
        usdc.approve(address(manager), partnerPrice);
        manager.bid(loanId, partnerPrice);
        vm.stopPrank();
        assertEq(sablier.ownerOf(id), partner, "tokens go back to the project, not the market");
        assertEq(manager.claimable(borrower), partnerPrice - debt, "walking away is never a confiscation");
        assertEq(manager.totalLosses(), 0);
    }

    function test_Ladder_ShortfallPaysBackstopThenInsuranceThenLenders() public {
        _fundBackstop(10_000e6);
        uint256 id = _stream(365, 365);
        uint256 maturity = block.timestamp + 360 days;
        uint256 principal = _maxFor(id, maturity, OPT);
        uint256 loanId = _borrow(id, principal, maturity, OPT);
        uint256 locked = backstop.lockedFor(loanId);
        usdc.mint(address(insurance), 1_000e6);

        _setPrice(0.02e8); // a 98% overnight crash
        manager.flagBreach(loanId);
        vm.warp(block.timestamp + 2 days + 1);
        feed.setPrice(0.02e8);
        assertTrue(manager.isLiquidatable(loanId), "nothing vested to pay down with on a cliff");
        manager.startLiquidation(loanId);

        vm.warp(block.timestamp + 72 hours + 3 days + 1); // past the partner's window and the round
        uint256 price = manager.currentPrice(loanId);
        (, , , uint256 claimValue, , , , ) = manager.auctions(loanId);
        usdc.mint(buyer, price);
        vm.startPrank(buyer);
        usdc.approve(address(manager), price);
        manager.bid(loanId, price);
        vm.stopPrank();

        assertEq(backstop.lockedFor(loanId), 0);
        assertEq(backstop.free(address(token)), 0, "the loan's lock and the free backstop both paid");
        assertEq(usdc.balanceOf(address(insurance)), 0, "then insurance");
        // Lenders lose only what the sale, the whole backstop ($10k) and insurance ($1k) did not cover.
        assertEq(manager.totalLosses(), claimValue - price - 11_000e6, "lenders take only what is left");
        assertGt(manager.totalLosses(), 0);
        assertGt(locked, 0);
        assertGt(principal, 11_000e6);
        assertEq(manager.claimable(borrower), 0);
    }

    function test_Ladder_AuctionFloorsAndRestarts() public {
        uint256 id = _stream(0, 365);
        uint256 maturity = block.timestamp + 100 days;
        uint256 loanId = _borrow(id, 10_000e6, maturity, STD);
        vm.warp(maturity + 3 days + 1);
        _setPrice(1e8);
        manager.startLiquidation(loanId); // no partner: auction starts at once
        (, , , , , , uint256 startPrice, uint256 floorPrice) = manager.auctions(loanId);
        assertEq(manager.currentPrice(loanId), startPrice);
        vm.warp(block.timestamp + 3 days);
        assertEq(manager.currentPrice(loanId), floorPrice, "never below the floor in a round");
        manager.restartAuction(loanId);
        (, , , , , , uint256 s2, uint256 f2) = manager.auctions(loanId);
        assertEq(s2, floorPrice);
        assertEq(f2, (floorPrice * 9000) / 10_000);
    }

    function test_Ladder_RepayingDuringTheAuctionCancelsIt() public {
        _fundBackstop(100_000e6);
        uint256 id = _stream(365, 365);
        uint256 maturity = block.timestamp + 100 days;
        uint256 loanId = _borrow(id, 5_000e6, maturity, OPT);
        vm.warp(maturity + 3 days + 1);
        _setPrice(1e8);
        manager.startLiquidation(loanId);
        _pay(borrower, loanId, manager.debtOf(loanId));
        assertEq(sablier.ownerOf(id), borrower);
        assertEq(backstop.lockedFor(loanId), 0, "lock returned to the partner");
        assertEq(backstop.free(address(token)), 100_000e6);
    }

    // ── Oracle and backstop rules ────────────────────────────────────────────

    function test_Omega_CutsAtOnceRisesSlowly() public {
        vm.startPrank(guardian);
        oracle.setOmega(address(token), 5000);
        assertEq(oracle.omega(address(token)), 5000, "cut applies at once");
        vm.expectRevert("raise too large");
        oracle.setOmega(address(token), 6000);
        oracle.setOmega(address(token), 5500);
        assertEq(oracle.omega(address(token)), 5000, "raise waits");
        vm.warp(block.timestamp + 24 hours);
        assertEq(oracle.omega(address(token)), 5500);
        vm.stopPrank();
    }

    function test_RiskInputs_AreBounded() public {
        vm.startPrank(poster);
        vm.expectRevert("sigma");
        oracle.postRisk(address(token), 2000, 1e12, 10_000); // below the token's 30% floor
        vm.expectRevert(bytes("drag"));
        oracle.postRisk(address(token), 8000, 1e12, 100);
        vm.stopPrank();
        vm.expectRevert();
        oracle.postRisk(address(token), 8000, 1e12, 10_000); // not a poster
    }

    function test_Backstop_PartnerCannotPullLockedFunds() public {
        _fundBackstop(10_000e6);
        uint256 id = _stream(365, 365);
        uint256 loanId = _borrow(id, 10_000e6, block.timestamp + 300 days, OPT);
        uint256 locked = backstop.lockedFor(loanId);
        vm.startPrank(partner);
        vm.expectRevert("exceeds free");
        backstop.withdraw(address(token), 10_000e6, partner);
        backstop.withdraw(address(token), 10_000e6 - locked, partner);
        vm.stopPrank();
        vm.prank(governor);
        vm.expectRevert("backstop");
        manager.setOptInBackstopBps(1500); // never below the calibrated 16%
    }
}
