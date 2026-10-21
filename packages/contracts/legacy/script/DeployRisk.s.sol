// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/GlobalRiskModule.sol";

contract DeployRisk is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        
        address loanManagerAddr = 0xf70A3B29cf5F806B4b7D2D397376eA7161339b1D;

        vm.startBroadcast(deployerKey);

        GlobalRiskModule riskModule = new GlobalRiskModule(loanManagerAddr, deployer);

        vm.stopBroadcast();

        console.log("GlobalRiskModule deployed at:", address(riskModule));
    }
}
