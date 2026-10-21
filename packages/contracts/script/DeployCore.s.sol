// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../src/LendingPool.sol";
import "../src/LoanManager.sol";
import "../src/VestingAdapter.sol";
import "../src/ValuationEngine.sol";
import "../src/VestingRegistry.sol";
import "../src/InsuranceVault.sol";

/**
 * @notice Deploys and wires the Vestra core.
 *
 *   USDC_ADDRESS   USDC (or mock) token address              (required)
 *   FEE_RECIPIENT  treasury receiving origination fees        (default: deployer)
 *   GUARDIAN       guardian (Ω / freeze / pause) address      (default: deployer)
 *   GOVERNOR       final governor, ideally a TimelockController owned by a multisig.
 *                  If set, all roles are handed to it and the deployer renounces them.
 *
 *   forge script script/DeployCore.s.sol --rpc-url $RPC --broadcast
 */
contract DeployCore is Script {
    function run() external {
        address usdc = vm.envAddress("USDC_ADDRESS");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address feeRecipient = vm.envOr("FEE_RECIPIENT", deployer);
        address guardian = vm.envOr("GUARDIAN", deployer);
        address finalGovernor = vm.envOr("GOVERNOR", address(0));

        vm.startBroadcast(pk);

        VestingRegistry registry = new VestingRegistry(deployer);
        ValuationEngine valuation = new ValuationEngine(address(registry), deployer);
        VestingAdapter adapter = new VestingAdapter(deployer);
        LendingPool pool = new LendingPool(IERC20(usdc), deployer);
        InsuranceVault insurance = new InsuranceVault(IERC20(usdc), deployer);
        LoanManager manager = new LoanManager(
            IERC20(usdc),
            ILendingPool(address(pool)),
            adapter,
            IValuationEngine(address(valuation)),
            IInsuranceVault(address(insurance)),
            feeRecipient,
            deployer
        );

        // One-time wiring — cannot be changed afterwards.
        adapter.setLoanManager(address(manager));
        pool.setLoanManager(address(manager));
        insurance.setLoanManager(address(manager));

        bytes32 guardianRole = valuation.GUARDIAN_ROLE();
        valuation.grantRole(guardianRole, guardian);
        registry.grantRole(guardianRole, guardian);
        pool.grantRole(guardianRole, guardian);
        manager.grantRole(guardianRole, guardian);

        if (finalGovernor != address(0)) {
            _handOver(address(registry), finalGovernor, deployer);
            _handOver(address(valuation), finalGovernor, deployer);
            _handOver(address(pool), finalGovernor, deployer);
            _handOver(address(insurance), finalGovernor, deployer);
            _handOver(address(manager), finalGovernor, deployer);
            _handOver(address(adapter), finalGovernor, deployer);
        }

        vm.stopBroadcast();

        console2.log("VestingRegistry ", address(registry));
        console2.log("ValuationEngine ", address(valuation));
        console2.log("VestingAdapter  ", address(adapter));
        console2.log("LendingPool     ", address(pool));
        console2.log("InsuranceVault  ", address(insurance));
        console2.log("LoanManager     ", address(manager));
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
