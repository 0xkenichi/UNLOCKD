// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract LendingPool is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public usdc;
    address public loanManager;
    address public issuanceTreasury;
    address public returnsTreasury;

    mapping(address => uint256) public deposits;
    uint256 public totalDeposits;
    uint256 public totalBorrowed;

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public lowUtilizationThresholdBps = 4000;
    uint256 public highUtilizationThresholdBps = 7500;
    uint256 public lowUtilizationRateBps = 1200;
    uint256 public midUtilizationRateBps = 1800;
    uint256 public highUtilizationRateBps = 2600;
    bool public adminTimelockEnabled;
    uint256 public adminTimelockDelay = 1 days;

    struct PendingLoanManager {
        address manager;
        uint256 executeAfter;
        bool exists;
    }

    struct PendingTreasuryConfig {
        address issuanceTreasury;
        address returnsTreasury;
        uint256 executeAfter;
        bool exists;
    }

    struct PendingRateModel {
        uint256 lowThresholdBps;
        uint256 highThresholdBps;
        uint256 lowRateBps;
        uint256 midRateBps;
        uint256 highRateBps;
        uint256 executeAfter;
        bool exists;
    }

    PendingLoanManager public pendingLoanManager;
    PendingTreasuryConfig public pendingTreasuryConfig;
    PendingRateModel public pendingRateModel;

    event TreasuryConfigUpdated(address issuanceTreasury, address returnsTreasury);
    event LoanManagerUpdated(address indexed loanManager);
    event RateModelUpdated(
        uint256 lowThresholdBps,
        uint256 highThresholdBps,
        uint256 lowRateBps,
        uint256 midRateBps,
        uint256 highRateBps
    );
    event AdminTimelockConfigUpdated(bool enabled, uint256 delaySeconds);
    event LoanManagerQueued(address indexed manager, uint256 executeAfter);
    event LoanManagerQueueCancelled();
    event TreasuryConfigQueued(address issuanceTreasury, address returnsTreasury, uint256 executeAfter);
    event TreasuryConfigCancelled();
    event RateModelQueued(
        uint256 lowThresholdBps,
        uint256 highThresholdBps,
        uint256 lowRateBps,
        uint256 midRateBps,
        uint256 highRateBps,
        uint256 executeAfter
    );
    event RateModelCancelled();

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        issuanceTreasury = msg.sender;
        returnsTreasury = msg.sender;
    }

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "not loan manager");
        _;
    }

    function setLoanManager(address manager) external onlyOwner {
        require(!adminTimelockEnabled, "timelocked");
        _applyLoanManager(manager);
    }

    function queueLoanManager(address manager) external onlyOwner {
        require(adminTimelockEnabled, "timelock disabled");
        require(manager != address(0), "manager=0");
        uint256 executeAfter = block.timestamp + adminTimelockDelay;
        pendingLoanManager = PendingLoanManager({
            manager: manager,
            executeAfter: executeAfter,
            exists: true
        });
        emit LoanManagerQueued(manager, executeAfter);
    }

    function executeQueuedLoanManager() external onlyOwner {
        PendingLoanManager memory pending = pendingLoanManager;
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingLoanManager;
        _applyLoanManager(pending.manager);
    }

    function cancelQueuedLoanManager() external onlyOwner {
        require(pendingLoanManager.exists, "no queued config");
        delete pendingLoanManager;
        emit LoanManagerQueueCancelled();
    }

    function setTreasuries(address issuance, address returnsAddr) external onlyOwner {
        require(!adminTimelockEnabled, "timelocked");
        _applyTreasuries(issuance, returnsAddr);
    }

    function queueTreasuries(address issuance, address returnsAddr) external onlyOwner {
        require(adminTimelockEnabled, "timelock disabled");
        require(issuance != address(0), "issuance=0");
        require(returnsAddr != address(0), "returns=0");
        uint256 executeAfter = block.timestamp + adminTimelockDelay;
        pendingTreasuryConfig = PendingTreasuryConfig({
            issuanceTreasury: issuance,
            returnsTreasury: returnsAddr,
            executeAfter: executeAfter,
            exists: true
        });
        emit TreasuryConfigQueued(issuance, returnsAddr, executeAfter);
    }

    function executeQueuedTreasuries() external onlyOwner {
        PendingTreasuryConfig memory pending = pendingTreasuryConfig;
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingTreasuryConfig;
        _applyTreasuries(pending.issuanceTreasury, pending.returnsTreasury);
    }

    function cancelQueuedTreasuries() external onlyOwner {
        require(pendingTreasuryConfig.exists, "no queued config");
        delete pendingTreasuryConfig;
        emit TreasuryConfigCancelled();
    }

    function setRateModel(
        uint256 lowThresholdBps,
        uint256 highThresholdBps,
        uint256 lowRateBps,
        uint256 midRateBps,
        uint256 highRateBps
    ) external onlyOwner {
        require(!adminTimelockEnabled, "timelocked");
        _applyRateModel(
            lowThresholdBps,
            highThresholdBps,
            lowRateBps,
            midRateBps,
            highRateBps
        );
    }

    function queueRateModel(
        uint256 lowThresholdBps,
        uint256 highThresholdBps,
        uint256 lowRateBps,
        uint256 midRateBps,
        uint256 highRateBps
    ) external onlyOwner {
        require(adminTimelockEnabled, "timelock disabled");
        _validateRateModel(
            lowThresholdBps,
            highThresholdBps,
            lowRateBps,
            midRateBps,
            highRateBps
        );
        uint256 executeAfter = block.timestamp + adminTimelockDelay;
        pendingRateModel = PendingRateModel({
            lowThresholdBps: lowThresholdBps,
            highThresholdBps: highThresholdBps,
            lowRateBps: lowRateBps,
            midRateBps: midRateBps,
            highRateBps: highRateBps,
            executeAfter: executeAfter,
            exists: true
        });
        emit RateModelQueued(
            lowThresholdBps,
            highThresholdBps,
            lowRateBps,
            midRateBps,
            highRateBps,
            executeAfter
        );
    }

    function executeQueuedRateModel() external onlyOwner {
        PendingRateModel memory pending = pendingRateModel;
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingRateModel;
        _applyRateModel(
            pending.lowThresholdBps,
            pending.highThresholdBps,
            pending.lowRateBps,
            pending.midRateBps,
            pending.highRateBps
        );
    }

    function cancelQueuedRateModel() external onlyOwner {
        require(pendingRateModel.exists, "no queued config");
        delete pendingRateModel;
        emit RateModelCancelled();
    }

    function setAdminTimelockConfig(bool enabled, uint256 delaySeconds) external onlyOwner {
        require(delaySeconds >= 1 minutes && delaySeconds <= 30 days, "bad delay");
        adminTimelockEnabled = enabled;
        adminTimelockDelay = delaySeconds;
        emit AdminTimelockConfigUpdated(enabled, delaySeconds);
    }

    function _applyLoanManager(address manager) internal {
        require(manager != address(0), "manager=0");
        loanManager = manager;
        emit LoanManagerUpdated(manager);
    }

    function _applyTreasuries(address issuance, address returnsAddr) internal {
        require(issuance != address(0), "issuance=0");
        require(returnsAddr != address(0), "returns=0");
        issuanceTreasury = issuance;
        returnsTreasury = returnsAddr;
        emit TreasuryConfigUpdated(issuance, returnsAddr);
    }

    function _validateRateModel(
        uint256 lowThresholdBps,
        uint256 highThresholdBps,
        uint256 lowRateBps,
        uint256 midRateBps,
        uint256 highRateBps
    ) internal pure {
        require(lowThresholdBps < highThresholdBps, "bad thresholds");
        require(highThresholdBps <= BPS_DENOMINATOR, "threshold too high");
        require(
            lowRateBps <= midRateBps && midRateBps <= highRateBps,
            "bad rates"
        );
        require(highRateBps <= 5000, "rate too high");
    }

    function _applyRateModel(
        uint256 lowThresholdBps,
        uint256 highThresholdBps,
        uint256 lowRateBps,
        uint256 midRateBps,
        uint256 highRateBps
    ) internal {
        _validateRateModel(
            lowThresholdBps,
            highThresholdBps,
            lowRateBps,
            midRateBps,
            highRateBps
        );
        lowUtilizationThresholdBps = lowThresholdBps;
        highUtilizationThresholdBps = highThresholdBps;
        lowUtilizationRateBps = lowRateBps;
        midUtilizationRateBps = midRateBps;
        highUtilizationRateBps = highRateBps;

        emit RateModelUpdated(
            lowThresholdBps,
            highThresholdBps,
            lowRateBps,
            midRateBps,
            highRateBps
        );
    }

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "amount=0");
        require(issuanceTreasury != address(0), "issuance=0");
        usdc.safeTransferFrom(msg.sender, issuanceTreasury, amount);
        deposits[msg.sender] += amount;
        totalDeposits += amount;
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "amount=0");
        require(deposits[msg.sender] >= amount, "insufficient deposit");
        require(availableLiquidity() >= amount, "insufficient liquidity");
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        require(issuanceTreasury != address(0), "issuance=0");
        usdc.safeTransferFrom(issuanceTreasury, msg.sender, amount);
    }

    function lend(address to, uint256 amount) external nonReentrant onlyLoanManager whenNotPaused {
        require(amount > 0, "amount=0");
        require(availableLiquidity() >= amount, "insufficient liquidity");
        totalBorrowed += amount;
        require(issuanceTreasury != address(0), "issuance=0");
        usdc.safeTransferFrom(issuanceTreasury, to, amount);
    }

    function repay(uint256 amount) external nonReentrant onlyLoanManager whenNotPaused {
        require(amount > 0, "amount=0");
        require(totalBorrowed >= amount, "repay>debt");
        totalBorrowed -= amount;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function utilizationRateBps() public view returns (uint256) {
        if (totalDeposits == 0) {
            return 0;
        }
        return (totalBorrowed * BPS_DENOMINATOR) / totalDeposits;
    }

    function getInterestRateBps() public view returns (uint256) {
        uint256 utilization = utilizationRateBps();
        if (utilization <= lowUtilizationThresholdBps) {
            return lowUtilizationRateBps;
        }
        if (utilization <= highUtilizationThresholdBps) {
            return midUtilizationRateBps;
        }
        return highUtilizationRateBps;
    }

    function availableLiquidity() public view returns (uint256) {
        return totalDeposits - totalBorrowed;
    }
}
