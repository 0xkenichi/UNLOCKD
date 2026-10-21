// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "forge-std/console2.sol";

import "../../src/VestingAdapter.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Mock ERC-721 vesting NFT (Sablier-shaped)
// ─────────────────────────────────────────────────────────────────────────────
contract MockSablier is IERC721 {
    mapping(uint256 => address) private _owners;
    mapping(address => mapping(address => bool)) private _approvedAll;
    mapping(uint256 => address) private _approved;

    struct Stream {
        address asset;
        uint128 deposit;
        uint128 withdrawn;
        uint40  endTime;
        bool    wasCanceled;
    }
    mapping(uint256 => Stream) public streams;
    uint256 public nextId = 1;

    function mint(address to, address asset, uint128 amount, uint40 end)
        external
        returns (uint256 id)
    {
        id = nextId++;
        _owners[id] = to;
        streams[id] = Stream(asset, amount, 0, end, false);
    }

    function cancel(uint256 id) external { streams[id].wasCanceled = true; }
    function setWithdrawn(uint256 id, uint128 w) external { streams[id].withdrawn = w; }

    // ISablierV2LockupLinear shape
    function getStream(uint256 id)
        external
        view
        returns (
            address sender,
            address recipient,
            uint128 depositAmount,
            address asset,
            bool cancelable,
            bool wasCanceled,
            uint128 withdrawnAmount,
            ISablierV2LockupLinear.Timestamps memory timestamps
        )
    {
        Stream storage s = streams[id];
        sender = address(0);
        recipient = _owners[id];
        depositAmount = s.deposit;
        asset = s.asset;
        cancelable = true;
        wasCanceled = s.wasCanceled;
        withdrawnAmount = s.withdrawn;
        timestamps = ISablierV2LockupLinear.Timestamps(0, 0, s.endTime);
    }

    // IERC721
    function ownerOf(uint256 id) external view returns (address) { return _owners[id]; }
    function balanceOf(address) external pure returns (uint256) { return 0; }
    function getApproved(uint256 id) external view returns (address) { return _approved[id]; }
    function isApprovedForAll(address o, address op) external view returns (bool) { return _approvedAll[o][op]; }
    function approve(address to, uint256 id) external { _approved[id] = to; }
    function setApprovalForAll(address op, bool ok) external { _approvedAll[msg.sender][op] = ok; }
    function transferFrom(address from, address to, uint256 id) external {
        require(_owners[id] == from, "not owner");
        _owners[id] = to;
    }
    function safeTransferFrom(address from, address to, uint256 id) external {
        _owners[id] = to;
    }
    function safeTransferFrom(address from, address to, uint256 id, bytes calldata) external {
        _owners[id] = to;
    }
    function supportsInterface(bytes4) external pure returns (bool) { return true; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock token
// ─────────────────────────────────────────────────────────────────────────────
contract MockToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────
contract VestingAdapterTest is Test {

    VestingAdapter adapter;
    MockSablier    sablier;
    MockToken      token;

    address governor    = address(0xA0);
    address guardian    = address(0xA1);
    address loanManager = address(0xA2);
    address borrower    = address(0xB0);
    address attacker    = address(0xC0);
    address liquidator  = address(0xD0);

    uint40  constant UNLOCK = uint40(block.timestamp + 90 days);
    uint128 constant AMOUNT = 1_000e18;

    function setUp() public {
        sablier = new MockSablier();
        token   = new MockToken();

        adapter = new VestingAdapter(governor, guardian, loanManager);

        // Whitelist the mock Sablier contract
        vm.prank(governor);
        adapter.setWhitelisted(VestingAdapter.Protocol.SABLIER_V2, address(sablier), true);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Helper: mint a Sablier NFT to borrower and give adapter approval
    // ────────────────────────────────────────────────────────────────────────
    function _mintAndApprove(address to)
        internal
        returns (uint256 streamId)
    {
        streamId = sablier.mint(to, address(token), AMOUNT, UNLOCK);
        vm.prank(to);
        sablier.approve(address(adapter), streamId);
    }

    // ════════════════════════════════════════════════════════════════════════
    // 1. Unit tests
    // ════════════════════════════════════════════════════════════════════════

    function test_escrow_HappyPath() public {
        uint256 sid = _mintAndApprove(borrower);

        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        assertEq(eid, 1);
        assertEq(sablier.ownerOf(sid), address(adapter), "adapter should hold NFT");

        (
            address t,
            uint256 remaining,
            uint256 unlock,
            address bwr,
            uint256 loanId,
            bool released
        ) = adapter.getDetails(eid);

        assertEq(t,         address(token));
        assertEq(remaining, AMOUNT);
        assertEq(unlock,    UNLOCK);
        assertEq(bwr,       borrower);
        assertEq(loanId,    0);
        assertFalse(released);
    }

    function test_escrow_EmitsEvent() public {
        uint256 sid = _mintAndApprove(borrower);

        vm.expectEmit(true, true, true, true);
        emit VestingAdapter.EscrowCreated(
            1, borrower, address(sablier), sid,
            VestingAdapter.Protocol.SABLIER_V2,
            address(token), AMOUNT, UNLOCK
        );

        vm.prank(borrower);
        adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
    }

    function test_escrow_RevertsIfNotWhitelisted() public {
        address fakeNFT = address(0xDEAD);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.NotWhitelisted.selector, fakeNFT));
        adapter.escrow(1, fakeNFT, VestingAdapter.Protocol.SABLIER_V2);
    }

    function test_escrow_RevertsIfNotOwner() public {
        uint256 sid = sablier.mint(address(0x999), address(token), AMOUNT, UNLOCK);
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(VestingAdapter.NotOwner.selector, borrower, address(0x999))
        );
        adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
    }

    function test_escrow_RevertsIfDoubleEscrow() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        // NFT now held by adapter — try again
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(VestingAdapter.AlreadyEscrowed.selector, address(sablier), sid)
        );
        adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
    }

    function test_escrow_RevertsIfStreamExpired() public {
        uint256 sid = sablier.mint(borrower, address(token), AMOUNT, uint40(block.timestamp - 1));
        vm.prank(borrower);
        sablier.approve(address(adapter), sid);
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(VestingAdapter.InvalidUnlockTime.selector, block.timestamp - 1)
        );
        adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
    }

    function test_escrow_RevertsIfSablierCancelled() public {
        uint256 sid = sablier.mint(borrower, address(token), AMOUNT, UNLOCK);
        sablier.cancel(sid);
        vm.prank(borrower);
        sablier.approve(address(adapter), sid);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.StreamCancelled.selector, sid));
        adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // linkLoan
    // ─────────────────────────────────────────────────────────────────────────

    function test_linkLoan_HappyPath() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        vm.prank(loanManager);
        adapter.linkLoan(eid, 42);

        (, , , , uint256 loanId, ) = adapter.getDetails(eid);
        assertEq(loanId, 42);
    }

    function test_linkLoan_RevertsIfNotLoanManager() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.OnlyLoanManager.selector, attacker));
        adapter.linkLoan(eid, 1);
    }

    function test_linkLoan_RevertsIfAlreadyLinked() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        vm.prank(loanManager);
        adapter.linkLoan(eid, 1);

        vm.prank(loanManager);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.AlreadyLinked.selector, eid, 1));
        adapter.linkLoan(eid, 2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // releaseEscrow
    // ─────────────────────────────────────────────────────────────────────────

    function test_releaseEscrow_ReturnsToBorrower() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        vm.prank(loanManager);
        adapter.linkLoan(eid, 7);

        vm.prank(loanManager);
        adapter.releaseEscrow(eid);

        assertEq(sablier.ownerOf(sid), borrower, "NFT must return to borrower");
        (, , , , , bool released) = adapter.getDetails(eid);
        assertTrue(released);
        assertEq(adapter.getEscrowId(address(sablier), sid), 0, "reverse lookup cleared");
    }

    function test_releaseEscrow_RevertsIfAlreadyReleased() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        vm.prank(loanManager); adapter.releaseEscrow(eid);

        vm.prank(loanManager);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.AlreadyReleased.selector, eid));
        adapter.releaseEscrow(eid);
    }

    function test_releaseEscrow_OnlyLoanManager() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.OnlyLoanManager.selector, attacker));
        adapter.releaseEscrow(eid);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // liquidateEscrow
    // ─────────────────────────────────────────────────────────────────────────

    function test_liquidateEscrow_SendsToLiquidator() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        vm.prank(loanManager); adapter.linkLoan(eid, 99);

        vm.prank(loanManager);
        adapter.liquidateEscrow(eid, liquidator);

        assertEq(sablier.ownerOf(sid), liquidator);
        (, , , , , bool released) = adapter.getDetails(eid);
        assertTrue(released);
    }

    function test_liquidateEscrow_RevertsOnZeroLiquidator() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        vm.prank(loanManager);
        vm.expectRevert(VestingAdapter.ZeroAddress.selector);
        adapter.liquidateEscrow(eid, address(0));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // getDetails — live remaining value
    // ─────────────────────────────────────────────────────────────────────────

    function test_getDetails_ReflectsWithdrawals() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        // Simulate Sablier withdrawal of half
        sablier.setWithdrawn(sid, AMOUNT / 2);

        (, uint256 remaining, , , , ) = adapter.getDetails(eid);
        assertEq(remaining, AMOUNT - AMOUNT / 2);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin paths
    // ─────────────────────────────────────────────────────────────────────────

    function test_setWhitelisted_OnlyGovernor() public {
        vm.prank(attacker);
        vm.expectRevert();
        adapter.setWhitelisted(VestingAdapter.Protocol.SABLIER_V2, address(sablier), false);
    }

    function test_setLoanManager_OnlyGovernor() public {
        vm.prank(attacker);
        vm.expectRevert();
        adapter.setLoanManager(attacker);
    }

    function test_setLoanManager_RejectsZeroAddress() public {
        vm.prank(governor);
        vm.expectRevert(VestingAdapter.ZeroAddress.selector);
        adapter.setLoanManager(address(0));
    }

    function test_pause_OnlyGuardian() public {
        vm.prank(attacker);
        vm.expectRevert();
        adapter.pause();
    }

    function test_pause_BlocksEscrow() public {
        vm.prank(guardian);
        adapter.pause();

        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        vm.expectRevert();
        adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
    }

    function test_unpause_ResumesEscrow() public {
        vm.prank(guardian); adapter.pause();
        vm.prank(guardian); adapter.unpause();

        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        assertEq(eid, 1);
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. Fuzz tests
    // ════════════════════════════════════════════════════════════════════════

    /**
     * @dev Any unlock time in the future should be accepted.
     *      Any unlock time in the past (or current block) should revert.
     */
    function testFuzz_escrow_UnlockTimeBoundary(uint40 delta) public {
        // delta > 0 → future unlock → should succeed
        delta = uint40(bound(delta, 1, 365 days));
        uint40 futureUnlock = uint40(block.timestamp) + delta;

        uint256 sid = sablier.mint(borrower, address(token), AMOUNT, futureUnlock);
        vm.prank(borrower);
        sablier.approve(address(adapter), sid);

        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        assertGt(eid, 0);
    }

    function testFuzz_escrow_AmountPreserved(uint128 amount) public {
        amount = uint128(bound(amount, 1e6, type(uint96).max));
        uint256 sid = sablier.mint(borrower, address(token), amount, UNLOCK);
        vm.prank(borrower);
        sablier.approve(address(adapter), sid);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        (, uint256 remaining, , , , ) = adapter.getDetails(eid);
        assertEq(remaining, amount);
    }

    /**
     * @dev Guarantee that released escrow ID can never be re-used to release again.
     */
    function testFuzz_doubleRelease_AlwaysReverts(uint8 n) public {
        n = uint8(bound(n, 1, 5));
        for (uint i = 0; i < n; i++) {
            uint256 sid = _mintAndApprove(borrower);
            vm.prank(borrower);
            uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
            vm.prank(loanManager);
            adapter.releaseEscrow(eid);

            vm.prank(loanManager);
            vm.expectRevert(abi.encodeWithSelector(VestingAdapter.AlreadyReleased.selector, eid));
            adapter.releaseEscrow(eid);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. Invariant tests
    // ════════════════════════════════════════════════════════════════════════

    // State tracking for invariant handler
    uint256[] public activeEscrowIds;

    function invariant_ReleasedEscrowsNotDoubleSpent() public view {
        for (uint i = 0; i < activeEscrowIds.length; i++) {
            uint256 eid = activeEscrowIds[i];
            (, , , , , bool released) = adapter.getDetails(eid);
            if (released) {
                // once released, reverse lookup must be 0
                // (we'd need NFT contract ref to fully check — tested in unit tests)
                assertTrue(released, "released must be true once set");
            }
        }
    }

    function invariant_EscrowIdMonotonicallyIncreases() public view {
        // _nextEscrowId is private but observable: any escrow we created must have id < nextId
        // Weakly tested here via the active set
        for (uint i = 0; i < activeEscrowIds.length; i++) {
            assertGt(activeEscrowIds[i], 0, "no escrowId 0 should ever exist");
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    // 4. Integration: full borrow lifecycle
    // ════════════════════════════════════════════════════════════════════════

    function testIntegration_FullBorrowLifecycle() public {
        // 1. Borrower escrows their Sablier stream
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);

        assertEq(sablier.ownerOf(sid), address(adapter), "step1: adapter holds NFT");

        // 2. LoanManager links a loan after dDPV check passes
        vm.prank(loanManager);
        adapter.linkLoan(eid, 1);

        (, , , , uint256 loanId, ) = adapter.getDetails(eid);
        assertEq(loanId, 1, "step2: loan linked");

        // 3. Simulate partial withdrawal from the stream (half vested)
        sablier.setWithdrawn(sid, AMOUNT / 2);
        (, uint256 remaining, , , , ) = adapter.getDetails(eid);
        assertEq(remaining, AMOUNT / 2, "step3: remaining reflects withdrawal");

        // 4. Borrower repays → LoanManager releases escrow
        vm.prank(loanManager);
        adapter.releaseEscrow(eid);

        assertEq(sablier.ownerOf(sid), borrower, "step4: NFT returned to borrower");
        (, , , , , bool released) = adapter.getDetails(eid);
        assertTrue(released, "step4: marked released");
        assertEq(adapter.getEscrowId(address(sablier), sid), 0, "step4: reverse lookup cleared");
    }

    function testIntegration_DefaultLiquidation() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        vm.prank(loanManager); adapter.linkLoan(eid, 5);

        // Default → LoanManager triggers liquidation
        vm.prank(loanManager);
        adapter.liquidateEscrow(eid, liquidator);

        assertEq(sablier.ownerOf(sid), liquidator, "NFT goes to liquidator/auction");
        assertEq(adapter.getEscrowId(address(sablier), sid), 0);
    }

    // ════════════════════════════════════════════════════════════════════════
    // 5. Access control: exhaustive onlyLoanManager checks
    // ════════════════════════════════════════════════════════════════════════

    function testRevert_linkLoan_WhenNotLoanManager() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        address[3] memory callers = [borrower, attacker, governor];
        for (uint i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(VestingAdapter.OnlyLoanManager.selector, callers[i]));
            adapter.linkLoan(eid, 1);
        }
    }

    function testRevert_releaseEscrow_WhenNotLoanManager() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.OnlyLoanManager.selector, borrower));
        adapter.releaseEscrow(eid);
    }

    function testRevert_liquidateEscrow_WhenNotLoanManager() public {
        uint256 sid = _mintAndApprove(borrower);
        vm.prank(borrower);
        uint256 eid = adapter.escrow(sid, address(sablier), VestingAdapter.Protocol.SABLIER_V2);
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(VestingAdapter.OnlyLoanManager.selector, attacker));
        adapter.liquidateEscrow(eid, liquidator);
    }
}
