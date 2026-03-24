// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockVestingToken.sol";
import "../src/MockSablierStream.sol";
import "../src/LendingPool.sol";
import "../src/VestraWrapperNFT.sol";
import "../src/LoanManager.sol";
import "../src/ValuationEngine.sol";
import "../src/VestingRegistry.sol";

contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address insuranceFund = vm.envAddress("INSURANCE_FUND_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mocks
        MockVestingToken mLDO = new MockVestingToken("Mock Lido", "mLDO", 18);
        MockVestingToken mAGIX = new MockVestingToken("Mock AGIX", "mAGIX", 8);
        MockVestingToken mUSDC = new MockVestingToken("Mock USDC", "mUSDC", 6);
        MockSablierStream mockSablier = new MockSablierStream();

        // 2. Deploy Infrastructure
        VestingRegistry registry = new VestingRegistry(deployer);
        ValuationEngine valEngine = new ValuationEngine(address(registry), deployer);

        // 3. Core Protocol
        LendingPool lendingPool = new LendingPool(address(mUSDC), insuranceFund);
        VestraWrapperNFT wrapperNFT = new VestraWrapperNFT();
        LoanManager loanManager = new LoanManager(
            address(valEngine),
            address(lendingPool),
            address(wrapperNFT),
            address(mUSDC)
        );

        // 4. Permissions & Role Setup
        
        // LendingPool -> LoanManager
        lendingPool.grantLoanManager(address(loanManager));
        
        // WrapperNFT -> LoanManager
        wrapperNFT.grantLoanManager(address(loanManager));
        
        // LoanManager -> Relayer (Deployer for testnet)
        loanManager.grantRelayer(deployer);
        
        // ValuationEngine -> Guardian/Coprocessor (Deployer for testnet)
        valEngine.setCoprocessor(deployer);

        // 5. Initial Seed for totalDeposited check
        mUSDC.mint(deployer, 1_000_000 * 1e6);
        mUSDC.approve(address(lendingPool), 100_000 * 1e6);
        lendingPool.deposit(100_000 * 1e6, 30 days);

        // 6. Registry Setup: Verify MockSablier Bytecode & Vet it
        bytes32 sablierHash = keccak256(address(mockSablier).code);
        registry.setVerifiedBytecode(sablierHash, true);
        registry.vetContract(address(mockSablier), 1); // Rank 1: Flagship

        vm.stopBroadcast();

        console.log("VestingRegistry:", address(registry));
        console.log("ValuationEngine:", address(valEngine));
        console.log("LendingPool:", address(lendingPool));
        console.log("LoanManager:", address(loanManager));
        console.log("VestraWrapperNFT:", address(wrapperNFT));
        console.log("MockSablier:", address(mockSablier));
        console.log("MockUSDC:", address(mUSDC));
        console.log("MockLDO:", address(mLDO));
        console.log("MockAGIX:", address(mAGIX));
    }
}
