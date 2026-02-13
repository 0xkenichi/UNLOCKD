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
    uint256 public constant REWARD_PRECISION = 1e18;
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
    uint256 public communityPoolCount;

    enum CommunityPoolState {
        FUNDRAISING,
        ACTIVE,
        REFUNDING,
        CLOSED
    }

    struct CommunityPool {
        string name;
        address creator;
        uint256 targetAmount;
        uint256 maxAmount;
        uint256 deadline;
        uint256 totalContributed;
        uint256 totalBuildingUnits;
        uint256 participantCount;
        uint256 accRewardPerWeight;
        uint256 totalRewardFunded;
        bool rewardsByBuildingSize;
        CommunityPoolState state;
    }

    struct CommunityPosition {
        uint256 contributed;
        uint256 buildingUnits;
        uint256 rewardDebt;
        uint256 pendingRewards;
        bool joined;
    }

    mapping(uint256 => CommunityPool) public communityPools;
    mapping(uint256 => mapping(address => CommunityPosition)) public communityPositions;

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
    event CommunityPoolCreated(
        uint256 indexed poolId,
        address indexed creator,
        string name,
        uint256 targetAmount,
        uint256 maxAmount,
        uint256 deadline,
        bool rewardsByBuildingSize
    );
    event CommunityPoolContribution(
        uint256 indexed poolId,
        address indexed contributor,
        uint256 amount,
        uint256 buildingUnits
    );
    event CommunityPoolActivated(uint256 indexed poolId, uint256 amountMovedToLiquidity);
    event CommunityPoolMarkedRefunding(uint256 indexed poolId);
    event CommunityPoolRefunded(
        uint256 indexed poolId,
        address indexed contributor,
        uint256 amount
    );
    event CommunityPoolRewardsFunded(
        uint256 indexed poolId,
        address indexed funder,
        uint256 amount
    );
    event CommunityPoolRewardsClaimed(
        uint256 indexed poolId,
        address indexed contributor,
        uint256 amount
    );
    event CommunityPoolClosed(uint256 indexed poolId);

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

    function createCommunityPool(
        string calldata name,
        uint256 targetAmount,
        uint256 maxAmount,
        uint256 deadline,
        bool rewardsByBuildingSize
    ) external whenNotPaused returns (uint256 poolId) {
        require(bytes(name).length > 0, "name required");
        require(targetAmount > 0, "target=0");
        require(maxAmount >= targetAmount, "max<target");
        require(deadline > block.timestamp, "bad deadline");

        poolId = communityPoolCount;
        communityPoolCount += 1;

        communityPools[poolId] = CommunityPool({
            name: name,
            creator: msg.sender,
            targetAmount: targetAmount,
            maxAmount: maxAmount,
            deadline: deadline,
            totalContributed: 0,
            totalBuildingUnits: 0,
            participantCount: 0,
            accRewardPerWeight: 0,
            totalRewardFunded: 0,
            rewardsByBuildingSize: rewardsByBuildingSize,
            state: CommunityPoolState.FUNDRAISING
        });

        emit CommunityPoolCreated(
            poolId,
            msg.sender,
            name,
            targetAmount,
            maxAmount,
            deadline,
            rewardsByBuildingSize
        );
    }

    function contributeToCommunityPool(
        uint256 poolId,
        uint256 amount,
        uint256 buildingUnits
    ) external nonReentrant whenNotPaused {
        CommunityPool storage cp = communityPools[poolId];
        require(poolId < communityPoolCount, "bad pool");
        _syncCommunityPoolState(cp, poolId);
        require(cp.state == CommunityPoolState.FUNDRAISING, "not fundraising");
        require(amount > 0, "amount=0");
        require(cp.totalContributed + amount <= cp.maxAmount, "max exceeded");
        if (cp.rewardsByBuildingSize) {
            require(buildingUnits > 0, "building=0");
        }

        CommunityPosition storage pos = communityPositions[poolId][msg.sender];
        _accruePosition(cp, pos);

        if (!pos.joined) {
            pos.joined = true;
            cp.participantCount += 1;
        }

        pos.contributed += amount;
        pos.buildingUnits += buildingUnits;
        cp.totalContributed += amount;
        cp.totalBuildingUnits += buildingUnits;

        _resetRewardDebt(cp, pos);
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit CommunityPoolContribution(poolId, msg.sender, amount, buildingUnits);

        if (cp.totalContributed >= cp.targetAmount) {
            _activateCommunityPool(cp, poolId);
        }
    }

    function activateCommunityPool(uint256 poolId) external nonReentrant whenNotPaused {
        require(poolId < communityPoolCount, "bad pool");
        CommunityPool storage cp = communityPools[poolId];
        _syncCommunityPoolState(cp, poolId);
        require(cp.state == CommunityPoolState.FUNDRAISING, "not fundraising");
        require(cp.totalContributed >= cp.targetAmount, "target not met");
        _activateCommunityPool(cp, poolId);
    }

    function claimCommunityPoolRefund(uint256 poolId) external nonReentrant whenNotPaused {
        require(poolId < communityPoolCount, "bad pool");
        CommunityPool storage cp = communityPools[poolId];
        _syncCommunityPoolState(cp, poolId);
        require(cp.state == CommunityPoolState.REFUNDING, "not refunding");

        CommunityPosition storage pos = communityPositions[poolId][msg.sender];
        uint256 refundAmount = pos.contributed;
        require(refundAmount > 0, "nothing to refund");

        cp.totalContributed -= refundAmount;
        if (cp.totalBuildingUnits >= pos.buildingUnits) {
            cp.totalBuildingUnits -= pos.buildingUnits;
        } else {
            cp.totalBuildingUnits = 0;
        }
        if (cp.participantCount > 0 && pos.joined) {
            cp.participantCount -= 1;
        }

        pos.contributed = 0;
        pos.buildingUnits = 0;
        pos.rewardDebt = 0;
        pos.pendingRewards = 0;
        pos.joined = false;

        usdc.safeTransfer(msg.sender, refundAmount);
        emit CommunityPoolRefunded(poolId, msg.sender, refundAmount);
    }

    function fundCommunityPoolRewards(
        uint256 poolId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        require(poolId < communityPoolCount, "bad pool");
        require(amount > 0, "amount=0");
        CommunityPool storage cp = communityPools[poolId];
        _syncCommunityPoolState(cp, poolId);
        require(cp.state == CommunityPoolState.ACTIVE, "not active");
        uint256 totalWeight = _poolWeight(cp);
        require(totalWeight > 0, "no weight");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        cp.accRewardPerWeight += (amount * REWARD_PRECISION) / totalWeight;
        cp.totalRewardFunded += amount;

        emit CommunityPoolRewardsFunded(poolId, msg.sender, amount);
    }

    function claimCommunityPoolRewards(uint256 poolId) external nonReentrant whenNotPaused {
        require(poolId < communityPoolCount, "bad pool");
        CommunityPool storage cp = communityPools[poolId];
        _syncCommunityPoolState(cp, poolId);
        require(
            cp.state == CommunityPoolState.ACTIVE || cp.state == CommunityPoolState.CLOSED,
            "rewards unavailable"
        );

        CommunityPosition storage pos = communityPositions[poolId][msg.sender];
        _accruePosition(cp, pos);
        uint256 amount = pos.pendingRewards;
        require(amount > 0, "nothing to claim");
        pos.pendingRewards = 0;
        _resetRewardDebt(cp, pos);

        usdc.safeTransfer(msg.sender, amount);
        emit CommunityPoolRewardsClaimed(poolId, msg.sender, amount);
    }

    function closeCommunityPool(uint256 poolId) external whenNotPaused {
        require(poolId < communityPoolCount, "bad pool");
        CommunityPool storage cp = communityPools[poolId];
        _syncCommunityPoolState(cp, poolId);
        require(cp.state == CommunityPoolState.ACTIVE, "not active");
        require(msg.sender == owner() || msg.sender == cp.creator, "not authorized");
        cp.state = CommunityPoolState.CLOSED;
        emit CommunityPoolClosed(poolId);
    }

    function pendingCommunityPoolRewards(
        uint256 poolId,
        address user
    ) external view returns (uint256) {
        if (poolId >= communityPoolCount) {
            return 0;
        }
        CommunityPool storage cp = communityPools[poolId];
        CommunityPosition storage pos = communityPositions[poolId][user];
        uint256 accrued = (uint256(_positionWeight(cp, pos)) * cp.accRewardPerWeight) /
            REWARD_PRECISION;
        uint256 delta = accrued > pos.rewardDebt ? accrued - pos.rewardDebt : 0;
        return pos.pendingRewards + delta;
    }

    function _syncCommunityPoolState(CommunityPool storage cp, uint256 poolId) internal {
        if (
            cp.state == CommunityPoolState.FUNDRAISING &&
            block.timestamp > cp.deadline &&
            cp.totalContributed < cp.targetAmount
        ) {
            cp.state = CommunityPoolState.REFUNDING;
            emit CommunityPoolMarkedRefunding(poolId);
        }
    }

    function _activateCommunityPool(CommunityPool storage cp, uint256 poolId) internal {
        require(cp.state == CommunityPoolState.FUNDRAISING, "bad state");
        require(cp.totalContributed >= cp.targetAmount, "target not met");
        require(issuanceTreasury != address(0), "issuance=0");
        cp.state = CommunityPoolState.ACTIVE;
        totalDeposits += cp.totalContributed;
        usdc.safeTransfer(issuanceTreasury, cp.totalContributed);
        emit CommunityPoolActivated(poolId, cp.totalContributed);
    }

    function _poolWeight(CommunityPool storage cp) internal view returns (uint256) {
        return cp.rewardsByBuildingSize ? cp.totalBuildingUnits : cp.totalContributed;
    }

    function _positionWeight(
        CommunityPool storage cp,
        CommunityPosition storage pos
    ) internal view returns (uint256) {
        return cp.rewardsByBuildingSize ? pos.buildingUnits : pos.contributed;
    }

    function _accruePosition(CommunityPool storage cp, CommunityPosition storage pos) internal {
        uint256 weight = _positionWeight(cp, pos);
        if (weight == 0) {
            return;
        }
        uint256 accrued = (weight * cp.accRewardPerWeight) / REWARD_PRECISION;
        if (accrued > pos.rewardDebt) {
            pos.pendingRewards += (accrued - pos.rewardDebt);
        }
    }

    function _resetRewardDebt(CommunityPool storage cp, CommunityPosition storage pos) internal {
        uint256 weight = _positionWeight(cp, pos);
        pos.rewardDebt = (weight * cp.accRewardPerWeight) / REWARD_PRECISION;
    }
}
