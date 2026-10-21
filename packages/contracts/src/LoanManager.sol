// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./governance/VestraAccessControl.sol";
import "./VestingAdapter.sol";

interface IValuationEngine {
    function computeDPV(uint256 quantity, address token, uint256 unlockTime, address vestingContract)
        external view returns (uint256 pv, uint256 ltvBps);
    function liquidationValue(uint256 quantity, address token, uint256 unlockTime, address vestingContract)
        external view returns (uint256);
    function spotValue(uint256 quantity, address token) external view returns (uint256);
    function rankOf(address vestingContract) external view returns (uint8);
    function rankBaseLtvBps(uint256 rank) external view returns (uint256);
}

interface ILendingPool {
    function lend(address to, uint256 amount) external;
    function repay(uint256 principal, uint256 interest) external;
    function writeOff(uint256 principal) external;
    function borrowRateAfter(uint256 amount) external view returns (uint256);
}

interface IInsuranceVault {
    function cover(uint256 amount) external returns (uint256 paid);
}

/**
 * @title  LoanManager
 * @notice The single loan lifecycle contract for Vestra.
 *
 *         borrow → (interest accrues per second) → repay → collateral returned
 *         default → startLiquidation → Dutch auction → bid → settle
 *
 *         Loans are non-recourse: the escrowed vesting position is the only
 *         collateral. Settlement order on liquidation:
 *           1. proceeds repay the debt (principal first, then interest),
 *           2. any surplus is credited to the borrower (pull via `claim`),
 *           3. any shortfall is covered by the InsuranceVault up to its balance,
 *           4. remaining principal is written off in the pool (pro-rata loss).
 *
 *         Repayment, liquidation and bidding are never pausable. Pausing only
 *         stops new borrowing.
 */
contract LoanManager is VestraAccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;

    IERC20           public immutable usdc;
    ILendingPool     public immutable pool;
    VestingAdapter   public immutable adapter;
    IValuationEngine public immutable valuation;
    IInsuranceVault  public immutable insurance;
    address          public feeRecipient;

    // ── Parameters ───────────────────────────────────────────────────────────
    uint256 public originationFeeBps      = 50;      // 0.5%
    uint256 public reserveFactorBps       = 1000;    // 10% of interest → insurance
    uint256 public gracePeriod            = 3 days;  // after maturity
    uint256 public auctionDuration        = 3 days;
    uint256 public auctionStartPremiumBps = 12_000;  // start at 120% of max(spot value, debt)
    uint256 public minBorrow              = 10e6;    // 10 USDC
    uint256[4] public liqThresholdBps     = [uint256(0), 6500, 5000, 3500];

    // ── Loans ────────────────────────────────────────────────────────────────
    enum Status { None, Active, Auction, Repaid, Liquidated }

    struct Loan {
        address borrower;
        address nftContract;
        uint256 streamId;
        uint256 escrowId;
        address token;
        uint256 quantity;
        uint256 unlockTime;
        uint256 principal;
        uint256 interestOwed;
        uint256 aprBps;
        uint64  openedAt;
        uint64  lastAccrual;
        uint64  maturity;
        uint8   rank;
        Status  status;
    }

    struct AuctionState {
        uint64  startTime;
        uint256 startPrice;
        uint256 debt; // frozen at auction start
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;
    mapping(uint256 => AuctionState) public auctions;
    mapping(address => uint256[]) private _loansByBorrower;

    /// Liquidation surpluses owed to borrowers (pull payment).
    mapping(address => uint256) public claimable;

    uint256 public totalPrincipalOutstanding;

    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed token,
        uint256 escrowId,
        uint256 principal,
        uint256 fee,
        uint256 aprBps,
        uint256 maturity,
        uint256 pv
    );
    event LoanRepaid(uint256 indexed loanId, address indexed payer, uint256 principalPaid, uint256 interestPaid, bool closed);
    event LiquidationStarted(uint256 indexed loanId, address indexed caller, uint256 debt, uint256 startPrice);
    event LoanLiquidated(
        uint256 indexed loanId,
        address indexed winner,
        uint256 price,
        uint256 insuranceCovered,
        uint256 principalWrittenOff,
        uint256 borrowerSurplus
    );
    event SurplusClaimed(address indexed borrower, uint256 amount);
    event FeeRecipientUpdated(address indexed recipient);
    event ParamUpdated(bytes32 indexed name, uint256 value);

    constructor(
        IERC20 _usdc,
        ILendingPool _pool,
        VestingAdapter _adapter,
        IValuationEngine _valuation,
        IInsuranceVault _insurance,
        address _feeRecipient,
        address _governor
    ) VestraAccessControl(_governor) {
        require(
            address(_usdc) != address(0) && address(_pool) != address(0) && address(_adapter) != address(0)
                && address(_valuation) != address(0) && address(_insurance) != address(0) && _feeRecipient != address(0),
            "zero address"
        );
        usdc = _usdc;
        pool = _pool;
        adapter = _adapter;
        valuation = _valuation;
        insurance = _insurance;
        feeRecipient = _feeRecipient;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Borrow
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Borrow USDC against a vesting-stream NFT.
     * @dev    Approve the NFT to `adapter` first. Quantity, token and unlock time are
     *         read from the stream. `maturity` = 0 means "at unlock".
     * @return loanId The new loan.
     */
    function borrow(
        address nftContract,
        uint256 streamId,
        VestingAdapter.Protocol protocol,
        uint256 amount,
        uint256 maturity
    ) external nonReentrant whenNotPaused returns (uint256 loanId) {
        require(amount >= minBorrow, "below minimum");

        loanId = nextLoanId++;
        uint256 escrowId = adapter.escrowFor(msg.sender, nftContract, streamId, protocol, loanId);
        (address token, uint256 quantity, uint256 unlockTime) = adapter.collateral(escrowId);

        if (maturity == 0) maturity = unlockTime;
        require(maturity > block.timestamp && maturity <= unlockTime, "bad maturity");

        (uint256 pv, uint256 ltvBps) = valuation.computeDPV(quantity, token, unlockTime, nftContract);
        uint8 rank = valuation.rankOf(nftContract);
        require(ltvBps < liqThresholdBps[rank], "ltv >= liquidation threshold");
        require(amount <= (pv * ltvBps) / BPS, "exceeds max borrow");

        uint256 apr = pool.borrowRateAfter(amount);

        loans[loanId] = Loan({
            borrower:     msg.sender,
            nftContract:  nftContract,
            streamId:     streamId,
            escrowId:     escrowId,
            token:        token,
            quantity:     quantity,
            unlockTime:   unlockTime,
            principal:    amount,
            interestOwed: 0,
            aprBps:       apr,
            openedAt:     uint64(block.timestamp),
            lastAccrual:  uint64(block.timestamp),
            maturity:     uint64(maturity),
            rank:         rank,
            status:       Status.Active
        });
        _loansByBorrower[msg.sender].push(loanId);
        totalPrincipalOutstanding += amount;

        pool.lend(address(this), amount);
        uint256 fee = (amount * originationFeeBps) / BPS;
        if (fee > 0) usdc.safeTransfer(feeRecipient, fee);
        usdc.safeTransfer(msg.sender, amount - fee);

        emit LoanOpened(loanId, msg.sender, token, escrowId, amount, fee, apr, maturity, pv);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Repay (anyone may repay on the borrower's behalf; collateral always returns to the borrower)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Repay up to `amount` of a loan. Interest is paid before principal.
     *         During an auction only a full repayment is accepted; it cancels the auction.
     */
    function repay(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.Active || loan.status == Status.Auction, "not repayable");
        require(amount > 0, "amount=0");

        if (loan.status == Status.Active) {
            _accrue(loan);
        } else {
            // Debt is frozen at auction start; a full repayment cancels the auction.
            uint256 frozen = auctions[loanId].debt;
            require(amount >= frozen, "full repayment required during auction");
            loan.interestOwed = frozen - loan.principal;
            delete auctions[loanId];
            loan.status = Status.Active;
        }

        uint256 owed = loan.principal + loan.interestOwed;
        uint256 pay = amount < owed ? amount : owed;
        uint256 interestPart = pay < loan.interestOwed ? pay : loan.interestOwed;
        uint256 principalPart = pay - interestPart;

        loan.interestOwed -= interestPart;
        loan.principal -= principalPart;
        totalPrincipalOutstanding -= principalPart;
        bool closed = loan.principal == 0 && loan.interestOwed == 0;
        if (closed) loan.status = Status.Repaid;

        usdc.safeTransferFrom(msg.sender, address(this), pay);

        uint256 reserve = (interestPart * reserveFactorBps) / BPS;
        if (reserve > 0) usdc.safeTransfer(address(insurance), reserve);
        _repayPool(principalPart, interestPart - reserve);

        if (closed) adapter.release(loan.escrowId, loan.borrower);

        emit LoanRepaid(loanId, msg.sender, principalPart, interestPart, closed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Liquidation (permissionless)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Open the Dutch auction for a liquidatable loan.
    function startLiquidation(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(isLiquidatable(loanId), "not liquidatable");

        _accrue(loan);
        uint256 debt = loan.principal + loan.interestOwed;

        uint256 reference_ = debt;
        try valuation.spotValue(loan.quantity, loan.token) returns (uint256 spot) {
            if (spot > reference_) reference_ = spot;
        } catch {}
        uint256 startPrice = (reference_ * auctionStartPremiumBps) / BPS;

        loan.status = Status.Auction;
        auctions[loanId] = AuctionState({startTime: uint64(block.timestamp), startPrice: startPrice, debt: debt});

        emit LiquidationStarted(loanId, msg.sender, debt, startPrice);
    }

    /**
     * @notice Buy the escrowed vesting position at the current auction price.
     * @param  maxPrice Slippage guard: revert if the price is above this.
     * @dev    After the auction window the price is 0 and anyone may take the position;
     *         that only happens if nobody valued it above zero during the whole auction.
     */
    function bid(uint256 loanId, uint256 maxPrice) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.Auction, "no auction");
        uint256 price = currentPrice(loanId);
        require(price <= maxPrice, "price above max");

        if (price > 0) usdc.safeTransferFrom(msg.sender, address(this), price);
        _settle(loanId, loan, price, msg.sender);
    }

    /// @notice Withdraw liquidation surplus owed to the caller.
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "nothing to claim");
        claimable[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit SurplusClaimed(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function debtOf(uint256 loanId) public view returns (uint256) {
        Loan storage loan = loans[loanId];
        if (loan.status == Status.Auction) return auctions[loanId].debt;
        if (loan.status != Status.Active) return 0;
        return loan.principal + loan.interestOwed + _pendingInterest(loan);
    }

    /**
     * @notice True if the loan is past maturity + grace, or its debt exceeds
     *         liquidationValue × liquidation threshold. If valuation is unavailable
     *         (e.g. stale oracle) only the maturity condition applies.
     */
    function isLiquidatable(uint256 loanId) public view returns (bool) {
        Loan storage loan = loans[loanId];
        if (loan.status != Status.Active) return false;
        if (block.timestamp > uint256(loan.maturity) + gracePeriod) return true;
        try valuation.liquidationValue(loan.quantity, loan.token, loan.unlockTime, loan.nftContract) returns (uint256 v) {
            return debtOf(loanId) * BPS > v * liqThresholdBps[loan.rank];
        } catch {
            return false;
        }
    }

    /// @notice Health factor in bps (≥ 10_000 is healthy). Returns 0 if valuation is unavailable.
    function healthFactorBps(uint256 loanId) external view returns (uint256) {
        Loan storage loan = loans[loanId];
        uint256 debt = debtOf(loanId);
        if (debt == 0) return type(uint256).max;
        try valuation.liquidationValue(loan.quantity, loan.token, loan.unlockTime, loan.nftContract) returns (uint256 v) {
            return (v * liqThresholdBps[loan.rank]) / debt;
        } catch {
            return 0;
        }
    }

    function currentPrice(uint256 loanId) public view returns (uint256) {
        AuctionState storage a = auctions[loanId];
        if (loans[loanId].status != Status.Auction) return 0;
        uint256 elapsed = block.timestamp - a.startTime;
        if (elapsed >= auctionDuration) return 0;
        return (a.startPrice * (auctionDuration - elapsed)) / auctionDuration;
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function loansOf(address borrower) external view returns (uint256[] memory) {
        return _loansByBorrower[borrower];
    }

    /// @notice Maximum borrowable for a stream right now (does not escrow anything).
    function quoteMaxBorrow(address token, uint256 quantity, uint256 unlockTime, address nftContract)
        external
        view
        returns (uint256 maxBorrow, uint256 pv, uint256 ltvBps, uint256 aprBps)
    {
        (pv, ltvBps) = valuation.computeDPV(quantity, token, unlockTime, nftContract);
        maxBorrow = (pv * ltvBps) / BPS;
        aprBps = pool.borrowRateAfter(maxBorrow);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Governance
    // ─────────────────────────────────────────────────────────────────────────

    function setFeeRecipient(address recipient) external onlyGovernor {
        require(recipient != address(0), "recipient=0");
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    function setOriginationFeeBps(uint256 bps) external onlyGovernor {
        require(bps <= 300, "max 3%");
        originationFeeBps = bps;
        emit ParamUpdated("originationFeeBps", bps);
    }

    function setReserveFactorBps(uint256 bps) external onlyGovernor {
        require(bps <= 5000, "max 50%");
        reserveFactorBps = bps;
        emit ParamUpdated("reserveFactorBps", bps);
    }

    function setGracePeriod(uint256 secs) external onlyGovernor {
        require(secs >= 1 days && secs <= 30 days, "grace");
        gracePeriod = secs;
        emit ParamUpdated("gracePeriod", secs);
    }

    function setAuctionParams(uint256 duration, uint256 startPremiumBps) external onlyGovernor {
        require(duration >= 1 hours && duration <= 14 days, "duration");
        require(startPremiumBps >= BPS && startPremiumBps <= 30_000, "premium");
        auctionDuration = duration;
        auctionStartPremiumBps = startPremiumBps;
        emit ParamUpdated("auctionDuration", duration);
    }

    function setMinBorrow(uint256 amount) external onlyGovernor {
        minBorrow = amount;
        emit ParamUpdated("minBorrow", amount);
    }

    function setLiqThreshold(uint8 rank, uint256 bps) external onlyGovernor {
        require(rank >= 1 && rank <= 3, "rank");
        require(bps > valuation.rankBaseLtvBps(rank) && bps <= 9000, "threshold");
        liqThresholdBps[rank] = bps;
        emit ParamUpdated(keccak256(abi.encodePacked("liqThreshold", rank)), bps);
    }

    function pause() external {
        require(hasRole(GUARDIAN_ROLE, msg.sender) || hasRole(PAUSER_ROLE, msg.sender), "not pauser");
        _pause();
    }

    function unpause() external onlyGovernor {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _pendingInterest(Loan storage loan) internal view returns (uint256) {
        uint256 dt = block.timestamp - loan.lastAccrual;
        if (dt == 0 || loan.principal == 0) return 0;
        return Math.mulDiv(loan.principal, loan.aprBps * dt, YEAR * BPS, Math.Rounding.Ceil);
    }

    function _accrue(Loan storage loan) internal {
        loan.interestOwed += _pendingInterest(loan);
        loan.lastAccrual = uint64(block.timestamp);
    }

    function _repayPool(uint256 principal, uint256 interest) internal {
        uint256 total = principal + interest;
        if (total == 0) return;
        usdc.forceApprove(address(pool), total);
        pool.repay(principal, interest);
    }

    function _settle(uint256 loanId, Loan storage loan, uint256 price, address winner) internal {
        uint256 debt = auctions[loanId].debt;
        uint256 principal = loan.principal;

        uint256 toDebt = price < debt ? price : debt;
        uint256 surplus = price - toDebt;
        uint256 covered;
        if (toDebt < debt) {
            covered = insurance.cover(debt - toDebt);
            toDebt += covered;
        }

        uint256 principalPaid = toDebt < principal ? toDebt : principal;
        uint256 interestPaid = toDebt - principalPaid;
        uint256 writtenOff = principal - principalPaid;

        loan.principal = 0;
        loan.interestOwed = 0;
        loan.status = Status.Liquidated;
        totalPrincipalOutstanding -= principal;
        delete auctions[loanId];
        if (surplus > 0) claimable[loan.borrower] += surplus;

        _repayPool(principalPaid, interestPaid);
        if (writtenOff > 0) pool.writeOff(writtenOff);
        adapter.release(loan.escrowId, winner);

        emit LoanLiquidated(loanId, winner, price, covered, writtenOff, surplus);
    }
}
