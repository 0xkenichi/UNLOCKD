// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ValuationEngine.sol";
import "../src/LoanManager.sol";
import "../src/LendingPool.sol";
import "../src/VestraWrapperNFT.sol";
import "../src/VestingRegistry.sol";

contract DeployPhased is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        // Load from environment to avoid checksum issues
        address registryAddr = vm.envAddress("VESTING_REGISTRY_ADDRESS");
        address lendingPoolAddr = vm.envAddress("LENDING_POOL_ADDRESS");
        address wrapperNFTAddr = vm.envAddress("WRAPPER_NFT_ADDRESS");
        address usdcAddr = vm.envAddress("MOCK_USDC_ADDRESS");

        vm.startBroadcast(pk);

        // 1. Deploy ValuationEngine (Fixed)
        ValuationEngine valEngine = new ValuationEngine(registryAddr, deployer);
        
        // 2. Deploy LoanManager (Pointing to new ValEngine)
        LoanManager loanManager = new LoanManager(
            address(valEngine),
            lendingPoolAddr,
            wrapperNFTAddr,
            usdcAddr
        );

        // 3. Set Permissions
        LendingPool(lendingPoolAddr).grantRole(keccak256("LOAN_MANAGER_ROLE"), address(loanManager));
        VestraWrapperNFT(wrapperNFTAddr).grantRole(keccak256("MINTER_ROLE"), address(loanManager));

        vm.stopBroadcast();

        console.log("New ValuationEngine:", address(valEngine));
        console.log("New LoanManager:", address(loanManager));
    }
}
