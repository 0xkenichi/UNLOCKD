// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ValuationEngine.sol";

contract DeployEngineMinimal is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registryAddr = vm.envAddress("VESTING_REGISTRY_ADDRESS");
        vm.startBroadcast(pk);
        ValuationEngine engine = new ValuationEngine(registryAddr, vm.addr(pk));
        vm.stopBroadcast();
        console.log("Minimal ValuationEngine deployed at:", address(engine));
    }
}
