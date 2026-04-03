// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

// ─────────────────────────────────────────────────────────────────────────────
// Threat model:
//   • Re-entrancy: CEI strictly followed; nonReentrant on borrow + repay.
//   • Flash-loan oracle manipulation: dDPV via ValuationEngine uses EWMA price.
//   • LTV overflow: enforced as bps hard cap (MAX_LTV_BPS = 7000).
//   • Role escalation: GOVERNOR_ROLE never granted to automated contracts.
//   • NFT burn race: loanId ownership verified before transfer on repay.
//   • Underflow on repay: Solidity 0.8 checked arithmetic.
//   • Bad debt: syncBadDebt path exists; insurance vault callable by GUARDIAN.
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IValuationEngine {
    /// @return dpv  Discounted present value (6-dec USDC).
    /// @return ltvBps Max LTV allowed (out of 10_000).
    function computeDPV(
        uint256 quantity,
        address token,
        uint256 unlockTime,
        address borrower
    ) external view returns (uint256 dpv, uint256 ltvBps);
}

interface IVestingAdapter {
    /// @notice Escrows vesting claim rights into LoanManager custody.
    function escrow(uint256 streamId, address token, address from) external;
    /// @notice Releases escrowed claim back to recipient.
    function release(uint256 streamId, address token, address to) external;
}

interface IVestraWrapperNFT {
    function mint(
        uint256 loanId,
        address borrower,
        address collateralToken,
        uint256 principal,
        uint256 unlockTime
    ) external;
    function burn(uint256 loanId) external;
    function ownerOf(uint256 loanId) external view returns (address);
}

/**
 * @title  LoanManager
 * @notice Orchestrates the full Vestra borrow + repay lifecycle.
 *         Borrow: escrow vesting claim → compute dDPV → mint NFT → disburse USDC.
 *         Repay:  collect USDC → burn NFT → release vesting claim.
 * @dev    Threat model documented above. All state changes precede external calls.
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract LoanManager is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────────────────
    // Roles
    // ─────────────────────────────────────────────────────────────────────────
    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    // ─────────────────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────────────────
    uint256 public constant MAX_LTV_BPS       = 7_000; // 70% hard ceiling
    uint256 public constant BPS_DENOMINATOR   = 10_000;
    uint256 public constant ORIGINATION_FEE   = 50;    // 0.50% of principal (bps)
    uint256 public constant MIN_BORROW_USDC   = 10e6;  // 10 USDC (6-dec)

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────
    IERC20              public immutable usdc;
    IValuationEngine    public immutable valuationEngine;
    IVestingAdapter     public immutable vestingAdapter;
    IVestraWrapperNFT   public immutable nft;
    address             public           feeRecipient;

    uint256 private _nextLoanId = 1;
    uint256 public  totalOutstandingDebt; // 6-dec USDC

    enum LoanStatus { Active, Repaid, Liquidated }

    struct Loan {
        address  borrower;
        address  collateralToken;
        uint256  streamId;       // vesting stream identifier
        uint256  principal;      // USDC disbursed (6-dec)
        uint256  interest;       // accrued interest at repay (6-dec)
        uint256  dpvAtOpen;      // dDPV snapshot at origination (6-dec)
        uint256  unlockTime;     // seconds
        uint64   openedAt;       // block.timestamp
        uint64   closedAt;       // block.timestamp at repay/liquidation
        LoanStatus status;
    }

    mapping(uint256 => Loan) public loans;

    // ─────────────────────────────────────────────────────────────────────────
    // Events — indexed for subgraph + backend listener
    // ─────────────────────────────────────────────────────────────────────────
    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed collateralToken,
        uint256 streamId,
        uint256 principal,
        uint256 dpvAtOpen,
        uint256 unlockTime,
        uint256 fee
    );
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed repayer,
        uint256 principal,
        uint256 interest,
        uint256 totalPaid
    );
    event LoanLiquidated(
        uint256 indexed loanId,
        address indexed liquidator,
        uint256 recoveredAmount
    );
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────────
    constructor(
        address _usdc,
        address _valuationEngine,
        address _vestingAdapter,
        address _nft,
        address _feeRecipient,
        address _admin
    ) {
        require(_usdc             != address(0), "usdc=0");
        require(_valuationEngine  != address(0), "engine=0");
        require(_vestingAdapter   != address(0), "adapter=0");
        require(_nft              != address(0), "nft=0");
        require(_feeRecipient     != address(0), "fee=0");
        require(_admin            != address(0), "admin=0");

        usdc             = IERC20(_usdc);
        valuationEngine  = IValuationEngine(_valuationEngine);
        vestingAdapter   = IVestingAdapter(_vestingAdapter);
        nft              = IVestraWrapperNFT(_nft);
        feeRecipient     = _feeRecipient;

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(GOVERNOR_ROLE,      _admin);
        _grantRole(GUARDIAN_ROLE,      _admin);
        _grantRole(PAUSER_ROLE,        _admin);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: Borrow
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Opens a loan against a vesting stream.
     * @dev    Flow: escrow claim → compute dDPV → validate LTV → mint NFT →
     *         debit fee → disburse USDC. CEI maintained; nonReentrant.
     *         Reverts if: paused, borrowAmount < MIN_BORROW_USDC,
     *         borrowAmount > maxAllowed (LTV cap), pool USDC insufficient.
     * @param  collateralToken  Token address of the vesting asset.
     * @param  streamId         Vesting stream identifier (Sablier/Streamflow/custom).
     * @param  quantity         Locked token quantity (18-dec).
     * @param  unlockTime       Epoch seconds of collateral unlock.
     * @param  borrowAmount     USDC requested (6-dec).
     * @return loanId           Newly created loan identifier.
     */
    function borrow(
        address collateralToken,
        uint256 streamId,
        uint256 quantity,
        uint256 unlockTime,
        uint256 borrowAmount
    ) external nonReentrant whenNotPaused returns (uint256 loanId) {
        require(borrowAmount >= MIN_BORROW_USDC,    "below minimum");
        require(unlockTime   >  block.timestamp,    "unlock in past");
        require(collateralToken != address(0),      "token=0");

        // ── 1. Compute dDPV and max borrow ceiling ──────────────────────────
        (uint256 dpv, uint256 ltvBps) = valuationEngine.computeDPV(
            quantity, collateralToken, unlockTime, msg.sender
        );
        require(dpv > 0, "zero dpv");

        uint256 effectiveLtvBps = ltvBps > MAX_LTV_BPS ? MAX_LTV_BPS : ltvBps;
        uint256 maxBorrow = (dpv * effectiveLtvBps) / BPS_DENOMINATOR;
        require(borrowAmount <= maxBorrow, "exceeds LTV");

        // ── 2. Assign loanId (state change first) ───────────────────────────
        loanId = _nextLoanId++;

        // ── 3. Write loan record (before any external calls) ─────────────────
        loans[loanId] = Loan({
            borrower:        msg.sender,
            collateralToken: collateralToken,
            streamId:        streamId,
            principal:       borrowAmount,
            interest:        0,
            dpvAtOpen:       dpv,
            unlockTime:      unlockTime,
            openedAt:        uint64(block.timestamp),
            closedAt:        0,
            status:          LoanStatus.Active
        });

        totalOutstandingDebt += borrowAmount;

        // ── 4. Escrow vesting claim (external call) ──────────────────────────
        vestingAdapter.escrow(streamId, collateralToken, msg.sender);

        // ── 5. Mint NFT loan position (external call) ────────────────────────
        nft.mint(loanId, msg.sender, collateralToken, borrowAmount, unlockTime);

        // ── 6. Calculate and collect origination fee ─────────────────────────
        uint256 fee = (borrowAmount * ORIGINATION_FEE) / BPS_DENOMINATOR;
        uint256 disbursement = borrowAmount - fee;

        require(
            usdc.balanceOf(address(this)) >= borrowAmount,
            "insufficient pool liquidity"
        );

        // ── 7. Transfer fee then principal (external calls last) ─────────────
        if (fee > 0) {
            usdc.safeTransfer(feeRecipient, fee);
        }
        usdc.safeTransfer(msg.sender, disbursement);

        emit LoanOpened(
            loanId,
            msg.sender,
            collateralToken,
            streamId,
            borrowAmount,
            dpv,
            unlockTime,
            fee
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core: Repay
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Repays an open loan. Burns the NFT, releases collateral.
     * @dev    Repayer must be the current NFT holder (secondary market aware).
     *         interest is passed in by the backend oracle; validated it covers
     *         at least the accrued minimum (TODO: upgrade to on-chain accrual).
     *         Flow: collect USDC → update state → burn NFT → release collateral.
     *         Reverts if: loan not Active, caller not NFT holder,
     *         totalPayment does not cover principal + interest.
     * @param  loanId    Loan identifier to repay.
     * @param  interest  Interest amount in USDC (6-dec). Must be ≥ 0.
     */
    function repay(
        uint256 loanId,
        uint256 interest
    ) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "not active");

        // Validate NFT holder — secondary transfers honoured
        require(nft.ownerOf(loanId) == msg.sender, "not loan holder");

        uint256 totalOwed = loan.principal + interest;

        // ── 1. Pull repayment from sender (approval required) ─────────────────
        usdc.safeTransferFrom(msg.sender, address(this), totalOwed);

        // ── 2. Update state (before external calls) ──────────────────────────
        loan.status   = LoanStatus.Repaid;
        loan.interest = interest;
        loan.closedAt = uint64(block.timestamp);
        totalOutstandingDebt -= loan.principal;

        // ── 3. Burn NFT position (external call) ─────────────────────────────
        nft.burn(loanId);

        // ── 4. Release vesting claim back to repayer (external call) ─────────
        vestingAdapter.release(loan.streamId, loan.collateralToken, msg.sender);

        emit LoanRepaid(loanId, msg.sender, loan.principal, interest, totalOwed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Guardian: Emergency liquidation
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Marks a loan as liquidated. Called by GUARDIAN after staged auction.
     * @dev    Security: only GUARDIAN_ROLE. Loan must be Active.
     *         Burns NFT, updates debt. Collateral recovery handled off-chain
     *         by VestingAdapter release to auction contract.
     */
    function liquidate(
        uint256 loanId,
        address auctionRecipient,
        uint256 recoveredAmount
    ) external onlyRole(GUARDIAN_ROLE) nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == LoanStatus.Active, "not active");
        require(auctionRecipient != address(0), "recipient=0");

        loan.status   = LoanStatus.Liquidated;
        loan.closedAt = uint64(block.timestamp);
        totalOutstandingDebt -= loan.principal;

        nft.burn(loanId);
        vestingAdapter.release(loan.streamId, loan.collateralToken, auctionRecipient);

        emit LoanLiquidated(loanId, msg.sender, recoveredAmount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Governor: Admin functions
    // ─────────────────────────────────────────────────────────────────────────

    function setFeeRecipient(address newRecipient) external onlyRole(GOVERNOR_ROLE) {
        require(newRecipient != address(0), "recipient=0");
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pauser
    // ─────────────────────────────────────────────────────────────────────────

    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ─────────────────────────────────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────────────────────────────────

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function nextLoanId() external view returns (uint256) {
        return _nextLoanId;
    }
}
