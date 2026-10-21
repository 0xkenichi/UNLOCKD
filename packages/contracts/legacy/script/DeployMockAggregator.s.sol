// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockAggregator.sol";

contract DeployMockAggregator is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        MockAggregator agg = new MockAggregator(200000000, 8);
        vm.stopBroadcast();
        console.log("MockAggregator deployed at:", address(agg));
    }
}
