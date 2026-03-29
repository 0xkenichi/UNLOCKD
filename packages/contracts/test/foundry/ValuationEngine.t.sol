// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/ValuationEngine.sol";

contract MockRegistry {
    function getRank(address) external pure returns (uint8) {
        return 1; // Flagship
    }
}

contract MockOracle {
    uint8 public decimals = 8;
    int256 public answer = 1e8; // $1.00

    function latestRoundData() external view returns (
        uint80 roundId,
        int256 _answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, answer, block.timestamp, block.timestamp, 1);
    }
}

contract MockERC20 {
    uint8 public decimals = 18;
}

contract ValuationEngineTest is Test {
    ValuationEngine public engine;
    address public admin = address(this);
    address public dummyToken;
    address public dummyVesting = address(0xDEAD);

    MockRegistry public registry;
    MockOracle public oracle;
    MockERC20 public token;

    function setUp() public {
        registry = new MockRegistry();
        engine = new ValuationEngine(address(registry), admin);
        
        oracle = new MockOracle();
        token = new MockERC20();
        dummyToken = address(token);

        engine.setTokenPriceFeed(dummyToken, address(oracle));
    }

    function test_ComputeDPV_NormalConditions() public {
        uint256 quantity = 10_000e18; // 10k tokens
        uint256 unlockTime = block.timestamp + 30 days;

        (uint256 pv, uint256 ltvBps) = engine.computeDPV(
            quantity,
            dummyToken,
            unlockTime,
            dummyVesting
        );

        // 10k tokens * $1.00 = $10,000 gross
        // Wait, price * quantity = 10k USDC (6 decimals) -> 10,000,000,000
        assertTrue(pv > 0, "PV should be > 0");
        assertTrue(ltvBps > 0, "LTV should be > 0");
    }

    function test_BackendStub_UpdateRiskParams() public {
        // Test that the stub required by the DPV off-chain service doesn't revert
        vm.prank(admin);
        engine.grantRole(engine.GUARDIAN_ROLE(), admin);

        engine.updateRiskParams(
            dummyToken,
            1e18, // ewmaPrice
            9400, // lambdaBps
            0.4e18, // v30
            0.4e18, // v90
            0, // vImpl
            1_000_000e18, // dexLiq
            1000, // tokenPremium
            500  // liqPremium
        );
    }
}
