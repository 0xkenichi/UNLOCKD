// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockVestingToken.sol";
import "../src/MockSablierStream.sol";
import "../src/LendingPool.sol";
import "../src/wrappers/VestraWrapperNFT.sol";
import "../src/VestingAdapter.sol";
import "../src/LoanManager.sol";
import "../src/LoanOriginationFacet.sol";
import "../src/LoanRepaymentFacet.sol";
import "../src/ValuationEngine.sol";
import "../src/VestingRegistry.sol";
import "../src/AuctionFactory.sol";
import "../src/LiquidationAuction.sol";
import "../src/InsuranceVault.sol";
import "../src/LoanNFT.sol";
import "../src/LenderNFT.sol";
import "../src/IdentityVerifierMock.sol";
import "../src/mocks/MockSwapRouter.sol";

/**
 * @title DeployTestnet
 * @notice Full testnet deployment script for Vestra Protocol.
 *         Deploys all contracts in dependency order, configures all permissions,
 *         registers mock vesting contracts, and seeds initial liquidity.
 *
 * Usage:
 *   forge script script/DeployTestnet.s.sol --rpc-url $BASE_SEPOLIA_RPC \
 *     --broadcast --verify -vvvv
 *
 * Required env vars:
 *   DEPLOYER_PRIVATE_KEY  - deployer PK
 *   INSURANCE_FUND_ADDRESS - address to receive Insurance Vault ownership
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address insuranceFund = vm.envOr("INSURANCE_FUND_ADDRESS", deployer);

        vm.startBroadcast(deployerPrivateKey);

        // ─── 1. Mock Tokens ────────────────────────────────────────────────
        MockVestingToken mLDO  = new MockVestingToken("Mock Lido",  "mLDO",  18);
        MockVestingToken mAGIX = new MockVestingToken("Mock AGIX",  "mAGIX", 8);
        MockVestingToken mUSDC = new MockVestingToken("Mock USDC",  "mUSDC", 6);
        MockSablierStream mockSablier = new MockSablierStream();

        // ─── 2. Registry & Valuation ───────────────────────────────────────
        VestingRegistry  registry  = new VestingRegistry(deployer);
        ValuationEngine  valEngine = new ValuationEngine(address(registry), deployer);

        // ─── 3. Adapter & Wrapper NFT ──────────────────────────────────────
        VestraWrapperNFT wrapperNFT = new VestraWrapperNFT(deployer);
        VestingAdapter   adapter    = new VestingAdapter(address(registry), deployer);
        adapter.setWrapperNFT(address(wrapperNFT));
        wrapperNFT.setVestingAdapter(address(adapter));

        // ─── 4. Core Pool & Insurance ──────────────────────────────────────
        LendingPool    lendingPool    = new LendingPool(address(mUSDC), deployer);
        InsuranceVault insuranceVault = new InsuranceVault(address(mUSDC), deployer);

        // ─── 5. Auction Infrastructure ────────────────────────────────────
        AuctionFactory      auctionFactory     = new AuctionFactory(address(adapter), address(mUSDC), deployer);
        LiquidationAuction  liquidationAuction = new LiquidationAuction(address(adapter), address(mUSDC), deployer, deployer);
        auctionFactory.registerAuction("LIQUIDATION", address(liquidationAuction));
        liquidationAuction.setInsuranceVault(address(insuranceVault));

        // ─── 6. Mock Swap Router ──────────────────────────────────────────
        MockSwapRouter swapRouter = new MockSwapRouter();

        // ─── 7. Identity Verifier ─────────────────────────────────────────
        IdentityVerifierMock identityVerifier = new IdentityVerifierMock();

        // ─── 8. NFT Proofs ────────────────────────────────────────────────
        LoanNFT   loanNFT   = new LoanNFT();
        LenderNFT lenderNFT = new LenderNFT(deployer);

        // ─── 9. Loan Facets ───────────────────────────────────────────────
        LoanOriginationFacet originationFacet = new LoanOriginationFacet(deployer);
        LoanRepaymentFacet   repaymentFacet   = new LoanRepaymentFacet(deployer);

        // ─── 10. LoanManager ──────────────────────────────────────────────
        LoanManager loanManager = new LoanManager(
            address(valEngine),            // _valuation
            address(adapter),              // _adapter
            address(lendingPool),          // _pool
            address(identityVerifier),     // _identityVerifier
            200,                           // _identityBoostBps (2% LTV boost)
            address(auctionFactory),       // _auctionFactory
            address(swapRouter),           // _uniswapRouter
            3000,                          // _poolFee (0.3%)
            9500,                          // _slippageBps (95% min out)
            deployer                       // _initialGovernor
        );

        // ─── 11. Wire Facets ──────────────────────────────────────────────
        loanManager.setFacets(address(originationFacet), address(repaymentFacet));

        // ─── 12. NFT Permissions ──────────────────────────────────────────
        loanNFT.setLoanManager(address(loanManager));
        lenderNFT.setLoanManager(address(loanManager));
        loanManager.setLoanNFT(address(loanNFT));
        loanManager.setLenderNFT(address(lenderNFT));

        // ─── 13. Adapter ↔ LoanManager ───────────────────────────────────
        adapter.setLoanManager(address(loanManager));

        // ─── 14. Pool ↔ LoanManager ───────────────────────────────────────
        lendingPool.setLoanManager(address(loanManager));

        // ─── 15. Auction ↔ LoanManager ───────────────────────────────────
        liquidationAuction.setLoanManager(address(loanManager));

        // ─── 16. InsuranceVault Guardian ──────────────────────────────────
        bytes32 GUARDIAN_ROLE = insuranceVault.GUARDIAN_ROLE();
        insuranceVault.grantRole(GUARDIAN_ROLE, address(liquidationAuction));
        insuranceVault.grantRole(GUARDIAN_ROLE, address(loanManager));

        // ─── 17. PAUSER_ROLE on LoanManager (deployer for testnet) ───────
        bytes32 PAUSER_ROLE = loanManager.PAUSER_ROLE();
        loanManager.grantRole(PAUSER_ROLE, deployer);

        // ─── 18. ValuationEngine Coprocessor ─────────────────────────────
        valEngine.setCoprocessor(deployer);

        // ─── 19. Registry: vet MockSablier ───────────────────────────────
        bytes32 sablierHash = keccak256(address(mockSablier).code);
        registry.setVerifiedBytecode(sablierHash, true);
        registry.vetContract(address(mockSablier), 1); // Rank 1: Flagship

        // ─── 20. Sanctions whitelist for deployer ─────────────────────────
        // (testnet: allow deployer wallet to create loans immediately)
        loanManager.setSanctionsPass(deployer, true);

        // ─── 21. Seed Initial Liquidity ───────────────────────────────────
        mUSDC.mint(deployer, 2_000_000 * 1e6);

        // Seed lending pool
        mUSDC.approve(address(lendingPool), 100_000 * 1e6);
        lendingPool.deposit(100_000 * 1e6, LendingPool.DepositType.VARIABLE, 0);

        // Seed insurance vault (direct transfer — vault holds USDC as backstop)
        mUSDC.transfer(address(insuranceVault), 50_000 * 1e6);

        vm.stopBroadcast();

        // ─── Output addresses ─────────────────────────────────────────────
        console.log("=== Vestra Protocol Testnet Deployment ===");
        console.log("VestingRegistry:      ", address(registry));
        console.log("ValuationEngine:      ", address(valEngine));
        console.log("VestraWrapperNFT:     ", address(wrapperNFT));
        console.log("VestingAdapter:       ", address(adapter));
        console.log("LendingPool:          ", address(lendingPool));
        console.log("InsuranceVault:       ", address(insuranceVault));
        console.log("AuctionFactory:       ", address(auctionFactory));
        console.log("LiquidationAuction:   ", address(liquidationAuction));
        console.log("LoanOriginationFacet: ", address(originationFacet));
        console.log("LoanRepaymentFacet:   ", address(repaymentFacet));
        console.log("LoanManager:          ", address(loanManager));
        console.log("LoanNFT:              ", address(loanNFT));
        console.log("LenderNFT:            ", address(lenderNFT));
        console.log("IdentityVerifier:     ", address(identityVerifier));
        console.log("MockSwapRouter:       ", address(swapRouter));
        console.log("MockUSDC:             ", address(mUSDC));
        console.log("MockLDO:              ", address(mLDO));
        console.log("MockAGIX:             ", address(mAGIX));
        console.log("MockSablier:          ", address(mockSablier));
        console.log("==========================================");
    }
}
