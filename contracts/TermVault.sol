// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./governance/VestraAccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Fixed-term USDC vault with treasury-prefunded minimum returns.
/// @dev This is intentionally separate from `LendingPool` so we can ship fixed-term
///      deposits without refactoring the existing pool accounting. Guarantees are
///      only as strong as the vault being prefunded with reward reserves; deposits
///      will revert if the contract does not have enough free reward budget.
contract TermVault is VestraAccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    IERC20 public immutable usdc;

    struct Tranche {
        uint64 termSeconds;
        uint32 minApyBps; // Linear simple-interest APY in bps.
        bool enabled;
    }

    struct Position {
        address owner;
        uint32 trancheId;
        uint64 startTime;
        uint64 endTime;
        uint256 principal;
        uint256 guaranteedInterest;
        uint256 interestClaimed;
        bool closed;
    }

    mapping(uint32 => Tranche) public tranches;
    mapping(uint256 => Position) public positions;
    uint256 public nextPositionId;

    // Accounting for "guarantee capacity":
    // - totalPrincipalLocked: sum of all active principals.
    // - reservedRewards: unpaid guaranteed interest for active positions.
    uint256 public totalPrincipalLocked;
    uint256 public reservedRewards;

    uint256 public earlyExitFeeBps; // 0-2000 (0-20%)
    address public feeRecipient;

    event TrancheUpdated(uint32 indexed trancheId, uint64 termSeconds, uint32 minApyBps, bool enabled);
    event FeeConfigUpdated(uint256 earlyExitFeeBps, address feeRecipient);
    event RewardsFunded(address indexed from, uint256 amount);
    event TermDeposited(uint256 indexed positionId, address indexed owner, uint32 indexed trancheId, uint256 amount);
    event InterestClaimed(uint256 indexed positionId, address indexed owner, uint256 amount);
    event WithdrawnAtMaturity(uint256 indexed positionId, address indexed owner, uint256 principal, uint256 interest);
    event EarlyWithdrawn(uint256 indexed positionId, address indexed owner, uint256 payout, uint256 fee, uint256 forfeitedInterest);

    constructor(address _usdc, address _feeRecipient, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_usdc != address(0), "usdc=0");
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient == address(0) ? msg.sender : _feeRecipient;
    }

    // -------- Admin --------

    function setTranche(uint32 trancheId, uint64 termSeconds, uint32 minApyBps, bool enabled) external onlyGovernor {
        require(termSeconds > 0, "term=0");
        require(minApyBps <= 5000, "apy too high"); // guardrail for MVP
        tranches[trancheId] = Tranche({ termSeconds: termSeconds, minApyBps: minApyBps, enabled: enabled });
        emit TrancheUpdated(trancheId, termSeconds, minApyBps, enabled);
    }

    function setFeeConfig(uint256 _earlyExitFeeBps, address _feeRecipient) external onlyGovernor {
        require(_earlyExitFeeBps <= 2000, "fee too high");
        require(_feeRecipient != address(0), "recipient=0");
        earlyExitFeeBps = _earlyExitFeeBps;
        feeRecipient = _feeRecipient;
        emit FeeConfigUpdated(_earlyExitFeeBps, _feeRecipient);
    }

    function pause() external onlyGovernor {
        _pause();
    }

    function unpause() external onlyGovernor {
        _unpause();
    }

    // -------- Funding / capacity --------

    /// @notice Adds reward reserves to the vault.
    /// @dev Anyone can fund; guarantees are enforced by deposit-time budget checks.
    function fundRewards(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "amount=0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardsFunded(msg.sender, amount);
    }

    /// @notice Returns the free reward budget (USDC) not backing principal or reserved rewards.
    function availableRewardBudget() public view returns (uint256) {
        uint256 bal = usdc.balanceOf(address(this));
        uint256 locked = totalPrincipalLocked + reservedRewards;
        if (bal <= locked) return 0;
        return bal - locked;
    }

    // -------- User actions --------

    function depositTerm(uint32 trancheId, uint256 amount) external nonReentrant whenNotPaused returns (uint256 positionId) {
        Tranche memory t = tranches[trancheId];
        require(t.enabled, "tranche disabled");
        require(amount > 0, "amount=0");

        uint256 guaranteedInterest = (amount * uint256(t.minApyBps) * uint256(t.termSeconds)) / (BPS_DENOMINATOR * SECONDS_PER_YEAR);
        // Guarantee requires prefunded reward budget; principal does not increase reward budget.
        require(availableRewardBudget() >= guaranteedInterest, "insufficient reward budget");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        positionId = nextPositionId;
        nextPositionId += 1;

        uint64 startTime = uint64(block.timestamp);
        uint64 endTime = startTime + t.termSeconds;
        positions[positionId] = Position({
            owner: msg.sender,
            trancheId: trancheId,
            startTime: startTime,
            endTime: endTime,
            principal: amount,
            guaranteedInterest: guaranteedInterest,
            interestClaimed: 0,
            closed: false
        });

        totalPrincipalLocked += amount;
        reservedRewards += guaranteedInterest;

        emit TermDeposited(positionId, msg.sender, trancheId, amount);
    }

    function claimInterest(uint256 positionId) external nonReentrant whenNotPaused {
        Position storage p = positions[positionId];
        require(!p.closed, "closed");
        require(p.owner == msg.sender, "not owner");

        uint256 claimable = _claimableInterest(p);
        require(claimable > 0, "nothing to claim");

        p.interestClaimed += claimable;
        reservedRewards -= claimable;
        usdc.safeTransfer(msg.sender, claimable);
        emit InterestClaimed(positionId, msg.sender, claimable);
    }

    function withdrawAtMaturity(uint256 positionId) external nonReentrant whenNotPaused {
        Position storage p = positions[positionId];
        require(!p.closed, "closed");
        require(p.owner == msg.sender, "not owner");
        require(block.timestamp >= p.endTime, "not matured");

        uint256 remainingInterest = p.guaranteedInterest - p.interestClaimed;
        uint256 principal = p.principal;

        p.closed = true;
        p.principal = 0;

        totalPrincipalLocked -= principal;
        reservedRewards -= remainingInterest;

        usdc.safeTransfer(msg.sender, principal + remainingInterest);
        emit WithdrawnAtMaturity(positionId, msg.sender, principal, remainingInterest);
    }

    function earlyWithdraw(uint256 positionId) external nonReentrant whenNotPaused {
        Position storage p = positions[positionId];
        require(!p.closed, "closed");
        require(p.owner == msg.sender, "not owner");
        require(block.timestamp < p.endTime, "already matured");

        uint256 principal = p.principal;
        uint256 fee = (principal * earlyExitFeeBps) / BPS_DENOMINATOR;
        uint256 payout = principal - fee;
        uint256 forfeitedInterest = p.guaranteedInterest - p.interestClaimed;

        p.closed = true;
        p.principal = 0;

        totalPrincipalLocked -= principal;
        reservedRewards -= forfeitedInterest;

        if (fee > 0) {
            usdc.safeTransfer(feeRecipient, fee);
        }
        usdc.safeTransfer(msg.sender, payout);

        emit EarlyWithdrawn(positionId, msg.sender, payout, fee, forfeitedInterest);
    }

    // -------- Views --------

    function positionStatus(uint256 positionId) external view returns (string memory) {
        Position memory p = positions[positionId];
        if (p.owner == address(0)) return "missing";
        if (p.closed) return "closed";
        if (block.timestamp >= p.endTime) return "matured";
        return "active";
    }

    function claimableInterest(uint256 positionId) external view returns (uint256) {
        Position storage p = positions[positionId];
        if (p.closed) return 0;
        return _claimableInterest(p);
    }

    function _claimableInterest(Position storage p) internal view returns (uint256) {
        if (p.guaranteedInterest == 0) return 0;
        if (p.interestClaimed >= p.guaranteedInterest) return 0;
        uint256 elapsed = block.timestamp >= p.endTime ? uint256(p.endTime - p.startTime) : uint256(block.timestamp - p.startTime);
        uint256 duration = uint256(p.endTime - p.startTime);
        if (duration == 0) return 0;
        uint256 accrued = (p.guaranteedInterest * elapsed) / duration;
        if (accrued <= p.interestClaimed) return 0;
        return accrued - p.interestClaimed;
    }
}

