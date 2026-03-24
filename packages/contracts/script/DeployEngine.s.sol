// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ValuationEngine.sol";
import "../src/VestingRegistry.sol";

contract DeployEngine is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        
        // 1. Deploy Registry
        VestingRegistry registry = new VestingRegistry(deployer);
        console.log("VestingRegistry deployed at:", address(registry));

        // 2. Deploy Engine
        ValuationEngine engine = new ValuationEngine(address(registry), deployer);
        vm.stopBroadcast();

        console.log("ValuationEngine deployed at:", address(engine));
    }
}
