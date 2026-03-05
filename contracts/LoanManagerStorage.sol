// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./ValuationEngine.sol";
import "./VestingAdapter.sol";
import "./LendingPool.sol";
import "./AuctionFactory.sol";
import "./InsuranceVault.sol";
import "./DistressedDebtBond.sol";
import "./IsolatedLendingPool.sol";

// Interfaces
interface IIdentityVerifier {
    function verifyProof(address user, bytes calldata proof) external returns (bool);
}

interface IStagedTrancheAuction {
    function _initializeTranche(uint256 auctionId, uint256 tranches, uint256 interval) external;
}

/**
 * @title LoanManagerStorage
 * @notice V7.0 Citadel Pivot: Abstract contract holding all state variables, structs, and mappings
 * to allow LoanOriginationFacet and LoanRepaymentFacet to share state without triggering EIP-170 limits.
 */
abstract contract LoanManagerStorage is Ownable, Pausable, ReentrancyGuard {
    ValuationEngine public valuation;
    VestingAdapter public adapter;
    LendingPool public pool;
    address public identityVerifier;
    uint256 public identityBoostBps;
    AuctionFactory public auctionFactory;
    ISwapRouter public uniswapRouter;
    IERC20 public usdc;
    uint24 public poolFee;
    uint256 public liquidationSlippageBps;
    address public issuanceTreasury;
    address public returnsTreasury;
    uint256 public originationFeeBps;
    bool public adminTimelockEnabled;
    uint256 public adminTimelockDelay = 1 days;
    uint256 public autoRepayLtvBoostBps;
    uint256 public autoRepayInterestDiscountBps;
    uint256 public dynamicBorrowRateBps = 800; // V8.0 MeTTa: 8% default systemic rate


    // V4.0 Auto-Hedge Vault configurations
    InsuranceVault public insuranceVault;
    uint256 public autoHedgeBps = 500; // 5%
    
    // V6.0 Citadel Distressed Debt Bonds (ERC-721)
    DistressedDebtBond public distressedDebtBond;

    // V6.0 Citadel: Rank-based Isolated Lending Pools (ERC-4626 standard tranches)
    mapping(uint8 => IsolatedLendingPool) public isolatedPools;

    struct PendingTreasuryConfig {
        address issuanceTreasury;
        address returnsTreasury;
        uint256 executeAfter;
        bool exists;
    }

    struct PendingLiquidationConfig {
        address router;
        uint24 poolFee;
        uint256 slippageBps;
        uint256 executeAfter;
        bool exists;
    }

    PendingTreasuryConfig public pendingTreasuryConfig;
    PendingLiquidationConfig public pendingLiquidationConfig;

    uint256 public constant BPS_DENOMINATOR = 10000;

    struct Loan {
        address borrower;
        uint256 principal;
        uint256 interest;
        uint256 collateralId;
        uint256 collateralAmount;
        uint256 loanDuration;
        uint256 unlockTime;
        uint256 hedgeAmount; // V4.0 Risk Insurance
        bool active;
    }

    struct PrivateLoan {
        address vault;
        uint256 principal;
        uint256 interest;
        uint256 collateralId;
        uint256 collateralAmount;
        uint256 loanDuration;
        uint256 unlockTime;
        uint256 hedgeAmount; // V4.0 Risk Insurance
        bool active;
    }

    mapping(uint256 => Loan) public loans;
    mapping(uint256 => PrivateLoan) public privateLoans;
    uint256 public loanCount;
    mapping(address => bool) public identityLinked;
    mapping(address => uint256) public repayTokenPriority;
    address[] public repayTokens;
    mapping(address => bool) public autoRepayOptIn;
    address[] public autoRepayRequiredTokens;
    
    mapping(uint256 => uint256) public loanDeficits;
    mapping(address => bool) public sanctionsPass;

    mapping(address => address) public tokenTreasuries;
    mapping(uint256 => bool) public inOTCBuyback;
    mapping(uint256 => uint256) public otcBuybackDeadline;

    mapping(address => uint256) public currentGlobalExposure;

    // V7.0 Facet Router Addresses
    address public originationFacet;
    address public repaymentFacet;

    // --- EVENTS ---
    event TokenTreasurySet(address indexed token, address indexed treasury);
    event OTCBuybackExecuted(uint256 indexed loanId, address indexed treasury, uint256 amountPaid);
    event OTCBuybackInitiated(uint256 indexed loanId, address indexed token, uint256 deadline);
    event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event PrivateLoanCreated(uint256 indexed loanId, address indexed vault, uint256 amount);
    event LoanRepaid(uint256 indexed loanId, uint256 amount);
    event PrivateLoanRepaid(uint256 indexed loanId, uint256 amount);
    event LoanRepaidWithSwap(
        uint256 indexed loanId,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 usdcReceived
    );
    event LoanSettled(uint256 indexed loanId, bool defaulted);
    event PrivateLoanSettled(uint256 indexed loanId, bool defaulted);
    event IdentityLinked(address indexed borrower, uint256 boostBps);
    event IdentityConfigUpdated(address verifier, uint256 boostBps);
    event LiquidationConfigUpdated(address router, uint24 poolFee, uint256 slippageBps);
    event TreasuryConfigUpdated(address issuanceTreasury, address returnsTreasury);
    event RepayTokenPriorityUpdated(address[] tokens);
    event OriginationFeeUpdated(uint256 originationFeeBps);
    event AdminTimelockConfigUpdated(bool enabled, uint256 delaySeconds);
    event TreasuryConfigQueued(address issuanceTreasury, address returnsTreasury, uint256 executeAfter);
    event TreasuryConfigCancelled();
    event LiquidationConfigQueued(address router, uint24 poolFee, uint256 slippageBps, uint256 executeAfter);
    event LiquidationConfigCancelled();
    event CollateralLiquidated(
        uint256 indexed loanId,
        address indexed token,
        uint256 seizedAmount,
        uint256 usdcReceived
    );
    event AutoRepayOptInUpdated(address indexed borrower, bool enabled);
    event AutoRepayConfigUpdated(uint256 ltvBoostBps, uint256 interestDiscountBps);
    event AutoRepayRequiredTokensUpdated(address[] tokens);
    event SanctionsStatusUpdated(address indexed account, bool passed);
    event AutoHedgeConfigured(address indexed vault, uint256 bps);
    event AutoHedgeDiverted(uint256 indexed loanId, uint256 amount);
    event DeficitSwept(uint256 indexed loanId, address indexed token, uint256 amountSeized, uint256 usdcValue);
    event DynamicRateUpdated(uint256 rateBps);


    // --- ERRORS ---
    error Unauthorized();
    error LoanInactive();
    error LoanAlreadyPaid();
    error ZeroAmount();
    error ExceedsLTV();
    error LoanOutlastsVesting();
    error InvalidToken();
    error TokenNotAllowed();
    error NoVerifier();
    error InvalidProof();
    error TimelockPending();
    error NoQueuedConfig();
    error TimelockDisabled();
    error BadSlippage();
    error AutoRepayDisabled();
    error MissingRepayPermissions();
    error LengthMismatch();
    error PriorityOrder();
    error TooManyTokens();
    error CircuitBreakerTripped();
    error OTCWindowClosed();
    error OTCWindowExpired();
    error UnauthorizedTreasury();
    error NoCollateralToBuy();
    error GlobalExposureCapExceeded();
}
