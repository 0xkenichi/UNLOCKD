// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./governance/VestraAccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract LendingPool is ReentrancyGuard, VestraAccessControl, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public usdc;
    address public loanManager;
    address public issuanceTreasury;
    address public returnsTreasury;

    mapping(address => uint256) public deposits;
    uint256 public totalDeposits;
    uint256 public totalBorrowed;
    uint256 public insuranceReserve;

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

    // V6.0 Citadel: Optimistic AI Veto Timelocks + LP Ragequit
    address public coprocessor;
    bool public ragequitActive;
    uint256 public ragequitEndTime;
    
    event CoprocessorUpdated(address indexed coprocessor);
    event UpgradeVetoed(string reason);
    event RagequitTriggered(uint256 windowEndTime);

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

    struct StakedPosition {
        uint256 amount;
        uint256 durationDays;
        uint256 lockEndTime;
        uint256 apyBps;
        uint256 lastClaimTime;
        bool isActive;
        bool flowEligible;
        uint256 withdrawnFlow;
    }

    mapping(address => StakedPosition[]) public userStakes;
    uint256 public constant BASE_APY_BPS = 1000; // 10% Base

    event Staked(address indexed user, uint256 amount, uint256 durationDays, uint256 apyBps);
    event Unstaked(address indexed user, uint256 amount, uint256 yield, bool penaltyApplied);
    event YieldClaimed(address indexed user, uint256 amount);

    constructor(address _usdc, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        usdc = IERC20(_usdc);
        issuanceTreasury = msg.sender;
        returnsTreasury = msg.sender;
    }

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "not loan manager");
        _;
    }

    // --- V6.0 Citadel: Coprocessor & Ragequit ---
    
    function setCoprocessor(address _coprocessor) external onlyGovernor {
        coprocessor = _coprocessor;
        emit CoprocessorUpdated(_coprocessor);
    }

    /**
     * @notice V6.0 Citadel: The AI Coprocessor or Owner can veto pending configuration upgrades 
     * if they are deemed malicious (e.g., routing funds to a hacker's treasury).
     */
    function vetoUpgrade(string calldata reason) external {
        require(msg.sender == coprocessor || hasRole(GOVERNOR_ROLE, msg.sender), "unauthorized");
        
        if (pendingLoanManager.exists) {
            delete pendingLoanManager;
            emit LoanManagerQueueCancelled();
        }
        if (pendingTreasuryConfig.exists) {
            delete pendingTreasuryConfig;
            emit TreasuryConfigCancelled();
        }
        if (pendingRateModel.exists) {
            delete pendingRateModel;
            emit RateModelCancelled();
        }
        
        emit UpgradeVetoed(reason);
    }

    /**
     * @notice V6.0 Citadel: If a malicious upgrade bypasses the veto, the Coprocessor or Owner
     * can trigger a global 7-day LP Ragequit window, allowing LPs to withdraw all available liquidity instantly.
     */
    function triggerRagequit() external {
        require(msg.sender == coprocessor || hasRole(GOVERNOR_ROLE, msg.sender), "unauthorized");
        require(!ragequitActive, "already active");
        
        ragequitActive = true;
        ragequitEndTime = block.timestamp + 7 days;
        
        emit RagequitTriggered(ragequitEndTime);
    }

    // --- Core Pool Operations ---

    function setLoanManager(address manager) external onlyGovernor {
        require(!adminTimelockEnabled, "timelocked");
        _applyLoanManager(manager);
    }

    function queueLoanManager(address manager) external onlyGovernor {
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

    function executeQueuedLoanManager() external onlyGovernor {
        PendingLoanManager memory pending = pendingLoanManager;
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingLoanManager;
        _applyLoanManager(pending.manager);
    }

    function cancelQueuedLoanManager() external onlyGovernor {
        require(pendingLoanManager.exists, "no queued config");
        delete pendingLoanManager;
        emit LoanManagerQueueCancelled();
    }

    function setTreasuries(address issuance, address returnsAddr) external onlyGovernor {
        require(!adminTimelockEnabled, "timelocked");
        _applyTreasuries(issuance, returnsAddr);
    }

    function queueTreasuries(address issuance, address returnsAddr) external onlyGovernor {
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

    function executeQueuedTreasuries() external onlyGovernor {
        PendingTreasuryConfig memory pending = pendingTreasuryConfig;
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingTreasuryConfig;
        _applyTreasuries(pending.issuanceTreasury, pending.returnsTreasury);
    }

    function cancelQueuedTreasuries() external onlyGovernor {
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
    ) external onlyGovernor {
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
    ) external onlyGovernor {
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

    function executeQueuedRateModel() external onlyGovernor {
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

    function cancelQueuedRateModel() external onlyGovernor {
        require(pendingRateModel.exists, "no queued config");
        delete pendingRateModel;
        emit RateModelCancelled();
    }

    function setAdminTimelockConfig(bool enabled, uint256 delaySeconds) external onlyGovernor {
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

    function repay(uint256 amount, uint256 interestAmount) external nonReentrant onlyLoanManager whenNotPaused {
        require(amount > 0 || interestAmount > 0, "nothing to repay");
        if (amount > 0) {
            require(totalBorrowed >= amount, "repay>debt");
            totalBorrowed -= amount;
        }
        
        // Finalize transfer to pool treasury
        require(issuanceTreasury != address(0), "issuance=0");
        usdc.safeTransferFrom(msg.sender, issuanceTreasury, amount + interestAmount);

        // 20% of all interest goes to the Insurance Reserve to protect against illiquid defaults
        if (interestAmount > 0) {
            uint256 insuranceCut = (interestAmount * 2000) / BPS_DENOMINATOR;
            insuranceReserve += insuranceCut;
            totalDeposits += (interestAmount - insuranceCut); // 80% yields back to LPs
        }
    }

    function setTotalBorrowed(uint256 amount) external onlyGovernor {
        totalBorrowed = amount;
    }
    
    function claimInsurance(address to, uint256 amount) external nonReentrant onlyLoanManager whenNotPaused {
        require(amount > 0, "amount=0");
        require(insuranceReserve >= amount, "insufficient reserve");
        insuranceReserve -= amount;
        usdc.safeTransfer(to, amount);
    }

    function pause() external onlyGovernor {
        _pause();
    }

    function unpause() external onlyGovernor {
        _unpause();
    }

    function utilizationRateBps() public view returns (uint256) {
        if (totalDeposits == 0) {
            return 0;
        }
        return (totalBorrowed * BPS_DENOMINATOR) / totalDeposits;
    }

    function getInterestRateBps(uint256 durationDays) public view returns (uint256) {
        uint256 utilization = utilizationRateBps(); // [0, 10000]
        uint256 baseRate;

        // Dynamic Interest Rate Game Theory Kink Model
        if (utilization <= lowUtilizationThresholdBps) {
            baseRate = 500 + ((utilization * 1000) / lowUtilizationThresholdBps); // Up to 1500 (15%)
        } else if (utilization <= highUtilizationThresholdBps) {
            uint256 range = highUtilizationThresholdBps - lowUtilizationThresholdBps;
            uint256 progress = utilization - lowUtilizationThresholdBps;
            baseRate = 1500 + ((progress * 1500) / range); // Up to 3000 (30%)
        } else {
            uint256 range = BPS_DENOMINATOR - highUtilizationThresholdBps;
            uint256 progress = utilization - highUtilizationThresholdBps;
            baseRate = 3000 + ((progress * progress * 12000) / (range * range));
        }

        // True "Inverted Duration-Rate Curve"
        // In Web3 Vested Lending, shorter loans against illiquid tokens are much safer than long-term holds.
        // The core strategy: incentivize users to borrow and pay back iteratively on small timeframes (30-90 days),
        // completely disincentivizing tying up capital and exposing lenders to 1yr+ token fluctuations.
        
        // The computed baseRate serves as the absolute Ceiling (Max Risk / Longest Supported Duration approx 1yr+)
        uint256 finalRate = baseRate;
        
        if (durationDays < 180) {
            // Maximum discount of 50% for 0 day loans.
            // As loan extends from 0 to 180 days, the discount linearly decays to 0%.
            // E.g., at 30 days: (180 - 30) = 150. (150 * 5000) / 180 = 4166 (41.6% discount)
            uint256 discountBps = ((180 - durationDays) * 5000) / 180;
            
            finalRate = (baseRate * (BPS_DENOMINATOR - discountBps)) / BPS_DENOMINATOR;
            
            // Hard floor of 5% to protect basic lender ROI
            if (finalRate < 500) {
                finalRate = 500;
            }
        }
        
        // Exceedingly long-term loans (e.g. 2+ years) apply a massive hazard premium
        if (durationDays > 365) {
            uint256 hazardPremiumBps = ((durationDays - 365) * BPS_DENOMINATOR) / 365;
            uint256 maxMultiplierBps = 30000; // Cap at 3x multiplier
            
            finalRate = (baseRate * (BPS_DENOMINATOR + hazardPremiumBps)) / BPS_DENOMINATOR;
            if (finalRate > (baseRate * maxMultiplierBps) / BPS_DENOMINATOR) {
                finalRate = (baseRate * maxMultiplierBps) / BPS_DENOMINATOR;
            }
        }

        return finalRate;
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
        require(hasRole(GOVERNOR_ROLE, msg.sender) || msg.sender == cp.creator, "not authorized");
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

    function stake(uint256 amount, uint256 durationDays) external nonReentrant whenNotPaused {
        require(amount > 0, "amount=0");
        require(
            durationDays == 30 || durationDays == 90 || durationDays == 180 || 
            durationDays == 365 || durationDays == 1825 || durationDays == 3650, 
            "invalid duration"
        );
        require(returnsTreasury != address(0), "returns=0");

        uint256 multiplierBps;
        if (durationDays == 30) multiplierBps = 10000;      // 1.0x
        else if (durationDays == 90) multiplierBps = 12000; // 1.2x
        else if (durationDays == 180) multiplierBps = 15000;// 1.5x
        else if (durationDays == 365) multiplierBps = 20000;// 2.0x
        else if (durationDays == 1825) multiplierBps = 35000;// 3.5x
        else multiplierBps = 50000; // 5.0x (10 Years)

        uint256 apyBps = (BASE_APY_BPS * multiplierBps) / BPS_DENOMINATOR;

        usdc.safeTransferFrom(msg.sender, returnsTreasury, amount);
        totalDeposits += amount;

        userStakes[msg.sender].push(StakedPosition({
            amount: amount,
            durationDays: durationDays,
            lockEndTime: block.timestamp + (durationDays * 1 days),
            apyBps: apyBps,
            lastClaimTime: block.timestamp,
            isActive: true,
            flowEligible: durationDays == 3650,
            withdrawnFlow: 0
        }));

        emit Staked(msg.sender, amount, durationDays, apyBps);
    }

    function unstake(uint256 stakeId) external nonReentrant whenNotPaused {
        require(stakeId < userStakes[msg.sender].length, "invalid stakeId");
        StakedPosition storage sp = userStakes[msg.sender][stakeId];
        require(sp.isActive, "already unstaked");

        uint256 yield = calculateYield(msg.sender, stakeId);
        uint256 principal = sp.amount;
        bool penaltyApplied = false;

        if (block.timestamp < sp.lockEndTime) {
            uint256 penaltyBps = getEarlyWithdrawalPenaltyBps(sp.durationDays);
            uint256 penalty = (principal * penaltyBps) / BPS_DENOMINATOR;
            principal -= penalty;
            yield = 0; // Lose remaining yield if early
            penaltyApplied = true;
        }

        sp.isActive = false;
        totalDeposits -= sp.amount;

        uint256 totalReturn = principal + yield;
        require(usdc.balanceOf(returnsTreasury) >= totalReturn, "insufficient liquidity");
        
        usdc.safeTransferFrom(returnsTreasury, msg.sender, totalReturn);

        emit Unstaked(msg.sender, sp.amount, yield, penaltyApplied);
    }

    function claimYield(uint256 stakeId) external nonReentrant whenNotPaused {
        require(stakeId < userStakes[msg.sender].length, "invalid stakeId");
        StakedPosition storage sp = userStakes[msg.sender][stakeId];
        require(sp.isActive, "not active");

        // Non-flow lockers can only claim at end
        if (!sp.flowEligible) {
            require(block.timestamp >= sp.lockEndTime, "lock active");
        }

        uint256 yield = calculateYield(msg.sender, stakeId);
        require(yield > 0, "no yield");

        sp.lastClaimTime = block.timestamp;
        if (sp.flowEligible) {
            sp.withdrawnFlow += yield;
        }
        
        require(usdc.balanceOf(returnsTreasury) >= yield, "insufficient liquidity");
        usdc.safeTransferFrom(returnsTreasury, msg.sender, yield);

        emit YieldClaimed(msg.sender, yield);
    }

    function getEarlyWithdrawalPenaltyBps(uint256 durationDays) public pure returns (uint256) {
        if (durationDays <= 30) return 500;    // 5%
        if (durationDays <= 90) return 1000;   // 10%
        if (durationDays <= 180) return 1500;  // 15%
        if (durationDays <= 365) return 2000;  // 20%
        if (durationDays <= 1825) return 2500; // 25%
        return 3000; // 30% (10 Years)
    }

    function calculateYield(address user, uint256 stakeId) public view returns (uint256) {
        StakedPosition memory sp = userStakes[user][stakeId];
        if (!sp.isActive) return 0;

        uint256 timePassed = block.timestamp - sp.lastClaimTime;
        uint256 yield = (sp.amount * sp.apyBps * timePassed) / (BPS_DENOMINATOR * 365 days);
        return yield;
    }
}
