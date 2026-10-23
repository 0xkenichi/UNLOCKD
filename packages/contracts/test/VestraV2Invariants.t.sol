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

/**
 * Drives the v2 loan book through random sequences: borrows in both tiers, partial and full
 * repayments, time passing, price moves up and down, breach flags, paydowns, liquidations,
 * partner buybacks, auction bids and restarts, backstop deposits and withdrawals, and Ω and risk
 * posts that must never touch an open loan. Reverts inside actions are expected and swallowed;
 * the invariants below are checked after every action.
 */
contract V2Handler is Test {
    MockUSDC public usdc;
    MockProjectToken public token;
    MockPriceFeed public feed;
    MockSablierV2Lockup public sablier;
    VestingAdapter public adapter;
    LendingPool public pool;
    InsuranceVault public insurance;
    CreditEngineV2 public engine;
    RiskOracle public oracle;
    BackstopVault public backstop;
    LoanManagerV2 public manager;

    address public governor;
    address public guardian;
    address public poster;
    address public partner;
    address public buyer;
    address[] public borrowers;

    uint256[] public loanIds;
    mapping(uint256 => uint256) public openPrice;      // origination price (6 dec)
    mapping(uint256 => uint256) public minPriceSince;  // lowest health price seen since
    mapping(uint256 => uint256) public maxPrincipal;   // principal at origination
    uint256 public surplusPaid;
    uint256 public actions;
    uint256 public reverts;
    int256 public price = 1e8;

    constructor(
        MockUSDC _usdc, MockProjectToken _token, MockPriceFeed _feed, MockSablierV2Lockup _sablier,
        VestingAdapter _adapter, LendingPool _pool, InsuranceVault _insurance, CreditEngineV2 _engine,
        RiskOracle _oracle, BackstopVault _backstop, LoanManagerV2 _manager,
        address _governor, address _guardian, address _poster, address _partner, address _buyer
    ) {
        usdc = _usdc; token = _token; feed = _feed; sablier = _sablier; adapter = _adapter; pool = _pool;
        insurance = _insurance; engine = _engine; oracle = _oracle; backstop = _backstop; manager = _manager;
        governor = _governor; guardian = _guardian; poster = _poster; partner = _partner; buyer = _buyer;
        for (uint256 i = 0; i < 4; i++) borrowers.push(makeAddr(string(abi.encodePacked("borrower", i))));
    }

    // ── Bookkeeping ──────────────────────────────────────────────────────────

    function _track() internal {
        uint256 p;
        try oracle.healthPrice(address(token)) returns (uint256 hp) { p = hp; } catch { return; }
        for (uint256 i = 0; i < loanIds.length; i++) {
            uint256 id = loanIds[i];
            if (p < minPriceSince[id]) minPriceSince[id] = p;
        }
    }

    modifier act() {
        actions++;
        _;
        _track();
    }

    function _settlePrice() internal {
        feed.setPrice(price);
        vm.warp(block.timestamp + 1 hours + 1);
        feed.setPrice(price);
    }

    function _mintUsdc(address to, uint256 amount) internal {
        usdc.mint(to, amount);
        vm.prank(to);
        usdc.approve(address(manager), type(uint256).max);
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    function borrow(uint256 seed, uint8 shape, uint16 shareBps, bool optIn) external act {
        address who = borrowers[seed % borrowers.length];
        uint256 endDays = bound(uint256(keccak256(abi.encode(seed, 1))), 30, 1095);
        uint256 cliffDays = shape % 3 == 0 ? 0 : shape % 3 == 1 ? endDays : bound(uint256(keccak256(abi.encode(seed, 2))), 7, endDays - 7);
        uint256 qty = bound(uint256(keccak256(abi.encode(seed, 3))), 1_000e18, 500_000e18);
        uint256 maturity = block.timestamp + bound(uint256(keccak256(abi.encode(seed, 4))), 20, endDays) * 1 days;

        token.approve(address(sablier), qty);
        uint256 id = sablier.createStreamWithCliff(
            who, address(token), uint128(qty), uint40(block.timestamp), uint40(block.timestamp + cliffDays * 1 days),
            uint40(block.timestamp + endDays * 1 days), false
        );
        CreditEngineV2.Tier tier = optIn ? CreditEngineV2.Tier.OptIn : CreditEngineV2.Tier.Standard;
        uint256 maxB;
        try manager.quoteMaxBorrow(VestingAdapter.Protocol.SABLIER_V2, address(sablier), id, 1_000e6, maturity, tier) returns (uint256 m, uint256) {
            maxB = m;
        } catch { reverts++; return; }
        uint256 amount = (maxB * bound(shareBps, 2000, 10_000)) / 10_000;
        if (amount < 10e6) return;

        vm.startPrank(who);
        sablier.approve(address(adapter), id);
        try manager.borrow(LoanManagerV2.BorrowRequest(address(sablier), id, VestingAdapter.Protocol.SABLIER_V2, amount, maturity, tier, 10_000)) returns (uint256 loanId) {
            loanIds.push(loanId);
            openPrice[loanId] = _marketPrice();
            minPriceSince[loanId] = type(uint256).max;
            maxPrincipal[loanId] = amount;
        } catch { reverts++; }
        vm.stopPrank();
    }

    function _marketPrice() internal view returns (uint256) {
        try oracle.originationMarket(address(token)) returns (CreditEngineV2.Market memory m) { return m.price; } catch { return 0; }
    }

    function repay(uint256 seed, uint16 shareBps) external act {
        if (loanIds.length == 0) return;
        uint256 id = loanIds[seed % loanIds.length];
        uint256 debt = manager.debtOf(id);
        if (debt == 0) return;
        uint256 amount = (debt * bound(shareBps, 1, 10_000)) / 10_000;
        if (shareBps > 9000) amount = debt;
        address who = manager.getLoan(id).borrower;
        _mintUsdc(who, amount);
        vm.prank(who);
        try manager.repay(id, amount) {} catch { reverts++; }
    }

    function passTime(uint32 secs) external act {
        vm.warp(block.timestamp + bound(secs, 1 hours, 45 days));
        _settlePrice();
    }

    function movePrice(int16 bps) external act {
        int256 delta = int256(bound(uint256(uint16(bps)), 0, 8000)) - 4000; // −40% … +40%
        price = (price * (10_000 + delta)) / 10_000;
        if (price < 1e5) price = 1e5; // $0.001 floor
        if (price > 1e11) price = 1e11;
        _settlePrice();
    }

    function flag(uint256 seed) external act {
        if (loanIds.length == 0) return;
        try manager.flagBreach(loanIds[seed % loanIds.length]) {} catch { reverts++; }
    }

    function clear(uint256 seed) external act {
        if (loanIds.length == 0) return;
        try manager.clearBreach(loanIds[seed % loanIds.length]) {} catch { reverts++; }
    }

    function paydown(uint256 seed, uint64 tokens) external act {
        if (loanIds.length == 0) return;
        uint256 id = loanIds[seed % loanIds.length];
        uint256 t = bound(tokens, 1e18, 50_000e18);
        _mintUsdc(buyer, 10_000_000e6);
        vm.prank(buyer);
        try manager.paydown(id, t, type(uint256).max) {} catch { reverts++; }
    }

    function liquidate(uint256 seed) external act {
        if (loanIds.length == 0) return;
        try manager.startLiquidation(loanIds[seed % loanIds.length]) {} catch { reverts++; }
    }

    function restart(uint256 seed) external act {
        if (loanIds.length == 0) return;
        try manager.restartAuction(loanIds[seed % loanIds.length]) {} catch { reverts++; }
    }

    function bid(uint256 seed, bool asPartner) external act {
        if (loanIds.length == 0) return;
        uint256 id = loanIds[seed % loanIds.length];
        address who = asPartner ? partner : buyer;
        _mintUsdc(who, 100_000_000e6);
        address borrower = manager.getLoan(id).borrower;
        uint256 before = manager.claimable(borrower);
        vm.prank(who);
        try manager.bid(id, type(uint256).max) {
            surplusPaid += manager.claimable(borrower) - before;
        } catch { reverts++; }
    }

    function claimSurplus(uint256 seed) external act {
        address who = borrowers[seed % borrowers.length];
        vm.prank(who);
        try manager.claim() {} catch { reverts++; }
    }

    function partnerDeposit(uint64 amount) external act {
        uint256 a = bound(amount, 1e6, 2_000_000e6);
        usdc.mint(partner, a);
        vm.startPrank(partner);
        usdc.approve(address(backstop), a);
        try backstop.deposit(address(token), a) {} catch { reverts++; }
        vm.stopPrank();
    }

    function partnerWithdraw(uint64 amount) external act {
        vm.prank(partner);
        try backstop.withdraw(address(token), bound(amount, 1, 2_000_000e6), partner) {} catch { reverts++; }
    }

    function lenderMove(uint64 amount, bool depositNotWithdraw) external act {
        address lender = makeAddr("lender");
        uint256 a = bound(amount, 1e6, 3_000_000e6);
        vm.startPrank(lender);
        if (depositNotWithdraw) {
            usdc.mint(lender, a);
            usdc.approve(address(pool), a);
            try pool.deposit(a, lender) {} catch { reverts++; }
        } else {
            uint256 max = pool.maxWithdraw(lender);
            if (max > 0) try pool.withdraw(a > max ? max : a, lender, lender) {} catch { reverts++; }
        }
        vm.stopPrank();
    }

    /// Risk signals: must never change an open loan's health.
    function riskSignals(uint32 sigmaBps, uint64 adv, uint32 dragBps, uint16 omegaBps) external act {
        vm.prank(poster);
        try oracle.postRisk(address(token), uint32(bound(sigmaBps, 3000, 50_000)), bound(adv, 1e6, 1e14), uint32(bound(dragBps, 500, 10_000))) {} catch { reverts++; }
        vm.prank(guardian);
        try oracle.setOmega(address(token), uint16(bound(omegaBps, 0, 10_000))) {} catch { reverts++; }
    }

    function loanCount() external view returns (uint256) { return loanIds.length; }
}

contract VestraV2InvariantTest is Test {
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
    V2Handler handler;

    address governor = makeAddr("governor");
    address guardian = makeAddr("guardian");
    address poster = makeAddr("poster");
    address treasury = makeAddr("treasury");
    address partner = makeAddr("partner");
    address buyer = makeAddr("buyer");

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockUSDC();
        token = new MockProjectToken("Project", "PRJ", 18, 1e36, address(this));
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
        handler = new V2Handler(usdc, token, feed, sablier, adapter, pool, insurance, engine, oracle, backstop, manager, governor, guardian, poster, partner, buyer);
        token.transfer(address(handler), 1e35); // the handler funds every stream from this

        vm.startPrank(governor);
        adapter.setWhitelisted(VestingAdapter.Protocol.SABLIER_V2, address(sablier), true);
        adapter.setLoanManager(address(manager));
        pool.setLoanManager(address(manager));
        insurance.setLoanManager(address(manager));
        backstop.setLoanManager(address(manager));
        backstop.setPartner(address(token), partner);
        oracle.grantRole(oracle.RISK_POSTER_ROLE(), poster);
        oracle.grantRole(keccak256("GUARDIAN_ROLE"), guardian);
        oracle.listToken(address(token), address(feed), 3000, 10_000);
        oracle.setMaxRiskAge(7 days);
        manager.grantRole(manager.PAYDOWN_BUYER_ROLE(), buyer);
        manager.setLimits(2500, 3 * 365 days, 10e6);
        vm.stopPrank();

        feed.setPrice(1e8);
        vm.warp(block.timestamp + 1 hours + 1);
        feed.setPrice(1e8);
        vm.prank(poster);
        oracle.postRisk(address(token), 8000, 5_000_000e6, 10_000);

        address lender = makeAddr("lender");
        usdc.mint(lender, 20_000_000e6);
        vm.startPrank(lender);
        usdc.approve(address(pool), 20_000_000e6);
        pool.deposit(20_000_000e6, lender);
        vm.stopPrank();
        usdc.mint(address(insurance), 50_000e6);

        targetContract(address(handler));
    }

    /// The lenders' claim equals the sum over loans of what each loan owes them (plus marks).
    function invariant_LenderClaimMatchesTheLoans() public view {
        uint256 expected;
        uint256 n = handler.loanCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.loanIds(i);
            LoanManagerV2.Loan memory l = manager.getLoan(id);
            if (l.status == LoanManagerV2.Status.Active) {
                uint256 interest = manager.debtOf(id) - l.principal;
                expected += l.principal + (interest * (10_000 - manager.reserveFactorBps())) / 10_000;
            } else if (l.status == LoanManagerV2.Status.Auction) {
                (, , , , uint256 mark, , , ) = manager.auctions(id);
                expected += mark;
            }
        }
        assertApproxEqAbs(manager.lenderClaim(), expected, n + 1, "lender claim");
        assertEq(pool.totalAssets(), pool.idleAssets() + manager.lenderClaim(), "pool assets");
        assertEq(usdc.balanceOf(address(pool)), pool.idleAssets(), "pool cash");
    }

    /// Principal outstanding per token equals the sum over active loans.
    function invariant_ExposureMatchesActivePrincipal() public view {
        uint256 expected;
        uint256 n = handler.loanCount();
        for (uint256 i = 0; i < n; i++) {
            LoanManagerV2.Loan memory l = manager.getLoan(handler.loanIds(i));
            if (l.status == LoanManagerV2.Status.Active) expected += l.principal;
        }
        assertEq(manager.exposure(address(token)), expected, "exposure");
    }

    /// The backstop's cash equals free plus locked, and every open opt-in loan keeps its lock.
    function invariant_BackstopAccounting() public view {
        uint256 lockedSum;
        uint256 n = handler.loanCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.loanIds(i);
            LoanManagerV2.Loan memory l = manager.getLoan(id);
            uint256 lock = backstop.lockedFor(id);
            lockedSum += lock;
            bool open = l.status == LoanManagerV2.Status.Active || l.status == LoanManagerV2.Status.Auction;
            if (l.tier == CreditEngineV2.Tier.OptIn && open) {
                assertGe(lock, (handler.maxPrincipal(id) * 1600) / 10_000, "opt-in lock intact");
            }
            if (!open) assertEq(lock, 0, "closed loan holds no lock");
        }
        assertEq(backstop.lockedTotal(address(token)), lockedSum, "locked total");
        assertEq(usdc.balanceOf(address(backstop)), backstop.free(address(token)) + lockedSum, "backstop cash");
    }

    /// The loan manager holds only borrowers' unclaimed surpluses.
    function invariant_ManagerHoldsOnlySurpluses() public view {
        uint256 owed;
        for (uint256 i = 0; i < 4; i++) owed += manager.claimable(handler.borrowers(i));
        assertEq(usdc.balanceOf(address(manager)), owed, "manager cash");
    }

    /// T7, stateful: a loan whose health price never fell below its origination price is never
    /// liquidatable before maturity, whatever else happened (time, repayments, paydowns, risk posts, Ω).
    function invariant_NoLiquidationWithoutAPriceFall() public view {
        uint256 n = handler.loanCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.loanIds(i);
            LoanManagerV2.Loan memory l = manager.getLoan(id);
            if (l.status != LoanManagerV2.Status.Active) continue;
            if (block.timestamp > l.maturity) continue;
            if (handler.minPriceSince(id) < handler.openPrice(id)) continue;
            (uint256 debt, uint256 cv) = manager.health(id);
            assertLe(debt, cv, "liquidatable without a price fall");
            assertFalse(manager.isLiquidatable(id), "isLiquidatable without a price fall");
        }
    }

    /// Auction state is well formed: floor at or below start, mark at or below the claim.
    function invariant_AuctionsWellFormed() public view {
        uint256 n = handler.loanCount();
        for (uint256 i = 0; i < n; i++) {
            uint256 id = handler.loanIds(i);
            if (manager.getLoan(id).status != LoanManagerV2.Status.Auction) continue;
            (, , uint256 debt, uint256 claimV, uint256 mark, uint256 partnerPrice, uint256 startPrice, uint256 floorPrice) = manager.auctions(id);
            assertLe(floorPrice, startPrice, "floor <= start");
            assertLe(mark, claimV, "mark <= claim");
            assertLe(claimV, debt, "claim <= debt");
            assertGe(partnerPrice, debt, "partner pays at least the debt");
        }
    }

    /// The handler's paths are live: the invariants above are not vacuous. Handler seeds below
    /// 3 address loan index = seed.
    function test_HandlerReachesEveryStage() public {
        handler.partnerDeposit(1_000_000e6);
        handler.passTime(7 days);              // let the time-weighted pool figures settle
        handler.riskSignals(8000, 5_000_000e6, 10_000, 10_000); // fresh risk inputs after the week
        handler.borrow(0, 0, 10_000, false);   // loan 0: linear, standard, at the maximum
        handler.borrow(1, 1, 10_000, true);    // loan 1: cliff, opt-in, at the maximum
        handler.borrow(2, 2, 6000, false);     // loan 2: cliff then linear, 60% of the maximum
        assertEq(handler.loanCount(), 3, "borrows went through");
        uint256 loan0 = handler.loanIds(0);
        uint256 loan1 = handler.loanIds(1);
        uint256 loan2 = handler.loanIds(2);

        handler.passTime(30 days);
        handler.movePrice(0);                  // -40%
        handler.movePrice(0);                  // -40% again: 0.36x
        handler.flag(0);
        assertGt(manager.getLoan(loan0).breachAt, 0, "the standard loan at its maximum is in breach");
        handler.passTime(2 days + 1 hours);    // past the cure window, inside the paydown window
        uint256 debtBefore = manager.debtOf(loan0);
        handler.paydown(0, 1);                 // the handler's bound maps 1 to exactly one token
        assertLt(manager.debtOf(loan0), debtBefore, "paydown reduced the debt");

        // The opt-in cliff loan is priced on a stressed sale value far below its liquidation
        // line, so it takes a deeper fall to breach; drive the price down until it does.
        for (uint256 i = 0; i < 8 && manager.getLoan(loan1).breachAt == 0; i++) {
            handler.movePrice(0);
            handler.flag(1);
        }
        assertGt(manager.getLoan(loan1).breachAt, 0, "the opt-in cliff loan is in breach");
        handler.passTime(2 days + 1 hours);
        handler.liquidate(1);                  // nothing vested on a cliff: straight to the sale
        assertEq(uint256(manager.getLoan(loan1).status), uint256(LoanManagerV2.Status.Auction), "liquidation started");
        handler.bid(1, true);                  // the partner buys during its right of first refusal
        assertEq(uint256(manager.getLoan(loan1).status), uint256(LoanManagerV2.Status.Liquidated), "partner bought");

        handler.repay(2, 10_000);
        assertEq(uint256(manager.getLoan(loan2).status), uint256(LoanManagerV2.Status.Repaid), "repaid");
        invariant_LenderClaimMatchesTheLoans();
        invariant_BackstopAccounting();
        invariant_ManagerHoldsOnlySurpluses();
    }
}
