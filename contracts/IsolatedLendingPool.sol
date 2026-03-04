// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title IsolatedLendingPool
 * @notice V6.0 Citadel - ERC-4626 implementation for Tiered Lending
 * Allows LPs to deposit USDC into specific risk tranches (e.g. Flagship vs Standard)
 * and receive yield-bearing vault shares (e.g. vUSDC-Flagship), completely isolating
 * contagion risk from lower-tier collateral defaults.
 */
contract IsolatedLendingPool is ERC4626, Ownable, Pausable, ReentrancyGuard {
    address public loanManager;
    uint256 public totalBorrowed;
    
    // Interest Rate Model
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public lowUtilizationThresholdBps = 4000;
    uint256 public highUtilizationThresholdBps = 7500;
    uint256 public lowUtilizationRateBps = 1200;
    uint256 public midUtilizationRateBps = 1800;
    uint256 public highUtilizationRateBps = 2600;

    event LoanManagerUpdated(address indexed manager);
    event Lent(address indexed borrower, uint256 amount);
    event Repaid(uint256 principal, uint256 interest);

    constructor(
        IERC20 _asset,
        string memory _name,
        string memory _symbol
    ) ERC4626(_asset) ERC20(_name, _symbol) Ownable(msg.sender) {}

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "Not LoanManager");
        _;
    }

    function setLoanManager(address _manager) external onlyOwner {
        require(_manager != address(0), "Zero address");
        loanManager = _manager;
        emit LoanManagerUpdated(_manager);
    }

    /**
     * @notice Utilized by LoanManager to draw liquidity for new loans within this Tier.
     */
    function lend(address borrower, uint256 amount) external onlyLoanManager whenNotPaused nonReentrant {
        require(totalAssets() - totalBorrowed >= amount, "Insufficient liquidity");
        totalBorrowed += amount;
        
        // Transfer the underlying asset from the pool to the borrower
        SafeERC20.safeTransfer(IERC20(asset()), borrower, amount);
        
        emit Lent(borrower, amount);
    }

    /**
     * @notice Utilized by LoanManager to route principal + interest back into the vault.
     */
    function repay(uint256 principal, uint256 interest) external onlyLoanManager nonReentrant {
        require(totalBorrowed >= principal, "Repaying more than borrowed");
        totalBorrowed -= principal;
        
        uint256 totalRepayment = principal + interest;
        
        // Pull the funds from the LoanManager (who pulled from the user) into this vault.
        SafeERC20.safeTransferFrom(IERC20(asset()), msg.sender, address(this), totalRepayment);
        
        // The interest naturally increases totalAssets() without minting new shares, 
        // increasing the share price (yield) for all current LPs in this tranche.
        emit Repaid(principal, interest);
    }

    /**
     * @notice Returns the current interest rate based on tier utilization
     */
    function getInterestRateBps(uint256) external view returns (uint256) {
        uint256 totalDeposit = totalAssets();
        if (totalDeposit == 0) return lowUtilizationRateBps;

        uint256 utilizationBps = (totalBorrowed * BPS_DENOMINATOR) / totalDeposit;

        if (utilizationBps <= lowUtilizationThresholdBps) {
            return lowUtilizationRateBps;
        } else if (utilizationBps <= highUtilizationThresholdBps) {
            return midUtilizationRateBps;
        } else {
            return highUtilizationRateBps;
        }
    }

    // --- ERC4626 Override Defenses ---

    /**
     * @dev Overridden to reflect true liquid assets available for withdrawal.
     * Total Assets = (Cash in contract) + (Currently Borrowed Out)
     */
    function totalAssets() public view override returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) + totalBorrowed;
    }
    
    /**
     * @dev Liquid assets available for immediate withdrawal.
     */
    function liquidAssets() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 maxW = super.maxWithdraw(owner);
        uint256 liquid = liquidAssets();
        return maxW > liquid ? liquid : maxW;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 maxR = super.maxRedeem(owner);
        uint256 liquid = liquidAssets();
        uint256 sharesForLiquid = previewDeposit(liquid); // Approx reverse rounding
        return maxR > sharesForLiquid ? sharesForLiquid : maxR;
    }
}
