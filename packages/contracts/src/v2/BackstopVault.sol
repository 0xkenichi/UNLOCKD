// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../governance/VestraAccessControl.sol";

/**
 * @title  BackstopVault
 * @notice Partner first-loss capital, per token. The issuing project deposits USDC here; it
 *         repays lenders before the insurance fund or the lenders themselves take any loss.
 *
 *         free     the partner's uncommitted balance for a token; the partner may withdraw it
 *         locked   committed to one open opt-in loan (16% of its principal); only that loan's
 *                  settlement can draw it, and it returns to `free` when the loan closes
 *
 *         On a shortfall the loan's own lock pays first, then the token's free balance.
 *         Only the (set-once) loan manager can lock, unlock or draw.
 */
contract BackstopVault is VestraAccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    address public loanManager;

    mapping(address => address) public partnerOf;     // token → partner (receives ROFR buybacks)
    mapping(address => uint256) public free;          // token → uncommitted backstop
    mapping(address => uint256) public lockedTotal;   // token → sum of loan locks
    mapping(uint256 => uint256) public lockedFor;     // loanId → lock
    mapping(uint256 => address) public lockToken;     // loanId → token

    event PartnerSet(address indexed token, address indexed partner);
    event LoanManagerSet(address indexed loanManager);
    event Deposited(address indexed token, address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event Locked(uint256 indexed loanId, address indexed token, uint256 amount);
    event Unlocked(uint256 indexed loanId, uint256 amount);
    event Drawn(uint256 indexed loanId, address indexed token, uint256 requested, uint256 paid);

    constructor(IERC20 _usdc, address governor) VestraAccessControl(governor) {
        require(address(_usdc) != address(0), "usdc=0");
        usdc = _usdc;
    }

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "only loan manager");
        _;
    }

    function setLoanManager(address _loanManager) external onlyGovernor {
        require(_loanManager != address(0), "loanManager=0");
        require(loanManager == address(0), "already set");
        loanManager = _loanManager;
        emit LoanManagerSet(_loanManager);
    }

    /// @notice Name the partner for a token (set in the partner agreement).
    function setPartner(address token, address partner) external onlyGovernor {
        require(token != address(0) && partner != address(0), "zero address");
        partnerOf[token] = partner;
        emit PartnerSet(token, partner);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Partner
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Add backstop for `token`. Anyone may fund it; only the partner may withdraw.
    function deposit(address token, uint256 amount) external nonReentrant {
        require(partnerOf[token] != address(0), "no partner");
        require(amount > 0, "amount=0");
        free[token] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, msg.sender, amount);
    }

    /// @notice Withdraw uncommitted backstop. Locked amounts stay until their loans close.
    function withdraw(address token, uint256 amount, address to) external nonReentrant {
        require(msg.sender == partnerOf[token], "only partner");
        require(amount <= free[token], "exceeds free");
        free[token] -= amount;
        usdc.safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Loan manager
    // ─────────────────────────────────────────────────────────────────────────

    function lock(address token, uint256 loanId, uint256 amount) external onlyLoanManager {
        require(lockedFor[loanId] == 0, "already locked");
        require(amount > 0 && amount <= free[token], "insufficient backstop");
        free[token] -= amount;
        lockedTotal[token] += amount;
        lockedFor[loanId] = amount;
        lockToken[loanId] = token;
        emit Locked(loanId, token, amount);
    }

    /// @notice Return a closed loan's lock to the partner's free balance.
    function unlock(uint256 loanId) external onlyLoanManager {
        _unlock(loanId);
    }

    /// @notice Pay up to `amount` toward a loan's shortfall: its lock first, then the token's free
    ///         balance. Whatever is left of the lock returns to `free`.
    function draw(uint256 loanId, address token, uint256 amount) external onlyLoanManager nonReentrant returns (uint256 paid) {
        uint256 fromLock = lockedFor[loanId];
        if (fromLock > amount) fromLock = amount;
        if (fromLock > 0) {
            lockedFor[loanId] -= fromLock;
            lockedTotal[token] -= fromLock;
        }
        uint256 fromFree = amount - fromLock;
        if (fromFree > free[token]) fromFree = free[token];
        free[token] -= fromFree;
        _unlock(loanId);
        paid = fromLock + fromFree;
        if (paid > 0) usdc.safeTransfer(msg.sender, paid);
        emit Drawn(loanId, token, amount, paid);
    }

    function _unlock(uint256 loanId) internal {
        uint256 amount = lockedFor[loanId];
        if (amount == 0) return;
        address token = lockToken[loanId];
        lockedFor[loanId] = 0;
        lockedTotal[token] -= amount;
        free[token] += amount;
        emit Unlocked(loanId, amount);
    }
}
