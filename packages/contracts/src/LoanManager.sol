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
    function liquidationValue(uint256 quantity, address token, uint256 unlockTime, uint8 rank)
        external view returns (uint256);
    function spotValue(uint256 quantity, address token) external view returns (uint256);
    function rankOf(address vestingContract) external view returns (uint8);
    function rankBaseLtvBps(uint256 rank) external view returns (uint256);
}

interface ILendingPool {
    function lend(address to, uint256 amount) external;
    function repay(uint256 amount) external;
    function idleAssets() external view returns (uint256);
    function utilizationFor(uint256 borrowed, uint256 idle) external pure returns (uint256);
    function rateAt(uint256 utilizationBps) external view returns (uint256);
}

interface IInsuranceVault {
    function cover(uint256 amount) external returns (uint256 paid);
}

/**
 * @title  LoanManager
 * @notice The single loan lifecycle contract for Vestra.
 *
 *         borrow → interest accrues on a global floating-rate index → repay → collateral returned
 *         default → startLiquidation (loan marked down) → Dutch auction → bid → settle
 *
 *         Loans are non-recourse: the escrowed vesting position is the only collateral.
 *
 *         Interest: every loan's debt is `scaledDebt × borrowIndex`. The index grows at the
 *         pool's utilization-based APR and is accrued before every change to utilization
 *         (borrow, repay, pool deposit/withdraw), so no single transaction can choose the
 *         rate for a period that already elapsed.
 *
 *         Lender accounting: `lenderClaim()` (read by the pool's totalAssets) is principal +
 *         accrued interest net of the reserve factor + the marked-down value of loans in
 *         liquidation. Accrued interest therefore reaches lenders continuously, and a loan's
 *         expected loss is recognised the moment its liquidation starts.
 *
 *         Settlement: proceeds repay the debt; surplus is credited to the borrower (pull via
 *         `claim`); a shortfall is covered by the InsuranceVault up to its balance; whatever
 *         is still missing is a loss shared by all lenders through the share price.
 *
 *         Repayment, liquidation and bidding are never pausable. Pausing only stops new borrowing.
 */
contract LoanManager is VestraAccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint256 public constant RAY = 1e27;
    /// Start-price multiple of the debt when no price is available at auction start.
    uint256 public constant NO_PRICE_START_MULTIPLE = 4;

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
    uint256 public auctionStartPremiumBps = 12_000;  // 120% of max(spot value, debt)
    uint256 public auctionFloorBps        = 1000;    // each round ends at 10% of its start price
    uint256 public minBorrow              = 10e6;    // 10 USDC
    uint256[4] public liqThresholdBps     = [uint256(0), 6500, 5000, 3500];

    // ── Interest index ───────────────────────────────────────────────────────
    uint256 public borrowIndex = RAY;
    uint256 public lastIndexUpdate;
    uint256 public totalScaledDebt;
    uint256 public totalPrincipal;      // principal of Active loans
    uint256 public totalAuctionMarks;   // lenders' marked value of loans in liquidation

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
        uint256 scaledDebt;
        uint64  openedAt;
        uint64  maturity;
        uint8   rank;      // fixed at origination; later registry changes do not affect this loan
        Status  status;
    }

    struct AuctionState {
        uint64  startTime;
        uint64  duration;
        uint256 startPrice;
        uint256 floorPrice;
        uint256 debt;       // frozen at auction start
        uint256 principal;
        uint256 claim;      // lenders' claim at auction start (debt net of reserve on interest)
        uint256 mark;       // value at which the loan is carried in lenderClaim during the auction
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;
    mapping(uint256 => AuctionState) public auctions;
    mapping(address => uint256[]) private _loansByBorrower;

    /// Liquidation surpluses owed to borrowers (pull payment).
    mapping(address => uint256) public claimable;

    uint256 public totalLosses;

    event Accrued(uint256 borrowIndex, uint256 rateBps);
    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed token,
        uint256 escrowId,
        uint256 principal,
        uint256 fee,
        uint256 maturity,
        uint256 pv
    );
    event LoanRepaid(uint256 indexed loanId, address indexed payer, uint256 principalPaid, uint256 interestPaid, bool closed);
    event LiquidationStarted(uint256 indexed loanId, address indexed caller, uint256 debt, uint256 startPrice, uint256 mark);
    event AuctionRestarted(uint256 indexed loanId, uint256 startPrice, uint256 floorPrice);
    event LoanLiquidated(
        uint256 indexed loanId,
        address indexed winner,
        uint256 price,
        uint256 insuranceCovered,
        uint256 lenderLoss,
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
        lastIndexUpdate = block.timestamp;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Interest
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Accrue the borrow index at the rate implied by current (pre-change) utilization.
    function accrue() public {
        uint256 dt = block.timestamp - lastIndexUpdate;
        if (dt == 0) return;
        uint256 rate = _rateBps();
        borrowIndex = _indexAfter(dt, rate);
        lastIndexUpdate = block.timestamp;
        emit Accrued(borrowIndex, rate);
    }

    /// @notice Current borrow APR (bps), floating.
    function currentRateBps() external view returns (uint256) {
        return _rateBps();
    }

    /// @notice Lenders' claim on the loan book. Read by LendingPool.totalAssets().
    function lenderClaim() external view returns (uint256) {
        return _lenderClaim(_currentIndex());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Borrow
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Borrow USDC against a vesting-stream NFT.
     * @dev    Approve the NFT to `adapter` first. Quantity, token and unlock time are read
     *         from the stream. `maturity` = 0 means "at unlock". The rate floats.
     */
    function borrow(
        address nftContract,
        uint256 streamId,
        VestingAdapter.Protocol protocol,
        uint256 amount,
        uint256 maturity
    ) external nonReentrant whenNotPaused returns (uint256 loanId) {
        require(amount >= minBorrow, "below minimum");
        accrue();

        loanId = nextLoanId++;
        uint256 escrowId = adapter.escrowFor(msg.sender, nftContract, streamId, protocol, loanId);
        (address token, uint256 quantity, uint256 unlockTime) = adapter.collateral(escrowId);

        if (maturity == 0) maturity = unlockTime;
        require(maturity > block.timestamp && maturity <= unlockTime, "bad maturity");

        (uint256 pv, uint256 ltvBps) = valuation.computeDPV(quantity, token, unlockTime, nftContract);
        uint8 rank = valuation.rankOf(nftContract);
        require(ltvBps < liqThresholdBps[rank], "ltv >= liquidation threshold");
        require(amount <= (pv * ltvBps) / BPS, "exceeds max borrow");

        uint256 scaled = Math.mulDiv(amount, RAY, borrowIndex, Math.Rounding.Ceil);
        loans[loanId] = Loan({
            borrower:    msg.sender,
            nftContract: nftContract,
            streamId:    streamId,
            escrowId:    escrowId,
            token:       token,
            quantity:    quantity,
            unlockTime:  unlockTime,
            principal:   amount,
            scaledDebt:  scaled,
            openedAt:    uint64(block.timestamp),
            maturity:    uint64(maturity),
            rank:        rank,
            status:      Status.Active
        });
        _loansByBorrower[msg.sender].push(loanId);
        totalScaledDebt += scaled;
        totalPrincipal += amount;

        pool.lend(address(this), amount);
        uint256 fee = (amount * originationFeeBps) / BPS;
        if (fee > 0) usdc.safeTransfer(feeRecipient, fee);
        usdc.safeTransfer(msg.sender, amount - fee);

        emit LoanOpened(loanId, msg.sender, token, escrowId, amount, fee, maturity, pv);
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
        require(amount > 0, "amount=0");

        uint256 pay;
        uint256 interestPart;
        uint256 principalPart;
        bool closed;

        if (loan.status == Status.Active) {
            accrue();
            uint256 debt = _loanDebt(loan, borrowIndex);
            pay = amount < debt ? amount : debt;
            uint256 interest = debt > loan.principal ? debt - loan.principal : 0;
            interestPart = pay < interest ? pay : interest;
            principalPart = pay - interestPart;

            uint256 scaledReduction = pay == debt
                ? loan.scaledDebt
                : Math.min(Math.mulDiv(pay, RAY, borrowIndex, Math.Rounding.Floor), loan.scaledDebt);
            loan.scaledDebt -= scaledReduction;
            totalScaledDebt -= scaledReduction;
            loan.principal -= principalPart;
            totalPrincipal -= principalPart;
            closed = pay == debt;
        } else if (loan.status == Status.Auction) {
            AuctionState storage a = auctions[loanId];
            require(amount >= a.debt, "full repayment required during auction");
            pay = a.debt;
            principalPart = a.principal;
            interestPart = a.debt - a.principal;
            totalAuctionMarks -= a.mark;
            delete auctions[loanId];
            loan.principal = 0;
            closed = true;
        } else {
            revert("not repayable");
        }

        if (closed) loan.status = Status.Repaid;

        usdc.safeTransferFrom(msg.sender, address(this), pay);
        uint256 reserve = (interestPart * reserveFactorBps) / BPS;
        if (reserve > 0) usdc.safeTransfer(address(insurance), reserve);
        _repayPool(pay - reserve);

        if (closed) adapter.release(loan.escrowId, loan.borrower);

        emit LoanRepaid(loanId, msg.sender, principalPart, interestPart, closed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Liquidation (permissionless)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Open the Dutch auction for a liquidatable loan. The loan stops accruing interest
     *         and is immediately carried in the pool at min(lenders' claim, liquidation value),
     *         so lenders exiting during the auction take their share of the expected loss.
     */
    function startLiquidation(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(isLiquidatable(loanId), "not liquidatable");

        accrue();
        uint256 debt = _loanDebt(loan, borrowIndex);
        uint256 principal = loan.principal;
        uint256 claimValue = _netOfReserve(debt, principal);

        totalScaledDebt -= loan.scaledDebt;
        totalPrincipal -= principal;
        loan.scaledDebt = 0;

        uint256 mark;
        try valuation.liquidationValue(loan.quantity, loan.token, loan.unlockTime, loan.rank) returns (uint256 v) {
            mark = v < claimValue ? v : claimValue;
        } catch {
            mark = 0; // no price: carry at zero until proceeds arrive
        }
        totalAuctionMarks += mark;

        uint256 startPrice;
        try valuation.spotValue(loan.quantity, loan.token) returns (uint256 spot) {
            startPrice = ((spot > debt ? spot : debt) * auctionStartPremiumBps) / BPS;
        } catch {
            startPrice = debt * NO_PRICE_START_MULTIPLE; // generous start protects the borrower's equity
        }

        loan.status = Status.Auction;
        auctions[loanId] = AuctionState({
            startTime:  uint64(block.timestamp),
            duration:   uint64(auctionDuration),
            startPrice: startPrice,
            floorPrice: (startPrice * auctionFloorBps) / BPS,
            debt:       debt,
            principal:  principal,
            claim:      claimValue,
            mark:       mark
        });

        emit LiquidationStarted(loanId, msg.sender, debt, startPrice, mark);
    }

    /**
     * @notice After an auction round ends without a bid, start a new round from the previous
     *         floor. Prices therefore keep falling across rounds but never jump to zero.
     */
    function restartAuction(uint256 loanId) external nonReentrant {
        require(loans[loanId].status == Status.Auction, "no auction");
        AuctionState storage a = auctions[loanId];
        require(block.timestamp >= uint256(a.startTime) + a.duration, "round not over");
        a.startPrice = a.floorPrice;
        a.floorPrice = (a.floorPrice * auctionFloorBps) / BPS;
        a.startTime = uint64(block.timestamp);
        a.duration = uint64(auctionDuration);
        emit AuctionRestarted(loanId, a.startPrice, a.floorPrice);
    }

    /// @notice Buy the escrowed vesting position at the current auction price (≤ `maxPrice`).
    function bid(uint256 loanId, uint256 maxPrice) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.Auction, "no auction");
        uint256 price = currentPrice(loanId);
        require(price > 0, "price=0");
        require(price <= maxPrice, "price above max");

        usdc.safeTransferFrom(msg.sender, address(this), price);
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
        return _loanDebt(loan, _currentIndex());
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
        try valuation.liquidationValue(loan.quantity, loan.token, loan.unlockTime, loan.rank) returns (uint256 v) {
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
        try valuation.liquidationValue(loan.quantity, loan.token, loan.unlockTime, loan.rank) returns (uint256 v) {
            return (v * liqThresholdBps[loan.rank]) / debt;
        } catch {
            return 0;
        }
    }

    /// @notice Current auction price: linear from start to floor over the round, then the floor.
    function currentPrice(uint256 loanId) public view returns (uint256) {
        if (loans[loanId].status != Status.Auction) return 0;
        AuctionState storage a = auctions[loanId];
        uint256 elapsed = block.timestamp - a.startTime;
        if (elapsed >= a.duration) return a.floorPrice;
        return a.floorPrice + ((a.startPrice - a.floorPrice) * (a.duration - elapsed)) / a.duration;
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
        returns (uint256 maxBorrow, uint256 pv, uint256 ltvBps)
    {
        (pv, ltvBps) = valuation.computeDPV(quantity, token, unlockTime, nftContract);
        maxBorrow = (pv * ltvBps) / BPS;
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
        accrue();
        reserveFactorBps = bps;
        emit ParamUpdated("reserveFactorBps", bps);
    }

    function setGracePeriod(uint256 secs) external onlyGovernor {
        require(secs >= 1 days && secs <= 30 days, "grace");
        gracePeriod = secs;
        emit ParamUpdated("gracePeriod", secs);
    }

    /// @dev Applies to auctions started afterwards; running rounds keep their stored duration.
    function setAuctionParams(uint256 duration, uint256 startPremiumBps, uint256 floorBps) external onlyGovernor {
        require(duration >= 1 hours && duration <= 14 days, "duration");
        require(startPremiumBps >= BPS && startPremiumBps <= 30_000, "premium");
        require(floorBps >= 100 && floorBps <= 9000, "floor");
        auctionDuration = duration;
        auctionStartPremiumBps = startPremiumBps;
        auctionFloorBps = floorBps;
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

    /// @dev Rate from stored state only (no pending interest), so pool.totalAssets → lenderClaim
    ///      → _currentIndex → _rateBps never recurses back into the pool's totalAssets.
    function _rateBps() internal view returns (uint256) {
        uint256 storedClaim = _lenderClaim(borrowIndex);
        return pool.rateAt(pool.utilizationFor(storedClaim, pool.idleAssets()));
    }

    function _indexAfter(uint256 dt, uint256 rateBps) internal view returns (uint256) {
        return borrowIndex + Math.mulDiv(borrowIndex, rateBps * dt, YEAR * BPS);
    }

    function _currentIndex() internal view returns (uint256) {
        uint256 dt = block.timestamp - lastIndexUpdate;
        return dt == 0 ? borrowIndex : _indexAfter(dt, _rateBps());
    }

    function _loanDebt(Loan storage loan, uint256 index) internal view returns (uint256) {
        return Math.mulDiv(loan.scaledDebt, index, RAY, Math.Rounding.Ceil);
    }

    function _netOfReserve(uint256 debt, uint256 principal) internal view returns (uint256) {
        uint256 interest = debt > principal ? debt - principal : 0;
        return principal + (interest * (BPS - reserveFactorBps)) / BPS;
    }

    function _lenderClaim(uint256 index) internal view returns (uint256) {
        uint256 debt = Math.mulDiv(totalScaledDebt, index, RAY);
        return _netOfReserve(debt, totalPrincipal) + totalAuctionMarks;
    }

    function _repayPool(uint256 amount) internal {
        if (amount == 0) return;
        usdc.forceApprove(address(pool), amount);
        pool.repay(amount);
    }

    function _settle(uint256 loanId, Loan storage loan, uint256 price, address winner) internal {
        AuctionState memory a = auctions[loanId];

        uint256 toDebt = price < a.debt ? price : a.debt;
        uint256 surplus = price - toDebt;
        uint256 covered;
        if (toDebt < a.debt) {
            uint256 shortfall = a.debt - toDebt;
            covered = insurance.cover(shortfall);
            if (covered > shortfall) covered = shortfall;
        }
        uint256 received = toDebt + covered;
        uint256 toLenders = received < a.claim ? received : a.claim;
        uint256 toReserve = received - toLenders; // the reserve factor's share of recovered interest
        uint256 loss = a.claim - toLenders;

        loan.principal = 0;
        loan.status = Status.Liquidated;
        totalAuctionMarks -= a.mark;
        totalLosses += loss;
        delete auctions[loanId];
        if (surplus > 0) claimable[loan.borrower] += surplus;

        if (toReserve > 0) usdc.safeTransfer(address(insurance), toReserve);
        _repayPool(toLenders);
        adapter.release(loan.escrowId, winner);

        emit LoanLiquidated(loanId, winner, price, covered, loss, surplus);
    }
}
