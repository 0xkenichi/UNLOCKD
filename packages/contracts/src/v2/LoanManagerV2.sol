// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "../governance/VestraAccessControl.sol";
import "../VestingAdapter.sol";
import "./CreditEngineV2.sol";
import "./RiskOracle.sol";
import "./BackstopVault.sol";

interface ILendingPoolV2 {
    function lend(address to, uint256 amount) external;
    function repay(uint256 amount) external;
    function idleAssets() external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function utilizationFor(uint256 borrowed, uint256 idle) external pure returns (uint256);
    function rateAt(uint256 utilizationBps) external view returns (uint256);
}

interface IInsuranceVaultV2 {
    function cover(uint256 amount) external returns (uint256 paid);
}

/**
 * @title  LoanManagerV2
 * @notice Vestra v2 loans (yellow paper): two tiers, fixed rate, fixed term, and the resolution
 *         ladder — cure window, capped paydown, partner buyback, floored auction.
 *
 *   Tiers         Standard (default; hold valuation, α 2%/10%, no backstop) and Opt-in (chosen by
 *                 the borrower; blend valuation, α 0.5%/5%, partner locks 16% of principal as
 *                 first loss before the loan opens). Calibrated by packages/risk/bin/stress.js.
 *   Interest      simple, on outstanding principal, at a rate fixed when the loan opens:
 *                 max(pool rate now, pool rate after this loan) + the tier's premium.
 *   Health        debt > CV_αℓ(now), where CV uses the loan's σ, volume and drag frozen at
 *                 origination and only the oracle's time-weighted price is live. Nothing an
 *                 operator posts can make an open loan liquidatable.
 *   Ladder        flagBreach → cure window (borrower repays) → paydown window (vetted buyers
 *                 buy vested escrow tokens below the health price, within a daily volume cap)
 *                 → startLiquidation → partner right of first refusal → Dutch auction from the
 *                 fair value down to a floor at CV_αℓ, restarting with a lower floor.
 *   Losses        backstop (loan's lock, then the token's free backstop) → insurance → lenders.
 *
 *   Repay, breach handling, paydown, liquidation and bidding are never pausable.
 */
contract LoanManagerV2 is VestraAccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant PAYDOWN_BUYER_ROLE = keccak256("PAYDOWN_BUYER_ROLE");

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    /// The opt-in backstop may be raised by governance but never below the calibrated 16%.
    uint256 public constant MIN_OPT_IN_BACKSTOP_BPS = 1600;

    IERC20 public immutable usdc;
    ILendingPoolV2 public immutable pool;
    VestingAdapter public immutable adapter;
    CreditEngineV2 public immutable engine;
    RiskOracle public immutable oracle;
    BackstopVault public immutable backstop;
    IInsuranceVaultV2 public immutable insurance;
    address public feeRecipient;

    // ── Parameters (bounded setters below) ───────────────────────────────────
    uint256 public originationFeeBps = 50;
    uint256 public reserveFactorBps = 1000;
    uint256[2] public tierPremiumBps = [uint256(0), 200];
    uint256 public optInBackstopBps = 1600;
    uint256 public tokenExposureCapBps = 1000;  // per token, share of pool assets
    uint256 public maxTerm = 3 * 365 days;
    uint256 public minBorrow = 10e6;
    uint256 public gracePeriod = 3 days;
    uint256 public cureWindow = 2 days;
    uint256 public paydownWindow = 5 days;
    uint256 public paydownAdvShareBps = 200;    // per day, of the loan's frozen median volume
    uint256 public paydownDiscountBps = 300;    // buyers pay the health price less 3%
    uint256 public healthMarginBps = 500;       // paydown clears the breach at debt ≤ CV/(1+5%)
    uint256 public rofrWindow = 72 hours;
    uint256 public partnerShareBps = 10_000;    // θ: partner pays max(debt, θ · fair value)
    uint256 public auctionDuration = 3 days;
    uint256 public floorDecayBps = 9000;        // each restart lowers the floor to 90%

    // ── Loans ────────────────────────────────────────────────────────────────
    enum Status { None, Active, Auction, Repaid, Liquidated }

    struct Loan {
        address borrower;
        address token;
        uint256 escrowId;
        CreditEngineV2.Tier tier;
        Status status;
        uint32 rateBps;
        uint64 openedAt;
        uint64 maturity;
        uint64 lastAccrual;
        uint64 breachAt;          // 0 = not in breach
        uint256 principal;
        uint256 accrued;          // unpaid interest up to lastAccrual
        uint256 sold;             // vested tokens sold in paydowns
        uint64 paydownDay;
        uint256 paydownUsedUsd;   // sold on paydownDay
    }

    struct Auction {
        uint64 startTime;
        uint64 rofrEnd;
        uint256 debt;
        uint256 claim;            // lenders' claim at start (net of reserve on interest)
        uint256 mark;             // carried in lenderClaim during the auction
        uint256 partnerPrice;
        uint256 startPrice;
        uint256 floorPrice;
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan) public loans;
    mapping(uint256 => CreditEngineV2.Schedule) internal _schedules;   // consumed = withdrawn at escrow
    mapping(uint256 => CreditEngineV2.Market) internal _markets;       // frozen at origination (price unused)
    mapping(uint256 => Auction) public auctions;
    mapping(address => uint256[]) private _loansByBorrower;
    mapping(address => uint256) public exposure;                       // token → principal outstanding
    mapping(address => uint256) public claimable;                      // borrower surpluses

    // Lender-claim aggregates over Active loans: Σ P, Σ A, Σ P·r, Σ P·r·lastAccrual.
    uint256 public sumPrincipal;
    uint256 public sumAccrued;
    uint256 public sumPr;
    uint256 public sumPrT;
    uint256 public totalAuctionMarks;
    uint256 public totalLosses;

    event LoanOpened(uint256 indexed loanId, address indexed borrower, address indexed token, CreditEngineV2.Tier tier, uint256 principal, uint256 rateBps, uint256 maturity, uint256 maxBorrow);
    event LoanRepaid(uint256 indexed loanId, address indexed payer, uint256 interestPaid, uint256 principalPaid, bool closed);
    event BreachFlagged(uint256 indexed loanId, uint256 debt, uint256 creditValue);
    event BreachCleared(uint256 indexed loanId);
    event PaidDown(uint256 indexed loanId, address indexed buyer, uint256 tokens, uint256 usd);
    event LiquidationStarted(uint256 indexed loanId, uint256 debt, uint256 partnerPrice, uint256 startPrice, uint256 floorPrice, uint256 rofrEnd);
    event AuctionRestarted(uint256 indexed loanId, uint256 startPrice, uint256 floorPrice);
    event LoanLiquidated(uint256 indexed loanId, address indexed winner, uint256 price, uint256 fromBackstop, uint256 fromInsurance, uint256 lenderLoss, uint256 borrowerSurplus);
    event SurplusClaimed(address indexed borrower, uint256 amount);
    event ParamUpdated(bytes32 indexed name, uint256 value);

    struct BorrowRequest {
        address nftContract;
        uint256 streamId;
        VestingAdapter.Protocol protocol;
        uint256 amount;
        uint256 maturity;
        CreditEngineV2.Tier tier;
        uint256 maxRateBps;   // the borrower's limit on the fixed rate
    }

    constructor(
        IERC20 _usdc,
        ILendingPoolV2 _pool,
        VestingAdapter _adapter,
        CreditEngineV2 _engine,
        RiskOracle _oracle,
        BackstopVault _backstop,
        IInsuranceVaultV2 _insurance,
        address _feeRecipient,
        address _governor
    ) VestraAccessControl(_governor) {
        require(
            address(_usdc) != address(0) && address(_pool) != address(0) && address(_adapter) != address(0)
                && address(_engine) != address(0) && address(_oracle) != address(0) && address(_backstop) != address(0)
                && address(_insurance) != address(0) && _feeRecipient != address(0),
            "zero address"
        );
        usdc = _usdc;
        pool = _pool;
        adapter = _adapter;
        engine = _engine;
        oracle = _oracle;
        backstop = _backstop;
        insurance = _insurance;
        feeRecipient = _feeRecipient;
        _setRoleAdmin(PAYDOWN_BUYER_ROLE, GOVERNOR_ROLE);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pool interface
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Rates are fixed per loan, so there is nothing to accrue globally. Kept for the pool.
    function accrue() external {}

    /// @notice Lenders' claim on the loan book: principal + accrued interest net of the reserve
    ///         factor + the marked value of loans in liquidation. Read by the pool's totalAssets.
    function lenderClaim() public view returns (uint256) {
        uint256 accruing = (sumPr * block.timestamp - sumPrT) / (YEAR * BPS);
        return sumPrincipal + ((sumAccrued + accruing) * (BPS - reserveFactorBps)) / BPS + totalAuctionMarks;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Borrow
    // ─────────────────────────────────────────────────────────────────────────

    function borrow(BorrowRequest calldata req) external nonReentrant whenNotPaused returns (uint256 loanId) {
        require(req.amount >= minBorrow, "below minimum");
        require(req.maturity > block.timestamp && req.maturity - block.timestamp <= maxTerm, "bad maturity");

        loanId = nextLoanId++;
        uint256 escrowId = adapter.escrowFor(msg.sender, req.nftContract, req.streamId, req.protocol, loanId);
        (address token, , uint256 end) = adapter.collateral(escrowId);
        require(req.maturity <= end, "maturity after unlock");

        CreditEngineV2.Schedule memory sch = _readSchedule(escrowId);
        CreditEngineV2.Market memory m = oracle.originationMarket(token);
        uint256 omegaBps = oracle.omega(token);
        require(omegaBps > 0, "no credit for token");

        uint256 rateBps = quoteRate(req.amount, req.tier);
        require(rateBps <= req.maxRateBps, "rate above limit");
        uint256 maxB = engine.maxBorrow(sch, block.timestamp, req.maturity, rateBps, m, req.tier, omegaBps);
        require(req.amount <= maxB, "exceeds max borrow");
        require(
            exposure[token] + req.amount <= Math.mulDiv(pool.totalAssets(), tokenExposureCapBps, BPS),
            "token exposure cap"
        );
        if (req.tier == CreditEngineV2.Tier.OptIn) {
            backstop.lock(token, loanId, Math.mulDiv(req.amount, optInBackstopBps, BPS, Math.Rounding.Ceil));
        }

        loans[loanId] = Loan({
            borrower: msg.sender,
            token: token,
            escrowId: escrowId,
            tier: req.tier,
            status: Status.Active,
            rateBps: uint32(rateBps),
            openedAt: uint64(block.timestamp),
            maturity: uint64(req.maturity),
            lastAccrual: uint64(block.timestamp),
            breachAt: 0,
            principal: req.amount,
            accrued: 0,
            sold: 0,
            paydownDay: 0,
            paydownUsedUsd: 0
        });
        _schedules[loanId] = sch;
        _markets[loanId] = m;
        _loansByBorrower[msg.sender].push(loanId);
        exposure[token] += req.amount;
        _addToBook(req.amount, 0, rateBps);

        pool.lend(address(this), req.amount);
        uint256 fee = (req.amount * originationFeeBps) / BPS;
        if (fee > 0) usdc.safeTransfer(feeRecipient, fee);
        usdc.safeTransfer(msg.sender, req.amount - fee);

        emit LoanOpened(loanId, msg.sender, token, req.tier, req.amount, rateBps, req.maturity, maxB);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Repay (anyone may repay; collateral always returns to the borrower)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Repay up to `amount`, interest first. During an auction only full repayment is
    ///         accepted; it cancels the auction.
    function repay(uint256 loanId, uint256 amount) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(amount > 0, "amount=0");
        if (loan.status == Status.Auction) {
            Auction memory a = auctions[loanId];
            require(amount >= a.debt, "full repayment required during auction");
            totalAuctionMarks -= a.mark;
            delete auctions[loanId];
            uint256 interest = a.debt - loan.principal;
            loan.principal = 0;
            loan.status = Status.Repaid;
            usdc.safeTransferFrom(msg.sender, address(this), a.debt);
            _payLenders(a.debt, interest);
            _close(loanId, loan);
            emit LoanRepaid(loanId, msg.sender, interest, a.debt - interest, true);
            return;
        }
        require(loan.status == Status.Active, "not repayable");
        (uint256 interestPaid, uint256 principalPaid, bool closed) = _applyPayment(loan, amount);
        usdc.safeTransferFrom(msg.sender, address(this), interestPaid + principalPaid);
        _payLenders(interestPaid + principalPaid, interestPaid);
        if (closed) {
            loan.status = Status.Repaid;
            _close(loanId, loan);
        } else if (loan.breachAt != 0 && _isHealthy(loanId, 0)) {
            loan.breachAt = 0;
            emit BreachCleared(loanId);
        }
        emit LoanRepaid(loanId, msg.sender, interestPaid, principalPaid, closed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // The resolution ladder (permissionless except paydown buyers)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Start the cure window for a loan whose debt exceeds its liquidation value.
    function flagBreach(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.Active, "not active");
        require(loan.breachAt == 0, "already flagged");
        (uint256 debt, uint256 cv) = health(loanId);
        require(debt > cv, "healthy");
        loan.breachAt = uint64(block.timestamp);
        emit BreachFlagged(loanId, debt, cv);
    }

    /// @notice Clear a breach once the loan is healthy again (the price recovered).
    function clearBreach(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.Active && loan.breachAt != 0, "no breach");
        require(_isHealthy(loanId, 0), "still in breach");
        loan.breachAt = 0;
        emit BreachCleared(loanId);
    }

    /**
     * @notice A vetted buyer buys `tokens` vested escrow tokens at the health price less the
     *         paydown discount; the proceeds pay the loan down. Only after the cure window,
     *         within the paydown window, while the loan is in breach, and within the daily cap.
     */
    function paydown(uint256 loanId, uint256 tokens, uint256 maxUsd) external nonReentrant onlyRole(PAYDOWN_BUYER_ROLE) {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.Active && loan.breachAt != 0, "no breach");
        uint256 opens = uint256(loan.breachAt) + cureWindow;
        require(block.timestamp >= opens && block.timestamp < opens + paydownWindow, "outside paydown window");
        require(!_isHealthy(loanId, 0), "healthy");

        CreditEngineV2.Market memory m = _markets[loanId];
        uint256 price = Math.mulDiv(oracle.healthPrice(loan.token), BPS - paydownDiscountBps, BPS);
        uint256 usd = Math.mulDiv(tokens, price, 10 ** uint256(m.decimals));
        require(usd > 0 && usd <= maxUsd, "price");
        require(usd <= _debt(loan), "more than the debt");

        uint64 day = uint64(block.timestamp / 1 days);
        if (loan.paydownDay != day) {
            loan.paydownDay = day;
            loan.paydownUsedUsd = 0;
        }
        loan.paydownUsedUsd += usd;
        require(loan.paydownUsedUsd <= Math.mulDiv(m.advUsd, paydownAdvShareBps, BPS), "daily cap");

        adapter.collectVested(loan.escrowId);
        loan.sold += tokens;
        usdc.safeTransferFrom(msg.sender, address(this), usd);
        (uint256 interestPaid, uint256 principalPaid, bool closed) = _applyPayment(loan, usd);
        _payLenders(interestPaid + principalPaid, interestPaid);
        adapter.transferVested(loan.escrowId, msg.sender, tokens);

        if (closed) {
            loan.status = Status.Repaid;
            _close(loanId, loan);
        } else if (_isHealthy(loanId, healthMarginBps)) {
            loan.breachAt = 0;
            emit BreachCleared(loanId);
        }
        emit PaidDown(loanId, msg.sender, tokens, usd);
    }

    /**
     * @notice Open liquidation: after maturity + grace, or for a flagged breach once the cure
     *         window has passed and either nothing is left to pay down with or the paydown
     *         window has passed too. The partner may buy first; then the Dutch auction runs.
     */
    function startLiquidation(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(isLiquidatable(loanId), "not liquidatable");

        _accrueLoan(loan);
        uint256 debt = loan.principal + loan.accrued;
        uint256 claimValue = loan.principal + (loan.accrued * (BPS - reserveFactorBps)) / BPS;
        _removeFromBook(loan);
        exposure[loan.token] -= loan.principal;

        CreditEngineV2.Schedule memory sch = _schedule(loanId, loan);
        CreditEngineV2.Market memory m = _markets[loanId];
        uint256 liqValue;
        uint256 fair;
        try oracle.healthPrice(loan.token) returns (uint256 p) {
            m.price = p;
            liqValue = engine.creditValue(sch, block.timestamp, m, engine.liquidationCurve(loan.tier));
            fair = engine.creditValue(sch, block.timestamp, m, engine.fairCurve(loan.tier));
        } catch {}

        uint256 mark = liqValue < claimValue ? liqValue : claimValue;
        totalAuctionMarks += mark;
        uint256 startPrice = fair > debt ? fair : debt;
        if (fair == 0) startPrice = debt * 4; // no price: start high to protect the borrower's equity
        uint256 floorPrice = liqValue < startPrice ? liqValue : startPrice;
        if (floorPrice == 0) floorPrice = startPrice / 10;
        uint256 partnerPrice = Math.mulDiv(fair, partnerShareBps, BPS);
        if (partnerPrice < debt) partnerPrice = debt;
        uint64 rofrEnd = backstop.partnerOf(loan.token) == address(0) ? uint64(block.timestamp) : uint64(block.timestamp + rofrWindow);

        loan.status = Status.Auction;
        auctions[loanId] = Auction({
            startTime: rofrEnd,
            rofrEnd: rofrEnd,
            debt: debt,
            claim: claimValue,
            mark: mark,
            partnerPrice: partnerPrice,
            startPrice: startPrice,
            floorPrice: floorPrice
        });
        emit LiquidationStarted(loanId, debt, partnerPrice, startPrice, floorPrice, rofrEnd);
    }

    /// @notice Restart an auction round that ended unsold, from its floor down to a lower floor.
    function restartAuction(uint256 loanId) external {
        require(loans[loanId].status == Status.Auction, "no auction");
        Auction storage a = auctions[loanId];
        require(block.timestamp >= uint256(a.startTime) + auctionDuration, "round not over");
        a.startPrice = a.floorPrice;
        a.floorPrice = (a.floorPrice * floorDecayBps) / BPS;
        a.startTime = uint64(block.timestamp);
        emit AuctionRestarted(loanId, a.startPrice, a.floorPrice);
    }

    /// @notice Buy the escrowed stream: the partner at its price during the right of first
    ///         refusal, anyone at the auction price afterwards.
    function bid(uint256 loanId, uint256 maxPrice) external nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.status == Status.Auction, "no auction");
        Auction memory a = auctions[loanId];
        uint256 price;
        if (block.timestamp < a.rofrEnd) {
            require(msg.sender == backstop.partnerOf(loan.token), "partner's right of first refusal");
            price = a.partnerPrice;
        } else {
            price = currentPrice(loanId);
        }
        require(price > 0 && price <= maxPrice, "price above max");
        usdc.safeTransferFrom(msg.sender, address(this), price);
        _settle(loanId, loan, a, price, msg.sender);
    }

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

    /// @notice Fixed rate a new loan of `amount` would get now (bps a year).
    function quoteRate(uint256 amount, CreditEngineV2.Tier tier) public view returns (uint256) {
        uint256 idle = pool.idleAssets();
        uint256 claimNow = lenderClaim();
        uint256 now_ = pool.rateAt(pool.utilizationFor(claimNow, idle));
        uint256 after_ = pool.rateAt(pool.utilizationFor(claimNow + amount, idle > amount ? idle - amount : 0));
        return (now_ > after_ ? now_ : after_) + tierPremiumBps[uint256(tier)];
    }

    /// @notice The most a stream can borrow now, before escrowing it.
    function quoteMaxBorrow(VestingAdapter.Protocol protocol, address nftContract, uint256 streamId, uint256 amount, uint256 maturity, CreditEngineV2.Tier tier)
        external
        view
        returns (uint256 maxB, uint256 rateBps)
    {
        (address token, uint64 start, uint64 cliff, uint64 end, uint256 total, uint256 withdrawn) =
            adapter.previewSchedule(protocol, nftContract, streamId);
        CreditEngineV2.Schedule memory sch = CreditEngineV2.Schedule(start, cliff, end, total, withdrawn);
        rateBps = quoteRate(amount, tier);
        maxB = engine.maxBorrow(sch, block.timestamp, maturity, rateBps, oracle.originationMarket(token), tier, oracle.omega(token));
    }

    function debtOf(uint256 loanId) public view returns (uint256) {
        Loan storage loan = loans[loanId];
        if (loan.status == Status.Auction) return auctions[loanId].debt;
        if (loan.status != Status.Active) return 0;
        return _debt(loan);
    }

    /// @notice Debt and liquidation credit value now. Reverts if there is no fresh health price.
    function health(uint256 loanId) public view returns (uint256 debt, uint256 cv) {
        Loan storage loan = loans[loanId];
        debt = debtOf(loanId);
        CreditEngineV2.Market memory m = _markets[loanId];
        m.price = oracle.healthPrice(loan.token);
        cv = engine.creditValue(_schedule(loanId, loan), block.timestamp, m, engine.liquidationCurve(loan.tier));
    }

    function isLiquidatable(uint256 loanId) public view returns (bool) {
        Loan storage loan = loans[loanId];
        if (loan.status != Status.Active) return false;
        if (block.timestamp > uint256(loan.maturity) + gracePeriod) return true;
        if (loan.breachAt == 0 || block.timestamp < uint256(loan.breachAt) + cureWindow) return false;
        if (_isHealthy(loanId, 0)) return false;
        bool paydownOver = block.timestamp >= uint256(loan.breachAt) + cureWindow + paydownWindow;
        return paydownOver || _heldVested(loanId, loan) == 0;
    }

    /// @notice Current auction price (0 during the right of first refusal or with no auction).
    function currentPrice(uint256 loanId) public view returns (uint256) {
        if (loans[loanId].status != Status.Auction) return 0;
        Auction storage a = auctions[loanId];
        if (block.timestamp < a.startTime) return 0;
        uint256 elapsed = block.timestamp - a.startTime;
        if (elapsed >= auctionDuration) return a.floorPrice;
        return a.floorPrice + ((a.startPrice - a.floorPrice) * (auctionDuration - elapsed)) / auctionDuration;
    }

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function scheduleOf(uint256 loanId) external view returns (CreditEngineV2.Schedule memory) {
        return _schedule(loanId, loans[loanId]);
    }

    function loansOf(address borrower) external view returns (uint256[] memory) {
        return _loansByBorrower[borrower];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Governance (bounded)
    // ─────────────────────────────────────────────────────────────────────────

    function setFeeRecipient(address r) external onlyGovernor {
        require(r != address(0), "zero");
        feeRecipient = r;
    }

    function setFees(uint256 originationBps, uint256 reserveBps) external onlyGovernor {
        require(originationBps <= 300 && reserveBps <= 5000, "fees");
        originationFeeBps = originationBps;
        reserveFactorBps = reserveBps;
        emit ParamUpdated("fees", originationBps);
    }

    function setTierPremium(CreditEngineV2.Tier tier, uint256 bps) external onlyGovernor {
        require(bps <= 2000, "premium");
        tierPremiumBps[uint256(tier)] = bps;
        emit ParamUpdated("tierPremium", bps);
    }

    function setOptInBackstopBps(uint256 bps) external onlyGovernor {
        require(bps >= MIN_OPT_IN_BACKSTOP_BPS && bps <= BPS, "backstop");
        optInBackstopBps = bps;
        emit ParamUpdated("optInBackstopBps", bps);
    }

    function setLimits(uint256 exposureCapBps, uint256 _maxTerm, uint256 _minBorrow) external onlyGovernor {
        require(exposureCapBps <= 2500, "exposure cap");
        require(_maxTerm >= 30 days && _maxTerm <= 4 * 365 days, "term");
        tokenExposureCapBps = exposureCapBps;
        maxTerm = _maxTerm;
        minBorrow = _minBorrow;
        emit ParamUpdated("tokenExposureCapBps", exposureCapBps);
    }

    function setLadder(
        uint256 _grace,
        uint256 _cure,
        uint256 _paydownWindow,
        uint256 _advShareBps,
        uint256 _discountBps,
        uint256 _marginBps
    ) external onlyGovernor {
        require(_grace >= 1 days && _grace <= 30 days, "grace");
        require(_cure >= 1 hours && _cure <= 7 days, "cure");
        require(_paydownWindow <= 14 days, "paydown window");
        require(_advShareBps <= 1000 && _discountBps <= 1000 && _marginBps <= 2000, "paydown");
        gracePeriod = _grace;
        cureWindow = _cure;
        paydownWindow = _paydownWindow;
        paydownAdvShareBps = _advShareBps;
        paydownDiscountBps = _discountBps;
        healthMarginBps = _marginBps;
        emit ParamUpdated("ladder", _cure);
    }

    function setAuction(uint256 _rofrWindow, uint256 _partnerShareBps, uint256 _duration, uint256 _floorDecayBps) external onlyGovernor {
        require(_rofrWindow <= 7 days, "rofr");
        require(_partnerShareBps >= 5000 && _partnerShareBps <= BPS, "partner share");
        require(_duration >= 1 hours && _duration <= 14 days, "duration");
        require(_floorDecayBps >= 5000 && _floorDecayBps < BPS, "floor decay");
        rofrWindow = _rofrWindow;
        partnerShareBps = _partnerShareBps;
        auctionDuration = _duration;
        floorDecayBps = _floorDecayBps;
        emit ParamUpdated("auction", _duration);
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

    function _readSchedule(uint256 escrowId) internal view returns (CreditEngineV2.Schedule memory sch) {
        (uint64 start, uint64 cliff, uint64 end, uint256 total, uint256 withdrawn) = adapter.schedule(escrowId);
        sch = CreditEngineV2.Schedule(start, cliff, end, total, withdrawn);
    }

    /// Stored schedule with paydown sales added to what is consumed.
    function _schedule(uint256 loanId, Loan storage loan) internal view returns (CreditEngineV2.Schedule memory sch) {
        sch = _schedules[loanId];
        sch.consumed += loan.sold;
    }

    function _heldVested(uint256 loanId, Loan storage loan) internal view returns (uint256) {
        CreditEngineV2.Schedule memory sch = _schedule(loanId, loan);
        uint256 v = engine.vestedAt(sch, block.timestamp);
        return v > sch.consumed ? v - sch.consumed : 0;
    }

    /// Healthy if debt · (1 + margin) ≤ CV_αℓ. Without a fresh price a loan counts as healthy:
    /// only maturity can liquidate it then.
    function _isHealthy(uint256 loanId, uint256 marginBps) internal view returns (bool) {
        try this.health(loanId) returns (uint256 debt, uint256 cv) {
            return Math.mulDiv(debt, BPS + marginBps, BPS) <= cv;
        } catch {
            return true;
        }
    }

    function _debt(Loan storage loan) internal view returns (uint256) {
        return loan.principal + loan.accrued + _pending(loan);
    }

    function _pending(Loan storage loan) internal view returns (uint256) {
        return (loan.principal * loan.rateBps * (block.timestamp - loan.lastAccrual)) / (YEAR * BPS);
    }

    function _accrueLoan(Loan storage loan) internal {
        uint256 dt = block.timestamp - loan.lastAccrual;
        if (dt == 0) return;
        uint256 delta = (loan.principal * loan.rateBps * dt) / (YEAR * BPS);
        loan.accrued += delta;
        sumAccrued += delta;
        sumPrT += loan.principal * loan.rateBps * dt;
        loan.lastAccrual = uint64(block.timestamp);
    }

    /// Interest first, then principal. Returns what was applied.
    function _applyPayment(Loan storage loan, uint256 amount) internal returns (uint256 interestPaid, uint256 principalPaid, bool closed) {
        _accrueLoan(loan);
        interestPaid = amount < loan.accrued ? amount : loan.accrued;
        principalPaid = amount - interestPaid;
        if (principalPaid > loan.principal) principalPaid = loan.principal;

        loan.accrued -= interestPaid;
        sumAccrued -= interestPaid;
        if (principalPaid > 0) {
            uint256 pr = principalPaid * loan.rateBps;
            sumPrincipal -= principalPaid;
            sumPr -= pr;
            sumPrT -= pr * loan.lastAccrual;
            loan.principal -= principalPaid;
            exposure[loan.token] -= principalPaid;
        }
        closed = loan.principal == 0 && loan.accrued == 0;
    }

    function _addToBook(uint256 principal, uint256 accrued, uint256 rateBps) internal {
        sumPrincipal += principal;
        sumAccrued += accrued;
        sumPr += principal * rateBps;
        sumPrT += principal * rateBps * block.timestamp;
    }

    function _removeFromBook(Loan storage loan) internal {
        uint256 pr = loan.principal * loan.rateBps;
        sumPrincipal -= loan.principal;
        sumAccrued -= loan.accrued;
        sumPr -= pr;
        sumPrT -= pr * loan.lastAccrual;
    }

    /// Send a repayment on: the reserve factor's share of interest to insurance, the rest to the pool.
    function _payLenders(uint256 amount, uint256 interest) internal {
        uint256 reserve = (interest * reserveFactorBps) / BPS;
        if (reserve > 0) usdc.safeTransfer(address(insurance), reserve);
        _repayPool(amount - reserve);
    }

    function _repayPool(uint256 amount) internal {
        if (amount == 0) return;
        usdc.forceApprove(address(pool), amount);
        pool.repay(amount);
    }

    function _close(uint256 loanId, Loan storage loan) internal {
        loan.breachAt = 0;
        if (loan.tier == CreditEngineV2.Tier.OptIn) backstop.unlock(loanId);
        adapter.release(loan.escrowId, loan.borrower);
    }

    function _settle(uint256 loanId, Loan storage loan, Auction memory a, uint256 price, address winner) internal {
        uint256 toDebt = price < a.debt ? price : a.debt;
        uint256 surplus = price - toDebt;
        uint256 fromBackstop;
        uint256 fromInsurance;
        if (toDebt < a.debt) {
            uint256 shortfall = a.debt - toDebt;
            fromBackstop = backstop.draw(loanId, loan.token, shortfall);
            if (fromBackstop < shortfall) fromInsurance = insurance.cover(shortfall - fromBackstop);
        } else if (loan.tier == CreditEngineV2.Tier.OptIn) {
            backstop.unlock(loanId);
        }
        uint256 received = toDebt + fromBackstop + fromInsurance;
        uint256 toLenders = received < a.claim ? received : a.claim;
        uint256 loss = a.claim - toLenders;

        loan.principal = 0;
        loan.status = Status.Liquidated;
        totalAuctionMarks -= a.mark;
        totalLosses += loss;
        delete auctions[loanId];
        if (surplus > 0) claimable[loan.borrower] += surplus;

        if (received > toLenders) usdc.safeTransfer(address(insurance), received - toLenders);
        _repayPool(toLenders);
        adapter.release(loan.escrowId, winner);

        emit LoanLiquidated(loanId, winner, price, fromBackstop, fromInsurance, loss, surplus);
    }
}
