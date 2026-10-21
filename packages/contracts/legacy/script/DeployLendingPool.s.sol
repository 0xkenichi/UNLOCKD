// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/LendingPool.sol";

contract DeployLendingPool is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address insuranceFund = vm.envAddress("INSURANCE_FUND_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);
        LendingPool pool = new LendingPool(usdc, insuranceFund);
        vm.stopBroadcast();

        console.log("LendingPool deployed at:", address(pool));
    }
}
