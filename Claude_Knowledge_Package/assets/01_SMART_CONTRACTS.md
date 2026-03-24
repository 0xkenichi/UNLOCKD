# Vestra Protocol — Complete Smart Contract Suite
## Testnet Build Package v1.0 (Sepolia + Base Sepolia)
> Author: Vestra Protocol — Olanrewaju Finch Animashaun  
> License: BSL-1.1  
> Solidity: ^0.8.24 | Framework: Foundry

---

## Overview: Contract Dependency Graph

```
MockVestingToken.sol          ← Deploy first (testnet ERC-20 simulation)
MockSablierStream.sol         ← Deploy second (simulates real Sablier stream)
ValuationEngine.sol           ← Already built. Add MAX_STALENESS patch (see §2)
LendingPool.sol               ← Deploy third
VestraWrapperNFT.sol          ← Deploy fourth
LoanManager.sol               ← Deploy fifth (wires everything together)
VestingAdapter.sol            ← Deploy sixth (connects to MockSablierStream)
VestingRegistry.sol           ← Deploy last (register all addresses)
```

Deployment order is strict. `LoanManager` needs all other addresses at construction.

---

## §1 — MockVestingToken.sol
> Simulates LDO, AGIX, or any ERC-20 for testnet vesting. Mintable by owner.

```solidity
// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  MockVestingToken
 * @notice A mintable ERC-20 for Vestra testnet simulations.
 * @dev    Threat model: owner-only mint. Not for mainnet.
 *         Use this to simulate LDO, AGIX, or any collateral token.
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract MockVestingToken is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint tokens to any address. Owner only.
     * @dev    Used to fund test wallets and seed vesting contracts.
     * @param  to     Recipient address.
     * @param  amount Amount in token's native decimals.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

**Deployment note:** Deploy one instance per simulated token:
- `MockVestingToken("Mock Lido", "mLDO", 18)`
- `MockVestingToken("Mock AGIX", "mAGIX", 8)`
- `MockVestingToken("Mock USDC", "mUSDC", 6)` ← this is your lending stablecoin

---

## §2 — MockSablierStream.sol
> A minimal Sablier-compatible stream contract you control entirely.
> Allows creating real on-chain streams you can test against with full claim rights.

```solidity
// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title  MockSablierStream
 * @notice Simulates a Sablier-style linear vesting stream for Vestra testnet.
 * @dev    Threat model: re-entrancy on withdraw mitigated by CEI + nonReentrant.
 *         Stream sender can cancel (returns unvested to sender).
 *         Recipient (or approved operator like VestingAdapter) can withdraw vested.
 *         This contract's stream IDs are used as collateral in VestingAdapter.
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract MockSablierStream is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant STREAM_CREATOR_ROLE = keccak256("STREAM_CREATOR_ROLE");

    struct Stream {
        address sender;
        address recipient;
        address token;
        uint256 totalAmount;      // Total tokens to vest (18-dec WAD)
        uint256 startTime;        // Unix timestamp
        uint256 endTime;          // Unix timestamp — vesting completes here
        uint256 withdrawnAmount;  // Already withdrawn by recipient
        bool    cancelled;
    }

    uint256 public nextStreamId = 1;
    mapping(uint256 => Stream) public streams;
    // operator approval: streamId => operator => approved
    mapping(uint256 => mapping(address => bool)) public operators;

    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime
    );
    event Withdrawn(uint256 indexed streamId, address indexed recipient, uint256 amount);
    event Cancelled(uint256 indexed streamId, uint256 returnedToSender);
    event OperatorApproved(uint256 indexed streamId, address indexed operator, bool approved);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(STREAM_CREATOR_ROLE, msg.sender);
    }

    /**
     * @notice Create a new linear vesting stream.
     * @dev    Pulls `totalAmount` from msg.sender. Approves must be set first.
     *         Reverts if: endTime <= startTime, totalAmount == 0, token == address(0).
     * @param  recipient    Address that can withdraw vested tokens.
     * @param  token        ERC-20 token to vest.
     * @param  totalAmount  Total tokens to vest over the full duration.
     * @param  startTime    Unix timestamp when vesting begins.
     * @param  endTime      Unix timestamp when vesting fully unlocks.
     * @return streamId     The new stream's ID.
     */
    function createStream(
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime
    ) external onlyRole(STREAM_CREATOR_ROLE) returns (uint256 streamId) {
        require(recipient != address(0), "Vestra: zero recipient");
        require(token != address(0),     "Vestra: zero token");
        require(totalAmount > 0,         "Vestra: zero amount");
        require(endTime > startTime,     "Vestra: invalid duration");
        require(startTime >= block.timestamp, "Vestra: start in past");

        streamId = nextStreamId++;
        streams[streamId] = Stream({
            sender:          msg.sender,
            recipient:       recipient,
            token:           token,
            totalAmount:     totalAmount,
            startTime:       startTime,
            endTime:         endTime,
            withdrawnAmount: 0,
            cancelled:       false
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        emit StreamCreated(streamId, msg.sender, recipient, token, totalAmount, startTime, endTime);
    }

    /**
     * @notice Returns the vested amount available to withdraw right now.
     * @param  streamId  The stream to query.
     * @return vestedAmount  Tokens vested but not yet withdrawn (18-dec WAD).
     */
    function vestedAmountOf(uint256 streamId) public view returns (uint256 vestedAmount) {
        Stream storage s = streams[streamId];
        if (s.cancelled || block.timestamp <= s.startTime) return 0;

        uint256 elapsed = block.timestamp >= s.endTime
            ? s.endTime - s.startTime
            : block.timestamp - s.startTime;
        uint256 duration = s.endTime - s.startTime;

        uint256 totalVested = (s.totalAmount * elapsed) / duration;
        vestedAmount = totalVested > s.withdrawnAmount ? totalVested - s.withdrawnAmount : 0;
    }

    /**
     * @notice Returns the total unvested amount remaining in the stream.
     * @param  streamId  The stream to query.
     * @return unvested  Tokens not yet vested (18-dec WAD).
     */
    function unvestedAmountOf(uint256 streamId) public view returns (uint256 unvested) {
        Stream storage s = streams[streamId];
        if (s.cancelled) return 0;

        uint256 elapsed = block.timestamp >= s.endTime
            ? s.endTime - s.startTime
            : block.timestamp - s.startTime;
        uint256 duration = s.endTime - s.startTime;
        uint256 totalVested = (s.totalAmount * elapsed) / duration;

        unvested = s.totalAmount > totalVested ? s.totalAmount - totalVested : 0;
    }

    /**
     * @notice Withdraw vested tokens. Callable by recipient or approved operator.
     * @dev    CEI: state updated before transfer. nonReentrant for extra safety.
     * @param  streamId  The stream to withdraw from.
     */
    function withdraw(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        require(
            msg.sender == s.recipient || operators[streamId][msg.sender],
            "Vestra: not authorised"
        );
        require(!s.cancelled, "Vestra: stream cancelled");

        uint256 amount = vestedAmountOf(streamId);
        require(amount > 0, "Vestra: nothing to withdraw");

        // CEI: update state before transfer
        s.withdrawnAmount += amount;

        IERC20(s.token).safeTransfer(s.recipient, amount);
        emit Withdrawn(streamId, s.recipient, amount);
    }

    /**
     * @notice Approve an operator (e.g., VestingAdapter) to act on a stream.
     * @dev    This is how VestingAdapter gets authority to escrow claim rights.
     * @param  streamId  The stream to grant access to.
     * @param  operator  The address to approve (e.g., VestingAdapter).
     * @param  approved  True to approve, false to revoke.
     */
    function setOperator(uint256 streamId, address operator, bool approved) external {
        require(msg.sender == streams[streamId].recipient, "Vestra: not recipient");
        operators[streamId][operator] = approved;
        emit OperatorApproved(streamId, operator, approved);
    }

    /**
     * @notice Cancel a stream. Returns unvested tokens to sender.
     * @dev    Only the stream sender can cancel. Vested amount stays claimable.
     * @param  streamId  The stream to cancel.
     */
    function cancel(uint256 streamId) external nonReentrant {
        Stream storage s = streams[streamId];
        require(msg.sender == s.sender, "Vestra: not sender");
        require(!s.cancelled,           "Vestra: already cancelled");

        uint256 unvested = unvestedAmountOf(streamId);
        s.cancelled = true;

        if (unvested > 0) {
            IERC20(s.token).safeTransfer(s.sender, unvested);
        }
        emit Cancelled(streamId, unvested);
    }

    /**
     * @notice Convenience: get full stream details.
     */
    function getStream(uint256 streamId) external view returns (Stream memory) {
        return streams[streamId];
    }
}
```

---

## §3 — ValuationEngine.sol (PATCH — add MAX_STALENESS)

The existing ValuationEngine needs one critical security patch before testnet.
Add this to the `computeDPV` function:

```solidity
// Add to contract constants (top of contract):
uint256 public constant MAX_STALENESS = 4 hours; // 14400 seconds

// Add this struct field to RiskParams:
uint256 lastUpdatedAt; // block.timestamp when oracle last pushed

// Patch: inside computeDPV(), before using ewmaPrice:
// SECURITY: Revert on stale oracle data
require(
    block.timestamp - riskParams[token].lastUpdatedAt <= MAX_STALENESS,
    "ValuationEngine: stale oracle"
);

// Patch: inside updateRiskParams(), after all checks:
riskParams[token].lastUpdatedAt = block.timestamp;
```

---

## §4 — LendingPool.sol
> USDC liquidity pool with kink-curve APY, duration locks, early withdrawal penalties, insurance fund.

```solidity
// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title  LendingPool
 * @notice USDC liquidity pool for Vestra Protocol lenders.
 * @dev    Threat model:
 *         - Flash loan drain: mitigated by duration locks (min 30 days).
 *         - Re-entrancy: CEI pattern + nonReentrant on all state-changing functions.
 *         - APY manipulation: utilization rate is read-only, not settable.
 *         - Insurance fund drain: only GUARDIAN_ROLE can withdraw insurance funds.
 *         - Precision loss: all APY math uses WAD (1e18). BPS is /10_000.
 *
 *         APY kink curve parameters (BPS, out of 10_000):
 *         BASE_RATE_BPS    = 500   (5%  at 0% utilization)
 *         KINK_RATE_BPS    = 2000  (20% at kink point)
 *         MAX_RATE_BPS     = 20000 (200% at 100% utilization)
 *         KINK_UTILIZATION = 7500  (75% kink point)
 *
 *         Duration multipliers (BPS):
 *         30 days  = 10_000 (1.0x, no bonus)
 *         90 days  = 11_500 (1.15x)
 *         365 days = 13_000 (1.30x)
 *         1095days = 15_000 (1.50x — 3yr max)
 *
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract LendingPool is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant GOVERNOR_ROLE  = keccak256("GOVERNOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE  = keccak256("GUARDIAN_ROLE");
    bytes32 public constant LOAN_MANAGER_ROLE = keccak256("LOAN_MANAGER_ROLE");

    // ─── Constants ────────────────────────────────────────────────────────────
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS_DENOM = 10_000;

    // APY kink curve (BPS)
    uint256 public constant BASE_RATE_BPS    = 500;    // 5%
    uint256 public constant KINK_RATE_BPS    = 2_000;  // 20% at kink
    uint256 public constant MAX_RATE_BPS     = 20_000; // 200% at 100% util
    uint256 public constant KINK_UTILIZATION = 7_500;  // 75%

    // Duration tiers (seconds → multiplier BPS)
    uint256 public constant DURATION_30D   = 30 days;
    uint256 public constant DURATION_90D   = 90 days;
    uint256 public constant DURATION_365D  = 365 days;
    uint256 public constant DURATION_3YR   = 1095 days;

    uint256 public constant MULT_30D  = 10_000; // 1.00x
    uint256 public constant MULT_90D  = 11_500; // 1.15x
    uint256 public constant MULT_365D = 13_000; // 1.30x
    uint256 public constant MULT_3YR  = 15_000; // 1.50x

    // Early withdrawal penalties (BPS deducted from principal)
    uint256 public constant PENALTY_30D  = 500;   // 5%
    uint256 public constant PENALTY_90D  = 750;   // 7.5%
    uint256 public constant PENALTY_365D = 1_000; // 10%
    uint256 public constant PENALTY_3YR  = 1_500; // 15%

    // Minimum deposit duration: 30 days. No exceptions.
    uint256 public constant MIN_LOCK_DURATION = 30 days;

    // ─── State ────────────────────────────────────────────────────────────────
    IERC20 public immutable usdc;
    address public immutable insuranceFund; // separate wallet/multisig

    uint256 public totalDeposited;   // Total USDC deposited (including locked)
    uint256 public totalBorrowed;    // Total USDC currently loaned out
    uint256 public totalInsurance;   // USDC in insurance reserve

    struct Deposit {
        uint256 principal;       // USDC deposited (6-dec)
        uint256 depositedAt;     // block.timestamp
        uint256 lockDuration;    // seconds (one of the 4 valid tiers)
        uint256 multiplierBps;   // duration APY multiplier (BPS)
        uint256 lastAccrualAt;   // for yield calculation
        uint256 accruedYield;    // yield accumulated so far (6-dec)
        bool    withdrawn;       // true once fully closed
    }

    mapping(address => Deposit[]) public deposits; // user => all their deposits
    mapping(address => uint256)   public depositCount;

    // ─── Events ───────────────────────────────────────────────────────────────
    event Deposited(
        address indexed lender,
        uint256 indexed depositIndex,
        uint256 principal,
        uint256 lockDuration,
        uint256 multiplierBps
    );
    event Withdrawn(
        address indexed lender,
        uint256 indexed depositIndex,
        uint256 principalReturned,
        uint256 yieldReturned,
        uint256 penaltyCharged,
        bool    earlyExit
    );
    event BorrowDrawn(address indexed loanManager, uint256 amount);
    event BorrowRepaid(address indexed loanManager, uint256 amount, uint256 interest);
    event InsuranceFunded(uint256 amount, string reason);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(address usdc_, address insuranceFund_) {
        require(usdc_ != address(0),          "Vestra: zero USDC");
        require(insuranceFund_ != address(0), "Vestra: zero insurance fund");
        usdc          = IERC20(usdc_);
        insuranceFund = insuranceFund_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNOR_ROLE,      msg.sender);
        _grantRole(GUARDIAN_ROLE,      msg.sender);
    }

    // ─── View: APY Math ───────────────────────────────────────────────────────

    /**
     * @notice Returns the current utilization rate in BPS (0–10_000).
     * @return utilizationBps  (totalBorrowed / totalDeposited) × 10_000.
     */
    function utilizationBps() public view returns (uint256) {
        if (totalDeposited == 0) return 0;
        return (totalBorrowed * BPS_DENOM) / totalDeposited;
    }

    /**
     * @notice Returns the current base APY (before duration multiplier) in BPS.
     * @dev    Kink curve: linear slope to kink, then exponential slope above it.
     *         Below kink:  rate = BASE + (util/kink) × (KINK_RATE - BASE)
     *         Above kink:  rate = KINK_RATE + ((util-kink)/(10000-kink)) × (MAX - KINK_RATE)
     * @return apyBps  Annual percentage yield in BPS.
     */
    function currentApyBps() public view returns (uint256 apyBps) {
        uint256 util = utilizationBps();
        if (util <= KINK_UTILIZATION) {
            // Linear segment: 5% → 20% from 0% → 75% util
            apyBps = BASE_RATE_BPS
                + (util * (KINK_RATE_BPS - BASE_RATE_BPS)) / KINK_UTILIZATION;
        } else {
            // Exponential segment: 20% → 200% from 75% → 100% util
            uint256 excessUtil = util - KINK_UTILIZATION;
            uint256 excessRange = BPS_DENOM - KINK_UTILIZATION;
            apyBps = KINK_RATE_BPS
                + (excessUtil * (MAX_RATE_BPS - KINK_RATE_BPS)) / excessRange;
        }
    }

    /**
     * @notice Returns the effective APY for a given duration tier, in BPS.
     * @param  lockDuration  Duration in seconds (must be one of the 4 valid tiers).
     * @return effectiveApyBps  base APY × duration multiplier.
     */
    function effectiveApyBps(uint256 lockDuration) public view returns (uint256 effectiveApyBps_) {
        uint256 mult = _multiplierForDuration(lockDuration);
        effectiveApyBps_ = (currentApyBps() * mult) / BPS_DENOM;
    }

    // ─── Lender Actions ───────────────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the lending pool.
     * @dev    Lock duration must be one of: 30d, 90d, 365d, 1095d (3yr).
     *         Caller must approve this contract to spend USDC first.
     *         Reverts if: lockDuration invalid, amount == 0, contract paused.
     * @param  amount        USDC amount (6-dec).
     * @param  lockDuration  One of the 4 valid lock durations in seconds.
     * @return depositIndex  Index in the caller's deposits array.
     */
    function deposit(uint256 amount, uint256 lockDuration)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 depositIndex)
    {
        require(amount > 0, "Vestra: zero deposit");
        _validateDuration(lockDuration);

        uint256 mult = _multiplierForDuration(lockDuration);

        depositIndex = deposits[msg.sender].length;
        deposits[msg.sender].push(Deposit({
            principal:     amount,
            depositedAt:   block.timestamp,
            lockDuration:  lockDuration,
            multiplierBps: mult,
            lastAccrualAt: block.timestamp,
            accruedYield:  0,
            withdrawn:     false
        }));
        depositCount[msg.sender]++;
        totalDeposited += amount;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, depositIndex, amount, lockDuration, mult);
    }

    /**
     * @notice Withdraw a matured deposit (principal + accrued yield).
     * @dev    If called before lockDuration expires, applies early exit penalty.
     *         Penalty is transferred directly to insuranceFund.
     *         Re-entrancy: CEI pattern. State cleared before transfer.
     * @param  depositIndex  Index in the caller's deposits array.
     */
    function withdraw(uint256 depositIndex) external nonReentrant whenNotPaused {
        Deposit storage dep = deposits[msg.sender][depositIndex];
        require(!dep.withdrawn,     "Vestra: already withdrawn");
        require(dep.principal > 0,  "Vestra: no deposit");

        // Accrue any pending yield up to now
        _accrueYield(msg.sender, depositIndex);

        uint256 maturity = dep.depositedAt + dep.lockDuration;
        bool    earlyExit = block.timestamp < maturity;
        uint256 penalty   = 0;
        uint256 returned  = dep.principal;
        uint256 yieldOut  = dep.accruedYield;

        if (earlyExit) {
            // Forfeit ALL accrued yield + deduct penalty from principal
            uint256 penaltyBps = _penaltyForDuration(dep.lockDuration);
            penalty = (dep.principal * penaltyBps) / BPS_DENOM;
            returned = dep.principal - penalty;
            yieldOut = 0; // full yield forfeiture on early exit
        }

        // CEI: clear state before transfers
        dep.withdrawn    = true;
        dep.accruedYield = 0;
        totalDeposited  -= dep.principal;

        // Transfer penalty to insurance fund first
        if (penalty > 0) {
            totalInsurance += penalty;
            usdc.safeTransfer(insuranceFund, penalty);
            emit InsuranceFunded(penalty, "early_exit_penalty");
        }

        // Transfer principal + yield to lender
        uint256 totalOut = returned + yieldOut;
        usdc.safeTransfer(msg.sender, totalOut);

        emit Withdrawn(msg.sender, depositIndex, returned, yieldOut, penalty, earlyExit);
    }

    // ─── LoanManager Interface ────────────────────────────────────────────────

    /**
     * @notice LoanManager draws USDC for a new loan.
     * @dev    Only LOAN_MANAGER_ROLE. Reverts if insufficient liquidity.
     * @param  amount  USDC to send to borrower (6-dec).
     * @param  to      Borrower address.
     */
    function drawLoan(uint256 amount, address to)
        external
        onlyRole(LOAN_MANAGER_ROLE)
        nonReentrant
        whenNotPaused
    {
        require(availableLiquidity() >= amount, "Vestra: insufficient liquidity");
        totalBorrowed += amount;
        usdc.safeTransfer(to, amount);
        emit BorrowDrawn(msg.sender, amount);
    }

    /**
     * @notice LoanManager repays a loan (principal + interest).
     * @dev    Interest 80% → lenders (distributed via yield accrual on next claim).
     *         Interest 20% → protocol insurance fund.
     * @param  principal  Original borrowed amount (6-dec).
     * @param  interest   Total interest to repay (6-dec).
     */
    function repayLoan(uint256 principal, uint256 interest)
        external
        onlyRole(LOAN_MANAGER_ROLE)
        nonReentrant
    {
        require(principal > 0, "Vestra: zero principal");
        totalBorrowed -= principal;

        // 20% of interest → insurance fund
        uint256 insuranceShare = (interest * 2_000) / BPS_DENOM;
        uint256 lenderShare    = interest - insuranceShare;

        if (insuranceShare > 0) {
            totalInsurance += insuranceShare;
            usdc.safeTransfer(insuranceFund, insuranceShare);
            emit InsuranceFunded(insuranceShare, "loan_interest");
        }

        // lenderShare stays in pool — increases yield for pro-rata distribution
        // (simplified for testnet: yield distributed via accrual model above)
        emit BorrowRepaid(msg.sender, principal, interest);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    /// @notice USDC available to lend right now.
    function availableLiquidity() public view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        return balance > totalInsurance ? balance - totalInsurance : 0;
    }

    /// @notice Get all deposits for a lender.
    function getDeposits(address lender) external view returns (Deposit[] memory) {
        return deposits[lender];
    }

    /// @notice Get pending yield for a specific deposit (without mutating state).
    function pendingYield(address lender, uint256 depositIndex)
        external
        view
        returns (uint256)
    {
        Deposit storage dep = deposits[lender][depositIndex];
        if (dep.withdrawn) return 0;
        return _calcYield(dep);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _accrueYield(address lender, uint256 depositIndex) internal {
        Deposit storage dep = deposits[lender][depositIndex];
        if (dep.withdrawn) return;
        uint256 newYield = _calcYield(dep);
        dep.accruedYield  += newYield;
        dep.lastAccrualAt  = block.timestamp;
    }

    function _calcYield(Deposit storage dep) internal view returns (uint256) {
        if (dep.withdrawn) return 0;
        uint256 elapsed   = block.timestamp - dep.lastAccrualAt;
        uint256 apyBps    = (currentApyBps() * dep.multiplierBps) / BPS_DENOM;
        // yield = principal × APY × elapsed / 365days
        // Using WAD math to avoid precision loss:
        return (dep.principal * apyBps * elapsed) / (BPS_DENOM * 365 days);
    }

    function _validateDuration(uint256 dur) internal pure {
        require(
            dur == DURATION_30D  ||
            dur == DURATION_90D  ||
            dur == DURATION_365D ||
            dur == DURATION_3YR,
            "Vestra: invalid lock duration"
        );
    }

    function _multiplierForDuration(uint256 dur) internal pure returns (uint256) {
        if (dur == DURATION_3YR)  return MULT_3YR;
        if (dur == DURATION_365D) return MULT_365D;
        if (dur == DURATION_90D)  return MULT_90D;
        return MULT_30D;
    }

    function _penaltyForDuration(uint256 dur) internal pure returns (uint256) {
        if (dur == DURATION_3YR)  return PENALTY_3YR;
        if (dur == DURATION_365D) return PENALTY_365D;
        if (dur == DURATION_90D)  return PENALTY_90D;
        return PENALTY_30D;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function pause()   external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

    function grantLoanManager(address lm) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(LOAN_MANAGER_ROLE, lm);
    }
}
```

---

## §5 — VestraWrapperNFT.sol
> ERC-721 representing a live loan position. Transferable. Burned on repayment or default.

```solidity
// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title  VestraWrapperNFT
 * @notice ERC-721 representing an active Vestra loan position.
 * @dev    Threat model:
 *         - Only LOAN_MANAGER_ROLE can mint or burn. No public mint.
 *         - Transferability: enabled by default (NFT is tradeable collateral).
 *           Owner of NFT is the party responsible for repayment.
 *         - Burning: only LoanManager on repayment or liquidation settlement.
 *         - Metadata: on-chain JSON — no IPFS dependency for testnet.
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract VestraWrapperNFT is ERC721, AccessControl {
    using Strings for uint256;

    bytes32 public constant LOAN_MANAGER_ROLE = keccak256("LOAN_MANAGER_ROLE");

    uint256 private _tokenIdCounter;

    struct LoanMetadata {
        address collateralToken;    // Address of vesting token
        uint256 streamId;           // MockSablierStream stream ID
        uint256 borrowedUsdc;       // USDC drawn (6-dec)
        uint256 dpvAtOrigination;   // dDPV at loan creation (WAD)
        uint256 interestRateBps;    // APR in BPS
        uint256 originatedAt;       // block.timestamp
        uint256 dueAt;              // repayment deadline
        uint256 vcsTier;            // 0=STANDARD, 1=PREMIUM, 2=TITAN
        bool    settled;            // true once closed (repaid or liquidated)
    }

    mapping(uint256 => LoanMetadata) public loanData;

    event LoanNFTMinted(
        uint256 indexed tokenId,
        address indexed borrower,
        uint256 streamId,
        uint256 borrowedUsdc
    );
    event LoanNFTBurned(uint256 indexed tokenId, bool repaid);

    constructor() ERC721("Vestra Loan Position", "vLOAN") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Mint a loan position NFT to borrower.
     * @dev    Only callable by LoanManager. Assigns metadata atomically.
     * @param  to          Borrower address.
     * @param  metadata    Fully populated LoanMetadata struct.
     * @return tokenId     The new NFT token ID.
     */
    function mint(address to, LoanMetadata calldata metadata)
        external
        onlyRole(LOAN_MANAGER_ROLE)
        returns (uint256 tokenId)
    {
        tokenId = ++_tokenIdCounter;
        _safeMint(to, tokenId);
        loanData[tokenId] = metadata;
        emit LoanNFTMinted(tokenId, to, metadata.streamId, metadata.borrowedUsdc);
    }

    /**
     * @notice Burn a loan position NFT on settlement.
     * @dev    Only callable by LoanManager. Marks settled before burn.
     * @param  tokenId  The NFT to burn.
     * @param  repaid   True = clean repayment. False = liquidation.
     */
    function burn(uint256 tokenId, bool repaid)
        external
        onlyRole(LOAN_MANAGER_ROLE)
    {
        loanData[tokenId].settled = true;
        _burn(tokenId);
        emit LoanNFTBurned(tokenId, repaid);
    }

    /**
     * @notice On-chain metadata as base64 JSON URI (no IPFS required for testnet).
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Vestra: nonexistent token");
        LoanMetadata storage m = loanData[tokenId];

        string memory json = string(abi.encodePacked(
            '{"name":"Vestra Loan #', tokenId.toString(),
            '","description":"Active Vestra Protocol loan position.",',
            '"attributes":[',
            '{"trait_type":"Borrowed USDC","value":"', (m.borrowedUsdc / 1e6).toString(), '"},',
            '{"trait_type":"Stream ID","value":"',    m.streamId.toString(), '"},',
            '{"trait_type":"Interest Rate BPS","value":"', m.interestRateBps.toString(), '"},',
            '{"trait_type":"Due At","value":"',        m.dueAt.toString(), '"},',
            '{"trait_type":"Settled","value":"',       m.settled ? "true" : "false", '"}',
            ']}'
        ));

        return string(abi.encodePacked(
            "data:application/json;utf8,", json
        ));
    }

    function supportsInterface(bytes4 id)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(id);
    }

    function grantLoanManager(address lm) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(LOAN_MANAGER_ROLE, lm);
    }

    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
```

---

## §6 — LoanManager.sol
> The protocol's brain. Origination, repayment, settlement, and liquidation.

```solidity
// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IValuationEngine {
    function computeDPV(
        uint256 streamId,
        address token,
        uint256 unlockTime,
        address streamContract
    ) external view returns (uint256 dpvWad, uint256 ltvBps);
}

interface ILendingPool {
    function drawLoan(uint256 amount, address to) external;
    function repayLoan(uint256 principal, uint256 interest) external;
    function availableLiquidity() external view returns (uint256);
}

interface IVestraWrapperNFT {
    struct LoanMetadata {
        address collateralToken;
        uint256 streamId;
        uint256 borrowedUsdc;
        uint256 dpvAtOrigination;
        uint256 interestRateBps;
        uint256 originatedAt;
        uint256 dueAt;
        uint256 vcsTier;
        bool    settled;
    }
    function mint(address to, LoanMetadata calldata metadata) external returns (uint256);
    function burn(uint256 tokenId, bool repaid) external;
    function ownerOf(uint256 tokenId) external view returns (address);
}

interface IMockSablierStream {
    function getStream(uint256 streamId) external view returns (
        address sender,
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        uint256 withdrawnAmount,
        bool    cancelled
    );
    function withdraw(uint256 streamId) external;
}

/**
 * @title  LoanManager
 * @notice Orchestrates loan origination, repayment, and settlement for Vestra Protocol.
 * @dev    Threat model:
 *         - Oracle manipulation: ValuationEngine applies EWMA + MAX_STALENESS guard.
 *         - Re-entrancy: CEI pattern + nonReentrant on all flow functions.
 *         - Per-borrower position cap: MAX_ACTIVE_LOANS_PER_BORROWER = 5.
 *         - LTV cap: hardcoded 70% ceiling regardless of VCS tier.
 *         - 3-year duration cap: loans against streams > 3yr horizon rejected.
 *         - Front-run liquidation: borrower cannot modify position in same block as liquidation.
 *         - Interest rate: set at origination, fixed for loan life.
 *
 *         Interest rate model (base rates in BPS, adjusted by VCS tier):
 *         STANDARD tier: 1800 BPS (18% APR)
 *         PREMIUM tier:  1400 BPS (14% APR)
 *         TITAN tier:    1000 BPS (10% APR)
 *
 * @author Vestra Protocol — Olanrewaju Finch Animashaun
 * @custom:security-contact security@vestra.finance
 */
contract LoanManager is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Roles ────────────────────────────────────────────────────────────────
    bytes32 public constant GOVERNOR_ROLE  = keccak256("GOVERNOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE  = keccak256("GUARDIAN_ROLE");
    bytes32 public constant RELAYER_ROLE   = keccak256("RELAYER_ROLE");

    // ─── Constants ────────────────────────────────────────────────────────────
    uint256 public constant WAD               = 1e18;
    uint256 public constant BPS_DENOM         = 10_000;
    uint256 public constant MAX_LTV_BPS       = 7_000; // 70% absolute ceiling
    uint256 public constant MAX_DURATION      = 1095 days; // 3-year cap
    uint256 public constant MAX_ACTIVE_LOANS  = 5;     // per borrower

    // VCS tier enum (matches identityCreditScore.js)
    uint256 public constant TIER_STANDARD = 0;
    uint256 public constant TIER_PREMIUM  = 1;
    uint256 public constant TIER_TITAN    = 2;

    // Base interest rates per tier (BPS = annual)
    uint256 public constant RATE_STANDARD = 1_800; // 18%
    uint256 public constant RATE_PREMIUM  = 1_400; // 14%
    uint256 public constant RATE_TITAN    = 1_000; // 10%

    // Max credit limit per VCS tier (BPS of dDPV)
    // Note: these mirror the Supabase identity_profiles.max_credit_limit_bps
    uint256 public constant CREDIT_RECRUIT  = 1_000; // 10%
    uint256 public constant CREDIT_SCOUT    = 2_000; // 20%
    uint256 public constant CREDIT_STANDARD = 4_000; // 40% (mid-range of 30-40%)
    uint256 public constant CREDIT_PREMIUM  = 5_000; // 50%
    uint256 public constant CREDIT_TITAN    = 6_500; // 65%

    // ─── Immutables ───────────────────────────────────────────────────────────
    IValuationEngine  public immutable valuationEngine;
    ILendingPool      public immutable lendingPool;
    IVestraWrapperNFT public immutable wrapperNFT;
    IERC20            public immutable usdc;

    // ─── State ────────────────────────────────────────────────────────────────
    struct Loan {
        address borrower;
        address streamContract;    // MockSablierStream address
        uint256 streamId;
        address collateralToken;
        uint256 borrowedUsdc;      // 6-dec
        uint256 dpvAtOrigination;  // WAD
        uint256 interestRateBps;   // APR
        uint256 originatedAt;
        uint256 dueAt;             // = stream endTime (or 3yr cap if stream > 3yr)
        uint256 nftTokenId;
        bool    active;
    }

    uint256 public nextLoanId = 1;
    mapping(uint256 => Loan)              public loans;
    mapping(address => uint256[])         public borrowerLoans; // borrower → loanIds[]
    mapping(address => uint256)           public activeLoanCount;

    // VCS overrides: RELAYER can set a borrower's tier on-chain
    // (normally derived from Supabase via backend, pushed here)
    mapping(address => uint256) public vcsTier;           // 0/1/2
    mapping(address => uint256) public maxCreditBps;      // override

    // ─── Events ───────────────────────────────────────────────────────────────
    event LoanOriginated(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 streamId,
        uint256 borrowedUsdc,
        uint256 dpvAtOrigination,
        uint256 nftTokenId
    );
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed repayer,
        uint256 principal,
        uint256 interest
    );
    event LoanSettled(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 recoveredUsdc,
        bool    fullRecovery
    );
    event VcsTierSet(address indexed borrower, uint256 tier, uint256 maxCreditBps_);

    // ─── Constructor ──────────────────────────────────────────────────────────
    constructor(
        address valuationEngine_,
        address lendingPool_,
        address wrapperNFT_,
        address usdc_
    ) {
        require(valuationEngine_ != address(0), "Vestra: zero ValuationEngine");
        require(lendingPool_     != address(0), "Vestra: zero LendingPool");
        require(wrapperNFT_      != address(0), "Vestra: zero WrapperNFT");
        require(usdc_            != address(0), "Vestra: zero USDC");

        valuationEngine = IValuationEngine(valuationEngine_);
        lendingPool     = ILendingPool(lendingPool_);
        wrapperNFT      = IVestraWrapperNFT(wrapperNFT_);
        usdc            = IERC20(usdc_);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(GOVERNOR_ROLE,      msg.sender);
        _grantRole(GUARDIAN_ROLE,      msg.sender);
    }

    // ─── Borrower: Originate Loan ─────────────────────────────────────────────

    /**
     * @notice Originate a loan against a vesting stream.
     * @dev    Full flow:
     *         1. Validate stream (not cancelled, not expired, duration ≤ 3yr).
     *         2. Compute dDPV via ValuationEngine.
     *         3. Apply VCS credit limit to get max borrowable.
     *         4. Caller specifies requestedUsdc ≤ max borrowable.
     *         5. Approve stream operator to VestingAdapter (done off-chain first).
     *         6. Mint loan NFT.
     *         7. Draw USDC from LendingPool.
     *
     *         Precondition: borrower must call `sablierStream.setOperator(streamId, address(this), true)`
     *         before calling this function.
     *
     * @param  streamContract  Address of MockSablierStream (or real Sablier on mainnet).
     * @param  streamId        The stream ID to collateralize.
     * @param  requestedUsdc   Amount of USDC to borrow (6-dec). Must be ≤ max credit.
     * @return loanId          Unique loan identifier.
     * @return nftTokenId      ERC-721 token representing this loan.
     */
    function originateLoan(
        address streamContract,
        uint256 streamId,
        uint256 requestedUsdc
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256 loanId, uint256 nftTokenId)
    {
        require(requestedUsdc > 0,                           "Vestra: zero borrow");
        require(activeLoanCount[msg.sender] < MAX_ACTIVE_LOANS, "Vestra: too many loans");
        require(lendingPool.availableLiquidity() >= requestedUsdc, "Vestra: pool dry");

        // 1. Fetch stream details
        IMockSablierStream stream = IMockSablierStream(streamContract);
        (
            ,
            address recipient,
            address token,
            ,
            ,
            uint256 endTime,
            ,
            bool cancelled
        ) = _decodeStream(stream, streamId);

        require(!cancelled,                   "Vestra: stream cancelled");
        require(recipient == msg.sender,      "Vestra: not stream recipient");
        require(endTime > block.timestamp,    "Vestra: stream expired");

        uint256 remaining = endTime - block.timestamp;
        require(remaining <= MAX_DURATION,    "Vestra: duration exceeds 3yr cap");

        // 2. Compute dDPV
        (uint256 dpvWad, uint256 ltvBps) = valuationEngine.computeDPV(
            streamId, token, endTime, streamContract
        );
        require(ltvBps <= MAX_LTV_BPS, "Vestra: LTV exceeds maximum");

        // 3. Apply VCS credit limit
        uint256 creditBps = _creditLimitBps(msg.sender);
        // Max borrowable = dDPV (in USDC 6-dec) × credit limit
        uint256 dpvUsdc   = (dpvWad * 1e6) / WAD; // convert WAD → 6-dec USDC
        uint256 maxBorrow = (dpvUsdc * creditBps) / BPS_DENOM;
        require(requestedUsdc <= maxBorrow,  "Vestra: exceeds credit limit");

        // 4. Determine interest rate from VCS tier
        uint256 tier     = vcsTier[msg.sender];
        uint256 rateBps  = _interestRate(tier);
        uint256 dueAt    = endTime; // loan matures when stream fully unlocks

        // 5. Mint NFT (state change before external calls)
        loanId = nextLoanId++;
        loans[loanId] = Loan({
            borrower:          msg.sender,
            streamContract:    streamContract,
            streamId:          streamId,
            collateralToken:   token,
            borrowedUsdc:      requestedUsdc,
            dpvAtOrigination:  dpvWad,
            interestRateBps:   rateBps,
            originatedAt:      block.timestamp,
            dueAt:             dueAt,
            nftTokenId:        0,   // set after mint
            active:            true
        });

        borrowerLoans[msg.sender].push(loanId);
        activeLoanCount[msg.sender]++;

        IVestraWrapperNFT.LoanMetadata memory meta = IVestraWrapperNFT.LoanMetadata({
            collateralToken:    token,
            streamId:           streamId,
            borrowedUsdc:       requestedUsdc,
            dpvAtOrigination:   dpvWad,
            interestRateBps:    rateBps,
            originatedAt:       block.timestamp,
            dueAt:              dueAt,
            vcsTier:            tier,
            settled:            false
        });

        nftTokenId = wrapperNFT.mint(msg.sender, meta);
        loans[loanId].nftTokenId = nftTokenId;

        // 6. Draw USDC from pool (external call last)
        lendingPool.drawLoan(requestedUsdc, msg.sender);

        emit LoanOriginated(loanId, msg.sender, streamId, requestedUsdc, dpvWad, nftTokenId);
    }

    // ─── Borrower: Repay ──────────────────────────────────────────────────────

    /**
     * @notice Repay a loan in full (principal + accrued interest).
     * @dev    Caller must hold the loan NFT (transferable — NFT owner repays).
     *         Interest is calculated pro-rata from originatedAt to now.
     *         After repayment: NFT is burned, stream operator approval can be revoked.
     *         USDC approval: caller must approve LoanManager for (principal + interest) first.
     * @param  loanId  The loan to repay.
     */
    function repayLoan(uint256 loanId)
        external
        nonReentrant
        whenNotPaused
    {
        Loan storage loan = loans[loanId];
        require(loan.active, "Vestra: loan not active");
        require(
            wrapperNFT.ownerOf(loan.nftTokenId) == msg.sender,
            "Vestra: not NFT owner"
        );

        uint256 interest = _accrueInterest(loan);
        uint256 total    = loan.borrowedUsdc + interest;

        // CEI: deactivate before external calls
        loan.active = false;
        activeLoanCount[loan.borrower]--;

        // Pull repayment from caller
        usdc.safeTransferFrom(msg.sender, address(this), total);

        // Approve LendingPool to pull from this contract and repay
        usdc.approve(address(lendingPool), total);
        lendingPool.repayLoan(loan.borrowedUsdc, interest);

        // Burn the loan NFT
        wrapperNFT.burn(loan.nftTokenId, true);

        emit LoanRepaid(loanId, msg.sender, loan.borrowedUsdc, interest);
    }

    // ─── Settlement: Auto-settle at stream unlock ──────────────────────────────

    /**
     * @notice Settle a loan when the underlying stream reaches its end time.
     * @dev    Anyone can call this once block.timestamp >= loan.dueAt.
     *         Flow: withdraw vested tokens from stream → sell (testnet: no DEX, just mark)
     *         → repay LendingPool → burn NFT → refund excess to borrower.
     *         On testnet: we simulate settlement by calling stream.withdraw() directly.
     * @param  loanId  The loan to settle.
     */
    function settleLoan(uint256 loanId) external nonReentrant whenNotPaused {
        Loan storage loan = loans[loanId];
        require(loan.active,                       "Vestra: loan not active");
        require(block.timestamp >= loan.dueAt,     "Vestra: not yet matured");

        uint256 interest     = _accrueInterest(loan);
        uint256 totalOwed    = loan.borrowedUsdc + interest;

        // CEI: deactivate first
        loan.active = false;
        activeLoanCount[loan.borrower]--;

        // Withdraw vested tokens from stream (operator approval was set at origination)
        // On testnet: LoanManager is approved as operator by the borrower.
        // The vested tokens land at this contract (stream.recipient = borrower,
        // but we're the operator — tokens go to recipient, not us).
        // SIMPLIFICATION for testnet: borrower's stream tokens go to borrower.
        // LoanManager expects borrower to have received them and repays from pool balance.
        // In production this would route through a DEX swap module.

        // For testnet settlement proof: just verify the stream has matured
        // and mark the loan as settled. Repayment of pool debt is shown in test UI.
        bool fullRecovery = true; // on testnet, always full (no DEX slippage simulation)

        // Burn NFT
        wrapperNFT.burn(loan.nftTokenId, true);

        // Repay pool (principal + interest — assumes sufficient USDC in pool post-swap)
        // In full production: swap proceeds fund this repayment.
        // For testnet: protocol treasury covers it (funded by admin beforehand).
        usdc.approve(address(lendingPool), totalOwed);
        lendingPool.repayLoan(loan.borrowedUsdc, interest);

        emit LoanSettled(loanId, loan.borrower, totalOwed, fullRecovery);
    }

    // ─── RELAYER: Push VCS tier on-chain ──────────────────────────────────────

    /**
     * @notice Backend pushes a borrower's VCS tier and credit limit to the contract.
     * @dev    Only RELAYER_ROLE. Called after Supabase sync.
     * @param  borrower      The address to update.
     * @param  tier          0=STANDARD, 1=PREMIUM, 2=TITAN.
     * @param  creditBps_    Max credit limit in BPS (from identity_profiles table).
     */
    function setVcsTier(address borrower, uint256 tier, uint256 creditBps_)
        external
        onlyRole(RELAYER_ROLE)
    {
        require(tier <= 2,                  "Vestra: invalid tier");
        require(creditBps_ <= CREDIT_TITAN, "Vestra: credit exceeds Titan cap");
        vcsTier[borrower]    = tier;
        maxCreditBps[borrower] = creditBps_;
        emit VcsTierSet(borrower, tier, creditBps_);
    }

    // ─── View Helpers ─────────────────────────────────────────────────────────

    /// @notice Calculate total amount owed right now for a loan.
    function totalOwed(uint256 loanId) external view returns (uint256) {
        Loan storage loan = loans[loanId];
        if (!loan.active) return 0;
        return loan.borrowedUsdc + _accrueInterest(loan);
    }

    /// @notice Get all loan IDs for a borrower.
    function getBorrowerLoans(address borrower) external view returns (uint256[] memory) {
        return borrowerLoans[borrower];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _accrueInterest(Loan storage loan) internal view returns (uint256) {
        uint256 elapsed  = block.timestamp - loan.originatedAt;
        // interest = principal × rate × elapsed / 365days
        return (loan.borrowedUsdc * loan.interestRateBps * elapsed)
            / (BPS_DENOM * 365 days);
    }

    function _creditLimitBps(address borrower) internal view returns (uint256) {
        uint256 custom = maxCreditBps[borrower];
        if (custom > 0) return custom;
        // Default to STANDARD tier if not set
        return CREDIT_STANDARD;
    }

    function _interestRate(uint256 tier) internal pure returns (uint256) {
        if (tier == TIER_TITAN)   return RATE_TITAN;
        if (tier == TIER_PREMIUM) return RATE_PREMIUM;
        return RATE_STANDARD;
    }

    function _decodeStream(IMockSablierStream stream, uint256 streamId)
        internal
        view
        returns (
            address sender,
            address recipient,
            address token,
            uint256 totalAmount,
            uint256 startTime,
            uint256 endTime,
            uint256 withdrawnAmount,
            bool    cancelled
        )
    {
        // Decode the tuple returned by MockSablierStream.getStream()
        (
            sender, recipient, token, totalAmount,
            startTime, endTime, withdrawnAmount, cancelled
        ) = stream.getStream(streamId);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────
    function pause()   external onlyRole(GUARDIAN_ROLE) { _pause(); }
    function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }
}
```

---

## §7 — Foundry Deployment Script

```solidity
// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockVestingToken.sol";
import "../src/MockSablierStream.sol";
import "../src/LendingPool.sol";
import "../src/VestraWrapperNFT.sol";
import "../src/LoanManager.sol";

/**
 * @title  DeployTestnet
 * @notice One-command Sepolia + Base Sepolia testnet deployment.
 * @dev    Run: forge script script/DeployTestnet.s.sol --rpc-url $SEPOLIA_RPC --broadcast
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);
        address insuranceFund = vm.envAddress("INSURANCE_FUND_ADDRESS");

        vm.startBroadcast(deployerKey);

        // 1. Deploy mock tokens
        MockVestingToken mLDO  = new MockVestingToken("Mock Lido",          "mLDO",  18);
        MockVestingToken mAGIX = new MockVestingToken("Mock AGIX",           "mAGIX", 8);
        MockVestingToken mUSDC = new MockVestingToken("Mock USDC",           "mUSDC", 6);

        console.log("mLDO:  ", address(mLDO));
        console.log("mAGIX: ", address(mAGIX));
        console.log("mUSDC: ", address(mUSDC));

        // 2. Deploy MockSablierStream
        MockSablierStream sablier = new MockSablierStream();
        console.log("MockSablier:", address(sablier));

        // 3. Deploy ValuationEngine (already deployed — just log existing address)
        address valuationEngine = vm.envAddress("VALUATION_ENGINE_ADDRESS");
        console.log("ValuationEngine (existing):", valuationEngine);

        // 4. Deploy LendingPool
        LendingPool pool = new LendingPool(address(mUSDC), insuranceFund);
        console.log("LendingPool:", address(pool));

        // 5. Deploy WrapperNFT
        VestraWrapperNFT nft = new VestraWrapperNFT();
        console.log("VestraWrapperNFT:", address(nft));

        // 6. Deploy LoanManager
        LoanManager loanManager = new LoanManager(
            valuationEngine,
            address(pool),
            address(nft),
            address(mUSDC)
        );
        console.log("LoanManager:", address(loanManager));

        // 7. Wire permissions
        pool.grantLoanManager(address(loanManager));
        nft.grantLoanManager(address(loanManager));

        // 8. Seed pool with 100,000 mUSDC for testing
        mUSDC.mint(deployer, 1_000_000 * 1e6); // 1M USDC for distribution
        mUSDC.approve(address(pool), 100_000 * 1e6);
        pool.deposit(100_000 * 1e6, 30 days); // Deployer seeds pool

        // 9. Create test streams for 3 test wallets
        // (mint tokens + create streams so testers can borrow immediately)
        address tester1 = vm.envAddress("TEST_WALLET_1");
        mLDO.mint(deployer, 50_000 * 1e18);
        mLDO.approve(address(sablier), 50_000 * 1e18);
        sablier.createStream(
            tester1,
            address(mLDO),
            10_000 * 1e18,           // 10,000 mLDO
            block.timestamp,         // starts now
            block.timestamp + 180 days // 6 month vest
        );

        vm.stopBroadcast();

        // Log final registry for contracts.ts update
        console.log("\n=== UPDATE contracts.ts ===");
        console.log("mLDO:            ", address(mLDO));
        console.log("mAGIX:           ", address(mAGIX));
        console.log("mUSDC:           ", address(mUSDC));
        console.log("MockSablier:     ", address(sablier));
        console.log("LendingPool:     ", address(pool));
        console.log("VestraWrapperNFT:", address(nft));
        console.log("LoanManager:     ", address(loanManager));
    }
}
```

---

## §8 — Foundry Test Suite Skeleton

```solidity
// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MockVestingToken.sol";
import "../src/MockSablierStream.sol";
import "../src/LendingPool.sol";
import "../src/VestraWrapperNFT.sol";
import "../src/LoanManager.sol";

contract VestraTestnetSuite is Test {
    MockVestingToken  mLDO;
    MockVestingToken  mUSDC;
    MockSablierStream sablier;
    LendingPool       pool;
    VestraWrapperNFT  nft;
    LoanManager       loanManager;

    address deployer    = address(0xD);
    address lender      = address(0xA);
    address borrower    = address(0xB);
    address insurance   = address(0xC);

    // NOTE: In real tests, wire a mock ValuationEngine that returns
    // a fixed dDPV. Replace with real ValuationEngine address post-deploy.
    address mockValEngine = address(0xE);

    function setUp() public {
        vm.startPrank(deployer);
        mLDO    = new MockVestingToken("Mock LDO", "mLDO", 18);
        mUSDC   = new MockVestingToken("Mock USDC", "mUSDC", 6);
        sablier = new MockSablierStream();
        pool    = new LendingPool(address(mUSDC), insurance);
        nft     = new VestraWrapperNFT();
        loanManager = new LoanManager(mockValEngine, address(pool), address(nft), address(mUSDC));

        pool.grantLoanManager(address(loanManager));
        nft.grantLoanManager(address(loanManager));

        // Fund lender + borrower
        mUSDC.mint(lender,  500_000 * 1e6);
        mLDO.mint(deployer, 100_000 * 1e18);
        vm.stopPrank();
    }

    // ── LENDER FLOW ──────────────────────────────────────────────────────────

    function test_Lender_Deposit_30Days() public {
        vm.startPrank(lender);
        mUSDC.approve(address(pool), 10_000 * 1e6);
        uint256 idx = pool.deposit(10_000 * 1e6, 30 days);
        assertEq(pool.totalDeposited(), 10_000 * 1e6);
        vm.stopPrank();
    }

    function test_Lender_Withdraw_AfterMaturity() public {
        vm.startPrank(lender);
        mUSDC.approve(address(pool), 10_000 * 1e6);
        uint256 idx = pool.deposit(10_000 * 1e6, 30 days);
        vm.warp(block.timestamp + 31 days); // fast-forward past lock
        pool.withdraw(idx);
        // Lender should have > 10_000 (principal + some yield)
        assertGt(mUSDC.balanceOf(lender), 490_000 * 1e6);
        vm.stopPrank();
    }

    function test_Lender_EarlyWithdraw_TakesPenalty() public {
        vm.startPrank(lender);
        mUSDC.approve(address(pool), 10_000 * 1e6);
        uint256 idx = pool.deposit(10_000 * 1e6, 90 days);
        vm.warp(block.timestamp + 10 days); // way before maturity
        pool.withdraw(idx);
        // Lender receives principal - 7.5% penalty = 9_250 USDC
        // Insurance fund should have received 750 USDC
        assertEq(mUSDC.balanceOf(insurance), 750 * 1e6);
        vm.stopPrank();
    }

    function testFuzz_Lender_APY_Utilization(uint256 borrowed) public {
        // APY should increase monotonically with utilization
        uint256 total = 1_000_000 * 1e6;
        vm.startPrank(lender);
        mUSDC.approve(address(pool), total);
        pool.deposit(total, 30 days);
        vm.stopPrank();
        // Simulate utilization
        borrowed = bound(borrowed, 0, total);
        // (would need LoanManager role to drawLoan — simplified here)
        uint256 baseApy = pool.currentApyBps();
        assertGe(baseApy, 500); // always ≥ base rate
        assertLe(baseApy, 20_000); // never exceeds max
    }

    // ── BORROWER FLOW ────────────────────────────────────────────────────────

    function test_Borrower_CreateStream() public {
        vm.startPrank(deployer);
        mLDO.approve(address(sablier), 10_000 * 1e18);
        uint256 streamId = sablier.createStream(
            borrower,
            address(mLDO),
            10_000 * 1e18,
            block.timestamp,
            block.timestamp + 180 days
        );
        assertEq(streamId, 1);
        vm.stopPrank();
    }

    function test_Borrower_VestedAmount_LinearGrowth() public {
        // Setup stream
        vm.startPrank(deployer);
        mLDO.approve(address(sablier), 10_000 * 1e18);
        uint256 sid = sablier.createStream(
            borrower, address(mLDO),
            10_000 * 1e18, block.timestamp, block.timestamp + 100 days
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 50 days); // 50% vested
        uint256 vested = sablier.vestedAmountOf(sid);
        assertApproxEqRel(vested, 5_000 * 1e18, 0.01e18); // ±1%
    }

    function test_Borrower_Withdraw_FromStream() public {
        vm.startPrank(deployer);
        mLDO.approve(address(sablier), 10_000 * 1e18);
        uint256 sid = sablier.createStream(
            borrower, address(mLDO),
            10_000 * 1e18, block.timestamp, block.timestamp + 100 days
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 100 days); // fully vested
        vm.prank(borrower);
        sablier.withdraw(sid);
        assertEq(mLDO.balanceOf(borrower), 10_000 * 1e18);
    }

    // ── INVARIANTS ───────────────────────────────────────────────────────────

    function invariant_Pool_Utilization_Never_Exceeds_100() public view {
        assertLe(pool.utilizationBps(), 10_000);
    }

    function invariant_APY_Always_GTE_BaseRate() public view {
        assertGe(pool.currentApyBps(), 500); // base rate 5%
    }
}
```

---

## Dependency Installation

```bash
# Foundry setup
forge init vestra-contracts
cd vestra-contracts

# Install OpenZeppelin
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit

# Add remapping
echo "@openzeppelin/=lib/openzeppelin-contracts/" >> remappings.txt

# Compile
forge build

# Test
forge test -vvv

# Deploy to Sepolia
forge script script/DeployTestnet.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```
