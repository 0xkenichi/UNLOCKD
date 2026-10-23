// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../src/LendingPool.sol";
import "../src/VestingAdapter.sol";
import "../src/InsuranceVault.sol";
import "../src/v2/CreditEngineV2.sol";
import "../src/v2/RiskOracle.sol";
import "../src/v2/BackstopVault.sol";
import "../src/v2/LoanManagerV2.sol";

/**
 * @notice Deploys and wires the Vestra v2 loan book: its own pool, adapter, insurance vault,
 *         credit engine, risk oracle, backstop vault and loan manager. It shares nothing with v1.
 *
 *   USDC_ADDRESS   USDC (or mock) token address              (required)
 *   FEE_RECIPIENT  treasury receiving origination fees        (default: deployer)
 *   GUARDIAN       guardian (Ω cuts, pause)                   (default: deployer)
 *   RISK_POSTER    service posting σ, volume and unlock drag  (default: deployer)
 *   GOVERNOR       final governor, ideally a TimelockController owned by a multisig.
 *                  If set, every governor and admin role is handed to it and the deployer
 *                  renounces them.
 *
 *   forge script script/DeployV2.s.sol --rpc-url $RPC --broadcast
 *
 * After deploying, the governor still has to: whitelist vesting contracts on the adapter, list
 * tokens on the oracle (with their initial Ω), name each token's partner on the backstop vault,
 * and grant PAYDOWN_BUYER_ROLE to vetted buyers.
 */
contract DeployV2 is Script {
    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        address guardian = vm.envOr("GUARDIAN", deployer);
        address poster = vm.envOr("RISK_POSTER", deployer);
        address finalGovernor = vm.envOr("GOVERNOR", address(0));

        vm.startBroadcast(pk);

        VestingAdapter adapter = new VestingAdapter(deployer);
        LendingPool pool = new LendingPool(IERC20(usdc), deployer);
        InsuranceVault insurance = new InsuranceVault(IERC20(usdc), deployer);
        CreditEngineV2 engine = new CreditEngineV2();
        RiskOracle oracle = new RiskOracle(deployer);
        BackstopVault backstop = new BackstopVault(IERC20(usdc), deployer);
        LoanManagerV2 manager = new LoanManagerV2(
            IERC20(usdc), ILendingPoolV2(address(pool)), adapter, engine, oracle, backstop,
            IInsuranceVaultV2(address(insurance)), feeRecipient, deployer
        );

        // One-time wiring — cannot be changed afterwards.
        adapter.setLoanManager(address(manager));
        pool.setLoanManager(address(manager));
        insurance.setLoanManager(address(manager));
        backstop.setLoanManager(address(manager));

        bytes32 guardianRole = keccak256("GUARDIAN_ROLE");
        oracle.grantRole(guardianRole, guardian);
        pool.grantRole(guardianRole, guardian);
        manager.grantRole(guardianRole, guardian);
        oracle.grantRole(oracle.RISK_POSTER_ROLE(), poster);

        if (finalGovernor != address(0)) {
            _handOver(address(adapter), finalGovernor, deployer);
            _handOver(address(pool), finalGovernor, deployer);
            _handOver(address(insurance), finalGovernor, deployer);
            _handOver(address(oracle), finalGovernor, deployer);
            _handOver(address(backstop), finalGovernor, deployer);
            _handOver(address(manager), finalGovernor, deployer);
        }

        vm.stopBroadcast();

        console2.log("VestingAdapter  ", address(adapter));
        console2.log("LendingPool     ", address(pool));
        console2.log("InsuranceVault  ", address(insurance));
        console2.log("CreditEngineV2  ", address(engine));
        console2.log("RiskOracle      ", address(oracle));
        console2.log("BackstopVault   ", address(backstop));
        console2.log("LoanManagerV2   ", address(manager));
    }

    function _handOver(address target, address governor, address deployer) internal {
        AccessControl ac = AccessControl(target);
        bytes32 gov = keccak256("GOVERNOR_ROLE");
        ac.grantRole(gov, governor);
        ac.grantRole(ac.DEFAULT_ADMIN_ROLE(), governor);
        ac.renounceRole(gov, deployer);
        ac.renounceRole(ac.DEFAULT_ADMIN_ROLE(), deployer);
    }
}
