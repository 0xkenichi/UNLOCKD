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

/**
 * @title  LendingPool
 * @notice ERC-4626 USDC vault that funds Vestra loans.
 *
 *         • The pool holds every lender dollar itself. No treasury wallet, role or
 *           LoanManager can move idle funds except by `lend`, which only the
 *           (set-once) LoanManager can call and which is booked as a receivable.
 *         • totalAssets = idle USDC + principal outstanding. Interest is recognised
 *           when paid and raises the share price for all lenders.
 *         • Losses are recognised by `writeOff`, which lowers totalAssets and so
 *           the share price for all lenders pro rata. No lender can exit at par
 *           ahead of a known loss being booked.
 *         • Idle USDC is tracked internally, so tokens sent directly to the pool do
 *           not move the share price (no donation / inflation attack); a 6-decimal
 *           virtual-share offset is used as a second layer.
 *         • Withdrawals are limited only by idle liquidity. Pausing blocks deposits
 *           and new loans, never withdrawals.
 */
contract LendingPool is ERC4626, VestraAccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant BPS = 10_000;

    address public loanManager;

    uint256 public idleAssets;      // USDC held and available
    uint256 public totalBorrowed;   // principal outstanding
    uint256 public totalWrittenOff; // cumulative principal losses
    uint256 public depositCap;      // 0 = uncapped

    // Kinked utilization rate model (APR, bps)
    uint256 public baseRateBps = 500;
    uint256 public slope1Bps   = 1000;
    uint256 public slope2Bps   = 6000;
    uint256 public kinkBps     = 8000;

    event LoanManagerSet(address indexed loanManager);
    event Lent(address indexed to, uint256 amount);
    event Repaid(uint256 principal, uint256 interest);
    event WrittenOff(uint256 principal);
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
        totalBorrowed += amount;
        IERC20(asset()).safeTransfer(to, amount);
        emit Lent(to, amount);
    }

    /// @notice Pull `principal + interest` from the LoanManager.
    function repay(uint256 principal, uint256 interest) external onlyLoanManager nonReentrant {
        require(principal <= totalBorrowed, "repay > borrowed");
        totalBorrowed -= principal;
        idleAssets += principal + interest;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), principal + interest);
        emit Repaid(principal, interest);
    }

    /// @notice Recognise a principal loss. Lowers the share price for every lender.
    function writeOff(uint256 principal) external onlyLoanManager {
        require(principal <= totalBorrowed, "writeOff > borrowed");
        totalBorrowed -= principal;
        totalWrittenOff += principal;
        emit WrittenOff(principal);
    }

    /// @notice Add assets for all lenders (e.g. later recoveries). Raises the share price.
    function donate(uint256 amount) external nonReentrant {
        idleAssets += amount;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);
        emit Donated(msg.sender, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function totalAssets() public view override returns (uint256) {
        return idleAssets + totalBorrowed;
    }

    function utilizationBps() public view returns (uint256) {
        uint256 assets = totalAssets();
        return assets == 0 ? 0 : (totalBorrowed * BPS) / assets;
    }

    /// @notice Borrow APR (bps) at the current utilization.
    function borrowRateBps() public view returns (uint256) {
        return _rateAt(utilizationBps());
    }

    /// @notice Borrow APR (bps) after borrowing an additional `amount`.
    function borrowRateAfter(uint256 amount) external view returns (uint256) {
        uint256 assets = totalAssets();
        if (assets == 0) return _rateAt(BPS);
        uint256 u = ((totalBorrowed + amount) * BPS) / assets;
        return _rateAt(u > BPS ? BPS : u);
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

    function _rateAt(uint256 u) internal view returns (uint256) {
        if (u <= kinkBps) return baseRateBps + (u * slope1Bps) / kinkBps;
        return baseRateBps + slope1Bps + ((u - kinkBps) * slope2Bps) / (BPS - kinkBps);
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
