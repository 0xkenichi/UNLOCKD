// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/LoanManager.sol";
import "../../src/DutchAuction.sol";
import "../../src/ValuationEngine.sol";
import "../../src/VestingAdapter.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks for Security Testing
// ─────────────────────────────────────────────────────────────────────────────

contract MockUSDC is IERC20 {
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    function mint(address to, uint256 amt) external { balanceOf[to] += amt; }
    function transfer(address to, uint256 amt) external override returns (bool) {
        balanceOf[msg.sender] -= amt;
        balanceOf[to] += amt;
        return true;
    }
    function approve(address spnd, uint256 amt) external override returns (bool) {
        allowance[msg.sender][spnd] = amt;
        return true;
    }
    function transferFrom(address from, address to, uint256 amt) external override returns (bool) {
        allowance[from][msg.sender] -= amt;
        balanceOf[from] -= amt;
        balanceOf[to] += amt;
        return true;
    }
    function totalSupply() external view override returns (uint256) { return 0; }
}

contract MockLendingPool is ILendingPool {
    uint256 public rate = 500; // 5%
    function getInterestRateBps(uint256) external view override returns (uint256) { return rate; }
}

contract MockValuationEngine {
    function computeDPV(uint256 qty, address, uint256, address) external pure returns (uint256, uint256) {
        return (qty / 2, 7000); // 50% DPV, 70% LTV
    }
}

contract MockVestingAdapter {
    function escrow(uint256 sid, address, IVestingAdapter.Protocol) external pure returns (uint256) { return sid; }
    function linkLoan(uint256, uint256) external {}
    function releaseEscrow(uint256) external {}
    function liquidateEscrow(uint256, address) external {}
}

contract MockNFT {
    mapping(uint256 => address) public ownerOf;
    function mint(uint256 id, address to, address, uint256, uint256) external { ownerOf[id] = to; }
    function burn(uint256 id) external { delete ownerOf[id]; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Reproducers
// ─────────────────────────────────────────────────────────────────────────────

contract AuditReproducersTest is Test {
    LoanManager manager;
    DutchAuction auction;
    
    MockUSDC usdc;
    MockLendingPool pool;
    MockValuationEngine engine;
    MockVestingAdapter adapter;
    MockNFT nft;

    address admin = address(0xAD);
    address borrower = address(0xB0);
    address liquidator = address(0xD0);
    address feeRecipient = address(0xFE);

    function setUp() public {
        usdc = new MockUSDC();
        pool = new MockLendingPool();
        engine = new MockValuationEngine();
        adapter = new MockVestingAdapter();
        nft = new MockNFT();

        manager = new LoanManager(
            address(usdc),
            address(engine),
            address(adapter),
            address(nft),
            address(pool),
            feeRecipient,
            admin
        );

        auction = new DutchAuction(address(adapter), address(usdc), admin);
        
        vm.prank(admin);
        auction.setFeeRecipient(feeRecipient);

        usdc.mint(address(manager), 1000e6);
        usdc.mint(borrower, 1000e6);
        usdc.mint(liquidator, 1000e6);
    }

    // ════════════════════════════════════════════════════════════════════════
    // 1. LoanManager: Interest Validation Patch
    // ════════════════════════════════════════════════════════════════════════

    function test_CRITICAL_RepayWithZeroInterest_Reverts() public {
        // 1. Open a loan
        vm.prank(borrower);
        uint256 loanId = manager.borrow(address(0x1), 1, 100e18, block.timestamp + 30 days, 50e6, IVestingAdapter.Protocol.SABLIER_V2);

        // 2. Attempt to repay with 0 interest
        vm.startPrank(borrower);
        usdc.approve(address(manager), 50e6);
        
        // This should REVERT after the patch
        vm.expectRevert("insufficient interest");
        manager.repay(loanId, 0);
        vm.stopPrank();
    }

    function test_RepayWithCorrectInterest_Succeeds() public {
        vm.prank(borrower);
        uint256 loanId = manager.borrow(address(0x1), 1, 100e18, block.timestamp + 30 days, 50e6, IVestingAdapter.Protocol.SABLIER_V2);

        // Calculate expected min interest: (50e6 * 500) / 10000 = 2.5e6
        uint256 minInterest = (50e6 * 500) / 10000;

        vm.startPrank(borrower);
        usdc.approve(address(manager), 50e6 + minInterest);
        manager.repay(loanId, minInterest);
        vm.stopPrank();

        (,,,,,,,,, LoanManager.LoanStatus status) = manager.loans(loanId);
        assertEq(uint(status), uint(LoanManager.LoanStatus.Repaid));
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. BaseAuction: Fee Distribution Patch
    // ════════════════════════════════════════════════════════════════════════

    function test_HIGH_FeeDistribution_SentToFeeRecipient() public {
        // 1. Create an auction
        vm.prank(admin);
        auction.createAuction(1, address(0x2), 100e6, 50e6, 1 hours);
        uint256 auctionId = 0;

        // 2. Bid (after patch, feeRecipient should receive some USDC)
        uint256 initialFeeRecipientBalance = usdc.balanceOf(feeRecipient);
        
        vm.startPrank(liquidator);
        usdc.approve(address(auction), 100e6);
        auction.bid(auctionId, 100e6);
        vm.stopPrank();

        uint256 fee = (100e6 * 200) / 10000; // 2%
        assertEq(usdc.balanceOf(feeRecipient), initialFeeRecipientBalance + fee, "Fee not sent to recipient");
    }
}
