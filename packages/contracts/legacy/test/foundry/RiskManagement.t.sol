// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/LoanManager.sol";
import "../../src/GlobalRiskModule.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockPool {
    address public usdc;
    constructor(address _usdc) { usdc = _usdc; }
}

contract RiskManagementTest is Test {
    LoanManager loanManager;
    GlobalRiskModule riskModule;
    
    address governor = address(0xA11CE);
    address guardian = address(0xBEEF);
    address attacker = address(0xDEAD);
    address mockUsdc = address(0x1337);
    
    uint256 constant CEILING = 1_000_000 * 1e6;

    function setUp() public {
        // Minimal setup for LoanManager
        MockPool mockPool = new MockPool(mockUsdc);
        
        loanManager = new LoanManager(
            address(0), // valuation
            address(0), // adapter
            address(mockPool),
            address(0), // identityVerifier
            0,          // identityBoostBps
            address(0), // auctionFactory
            address(0), // uniswapRouter
            0,          // poolFee
            0,          // slippageBps
            governor
        );
        
        riskModule = new GlobalRiskModule(address(loanManager), governor);
        
        // Setup Roles
        vm.startPrank(governor);
        loanManager.grantRole(loanManager.PAUSER_ROLE(), address(riskModule));
        loanManager.grantRole(loanManager.GUARDIAN_ROLE(), address(riskModule));
        loanManager.grantRole(loanManager.GUARDIAN_ROLE(), guardian);
        
        riskModule.grantRole(riskModule.GOVERNOR_ROLE(), governor);
        riskModule.grantRole(riskModule.GUARDIAN_ROLE(), guardian);
        
        riskModule.setBadDebtCeiling(CEILING);
        loanManager.setBadDebtCeiling(CEILING);
        vm.stopPrank();
    }

    function testRevert_pause_WhenNotPauser(address rando) public {
        vm.assume(rando != address(riskModule));
        vm.assume(!loanManager.hasRole(loanManager.PAUSER_ROLE(), rando));
        
        vm.prank(rando);
        // AccessControlUnauthorizedAccount(address account, bytes32 neededRole)
        vm.expectRevert();
        loanManager.pause();
    }

    function test_riskModule_canPause_viaEmergencyHalt() public {
        vm.prank(governor);
        riskModule.emergencyHalt("exploit detected");
        assertTrue(loanManager.paused());
    }

    function testFuzz_syncBadDebt_pausesAtCeiling(uint256 badDebt) public {
        vm.assume(badDebt > CEILING);
        vm.assume(badDebt < type(uint256).max);
        
        vm.prank(guardian);
        riskModule.syncBadDebt(badDebt);
        assertTrue(loanManager.paused());
    }

    function test_syncBadDebt_idempotent() public {
        vm.startPrank(guardian);
        riskModule.syncBadDebt(CEILING + 1);
        // must not revert on second call
        riskModule.syncBadDebt(CEILING + 2);
        vm.stopPrank();
        assertTrue(loanManager.paused());
    }

    function test_onlyGovernor_canResume() public {
        vm.prank(governor);
        riskModule.emergencyHalt("test");
        
        vm.prank(guardian);
        vm.expectRevert();
        riskModule.resume();
        
        vm.prank(governor);
        riskModule.resume();
        assertFalse(loanManager.paused());
    }

    // Invariant: GlobalRiskModule always holds PAUSER_ROLE on LoanManager
    function test_invariant_riskModuleHoldsPauserRole() public {
        assertTrue(
            loanManager.hasRole(loanManager.PAUSER_ROLE(), address(riskModule))
        );
    }
}
