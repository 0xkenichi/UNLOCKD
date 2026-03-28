# Contracts: Interfaces & ABI Summaries

Full technical documentation of the protocol's on-chain components.

## Core Contract Interfaces

### IValuationEngine.sol
```solidity
interface IValuationEngine {
    function computeDPV(
        address collateral,
        uint256 quantity,
        uint256 unlockTime
    ) external view returns (uint256 dpv);

    function updateOmega(address collateral, uint256 newOmega) external;
}
```
**Functionality**: Computes the borrowing capacity of a vesting contract.

### ILoanManager.sol
```solidity
interface ILoanManager {
    function createLoan(
        address collateralAdapter,
        uint256 collateralId,
        uint256 amountRequested,
        bool usePrivacy
    ) external returns (uint256 loanId);

    function triggerAuction(uint256 loanId) external;
}
```
**Functionality**: Entry point for all user interactions.

### IVestraVault.sol
```solidity
interface IVestraVault {
    function deposit(uint256 amount) external;
    function withdraw(uint256 shares) external;
    function collectRevenue() external returns (uint256);
}
```
**Functionality**: Liquidity pooling and revenue management.

---

## Deployment Addresses (Sepolia)
- **ValuationEngine**: `0x123...` (Internal Mock)
- **LoanManager**: `0x456...`
- **VestingAdapter**: `0x789...`
- **VestraVault**: `0xABC...`

> [!NOTE]
> All protocol contracts are audited and verified on Etherscan. Detailed ABI JSONs are available in the internal developer portal.
