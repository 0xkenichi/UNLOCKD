// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./governance/VestraAccessControl.sol";

/// @notice What the pool needs from the LoanManager.
interface ILoanBook {
    /// @notice Lenders' claim on outstanding loans: principal + accrued interest net of the
    ///         reserve factor + the marked-down value of loans in liquidation.
    function lenderClaim() external view returns (uint256);
    /// @notice Bring the borrow index up to date at the current rate.
    function accrue() external;
}

/**
 * @title  LendingPool
 * @notice ERC-4626 USDC vault that funds Vestra loans.
 *
 *         • The pool holds every idle lender dollar itself. Only the (set-once)
 *           LoanManager can draw funds, via `lend`.
 *         • totalAssets = idle USDC + LoanManager.lenderClaim(). Interest accrues into
 *           the share price continuously (not when paid), so depositing just before a
 *           repayment captures nothing.
 *         • A loan entering liquidation is immediately marked down to a conservative
 *           recovery value, so lenders cannot exit at par ahead of a loss that is
 *           already being realised. Shortfalls lower the share price for all lenders.
 *         • Every deposit/withdraw first accrues the borrow index at the rate that
 *           applied before the change, so flash deposits cannot lower anyone's rate.
 *         • Idle USDC is tracked internally (direct transfers do not move the share
 *           price) and a 6-decimal virtual-share offset is used as a second layer.
 *         • Pausing blocks deposits and new loans, never withdrawals.
 */
contract LendingPool is ERC4626, VestraAccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;

    address public loanManager;
    uint256 public idleAssets;
    uint256 public depositCap; // 0 = uncapped

    // Kinked utilization rate model (APR, bps)
    uint256 public baseRateBps = 500;
    uint256 public slope1Bps   = 1000;
    uint256 public slope2Bps   = 6000;
    uint256 public kinkBps     = 8000;

    event LoanManagerSet(address indexed loanManager);
    event Lent(address indexed to, uint256 amount);
    event Repaid(uint256 amount);
    event Donated(address indexed from, uint256 amount);
    event RateModelUpdated(uint256 baseRateBps, uint256 slope1Bps, uint256 slope2Bps, uint256 kinkBps);
    event DepositCapUpdated(uint256 cap);

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "only loan manager");
        _;
    }

    constructor(IERC20 _usdc, address _governor)
        ERC20("Vestra USDC Lending Pool", "vUSDC")
        ERC4626(_usdc)
        VestraAccessControl(_governor)
    {}

    // ─────────────────────────────────────────────────────────────────────────
    // Governance
    // ─────────────────────────────────────────────────────────────────────────

    function setLoanManager(address _loanManager) external onlyGovernor {
        require(_loanManager != address(0), "loanManager=0");
        require(loanManager == address(0), "already set");
        loanManager = _loanManager;
        emit LoanManagerSet(_loanManager);
    }

    function setRateModel(uint256 base, uint256 s1, uint256 s2, uint256 kink) external onlyGovernor {
        require(kink > 0 && kink < BPS, "kink");
        require(base + s1 + s2 <= 20_000, "max APR 200%");
        _accrueLoans();
        baseRateBps = base;
        slope1Bps = s1;
        slope2Bps = s2;
        kinkBps = kink;
        emit RateModelUpdated(base, s1, s2, kink);
    }

    function setDepositCap(uint256 cap) external onlyGovernor {
        depositCap = cap;
        emit DepositCapUpdated(cap);
    }

    function pause() external {
        require(hasRole(GUARDIAN_ROLE, msg.sender) || hasRole(PAUSER_ROLE, msg.sender), "not pauser");
        _pause();
    }

    function unpause() external onlyGovernor {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LoanManager
    // ─────────────────────────────────────────────────────────────────────────

    function lend(address to, uint256 amount) external onlyLoanManager whenNotPaused nonReentrant {
        require(amount > 0, "amount=0");
        require(amount <= idleAssets, "insufficient liquidity");
        idleAssets -= amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit Lent(to, amount);
    }

    /// @notice Pull `amount` (repayments, auction proceeds, insurance) from the LoanManager.
    function repay(uint256 amount) external onlyLoanManager nonReentrant {
        idleAssets += amount;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        emit Repaid(amount);
    }

    /// @notice Add assets for all lenders (e.g. later recoveries). Raises the share price.
    function donate(uint256 amount) external nonReentrant {
        idleAssets += amount;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        emit Donated(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC-4626 entry points: accrue first so the elapsed period is priced at the
    // utilization that actually prevailed.
    // ─────────────────────────────────────────────────────────────────────────

    function deposit(uint256 assets, address receiver) public override returns (uint256) {
        _accrueLoans();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override returns (uint256) {
        _accrueLoans();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner) public override returns (uint256) {
        _accrueLoans();
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner) public override returns (uint256) {
        _accrueLoans();
        return super.redeem(shares, receiver, owner);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function totalAssets() public view override returns (uint256) {
        return idleAssets + totalBorrowed();
    }

    /// @notice Lenders' claim on loans (principal + net accrued interest + marked auctions).
    function totalBorrowed() public view returns (uint256) {
        return loanManager == address(0) ? 0 : ILoanBook(loanManager).lenderClaim();
    }

    function utilizationBps() public view returns (uint256) {
        return utilizationFor(totalBorrowed(), idleAssets);
    }

    function utilizationFor(uint256 borrowed, uint256 idle) public pure returns (uint256) {
        uint256 assets = borrowed + idle;
        return assets == 0 ? 0 : (borrowed * BPS) / assets;
    }

    /// @notice Borrow APR (bps) at the current utilization.
    function borrowRateBps() external view returns (uint256) {
        return rateAt(utilizationBps());
    }

    /// @notice Borrow APR (bps) after borrowing an additional `amount`.
    function borrowRateAfter(uint256 amount) external view returns (uint256) {
        uint256 borrowed = totalBorrowed();
        if (amount > idleAssets) return rateAt(BPS);
        return rateAt(utilizationFor(borrowed + amount, idleAssets - amount));
    }

    /// @notice APR (bps) for a utilization `u` (bps).
    function rateAt(uint256 u) public view returns (uint256) {
        if (u > BPS) u = BPS;
        if (u <= kinkBps) return baseRateBps + (u * slope1Bps) / kinkBps;
        return baseRateBps + slope1Bps + ((u - kinkBps) * slope2Bps) / (BPS - kinkBps);
    }

    function availableLiquidity() external view returns (uint256) {
        return idleAssets;
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) return 0;
        if (depositCap == 0) return type(uint256).max;
        uint256 assets = totalAssets();
        return assets >= depositCap ? 0 : depositCap - assets;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 d = maxDeposit(receiver);
        return d == type(uint256).max ? d : _convertToShares(d, Math.Rounding.Floor);
    }

    function maxWithdraw(address owner) public view override returns (uint256) {
        uint256 owned = _convertToAssets(balanceOf(owner), Math.Rounding.Floor);
        return owned < idleAssets ? owned : idleAssets;
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        uint256 shares = balanceOf(owner);
        uint256 liquidShares = _convertToShares(idleAssets, Math.Rounding.Floor);
        return shares < liquidShares ? shares : liquidShares;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────────────────────

    function _accrueLoans() internal {
        if (loanManager != address(0)) ILoanBook(loanManager).accrue();
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        idleAssets += assets;
        super._deposit(caller, receiver, assets, shares);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        require(assets <= idleAssets, "insufficient liquidity");
        idleAssets -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }
}
