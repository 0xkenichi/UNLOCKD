// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockVestingToken.sol";

contract DeployUSDC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);
        MockVestingToken mUSDC = new MockVestingToken("Mock USDC", "mUSDC", 6);
        vm.stopBroadcast();

        console.log("MockUSDC deployed at:", address(mUSDC));
    }
}
