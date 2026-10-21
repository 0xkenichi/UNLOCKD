// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ValuationEngine.sol";

contract SetFeeds is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address valEngine = vm.envAddress("VAL_ENGINE");
        address ldo = vm.envAddress("MOCK_LDO_ADDRESS");
        address agix = vm.envAddress("MOCK_AGIX_ADDRESS");
        address agg = 0x5e3d1f583354bCE6a10f35Dbc22E8a2A9a8FA73C;

        vm.startBroadcast(pk);
        ValuationEngine(valEngine).setTokenPriceFeed(ldo, agg);
        ValuationEngine(valEngine).setTokenPriceFeed(agix, agg);
        vm.stopBroadcast();
    }
}
