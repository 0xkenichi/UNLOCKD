// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./governance/VestraAccessControl.sol";

interface IVestingWallet {
    function beneficiary() external view returns (address);
    function start() external view returns (uint256);
    function duration() external view returns (uint256);
    function released(address token) external view returns (uint256);
}

interface IVestingWalletToken is IVestingWallet {
    function token() external view returns (address);
    function totalAllocation() external view returns (uint256);
}

interface IVestingWalletTokenRelease is IVestingWalletToken {
    function releaseTo(address to, uint256 amount) external;
}

interface IVestingRegistry {
    function getRank(address wrapper) external view returns (uint8);
}

interface IVestraWrapperNFT {
    function mint(
        address to,
        address originalContract,
        address token,
        uint256 totalAllocation,
        uint256 unlockTime,
        string calldata uri
    ) external returns (uint256);
}

contract VestingAdapter is IERC721Receiver, VestraAccessControl {

    struct Collateral {
        address vestingContract;
        address token;
        uint256 totalAmount;
        uint256 unlockTime;
    }

    address public loanManager;
    IVestingRegistry public registry;
    IVestraWrapperNFT public wrapperNFT;
    mapping(address => bool) public authorizedCallers;
    mapping(uint256 => Collateral) public collaterals;
    mapping(uint256 => uint256) public collateralToNftId;
    mapping(uint256 => address) public vestingContracts;

    bool public adminTimelockEnabled;
    uint256 public adminTimelockDelay = 1 days;

    struct PendingLoanManager {
        address manager;
        uint256 executeAfter;
        bool exists;
    }

    struct PendingBoolValue {
        bool value;
        uint256 executeAfter;
        bool exists;
    }

    PendingLoanManager public pendingLoanManager;
    PendingBoolValue public pendingUseWhitelist;
    mapping(address => PendingBoolValue) public pendingAuthorizedCallers;
    mapping(address => PendingBoolValue) public pendingAllowedVestingContracts;

    event LoanManagerUpdated(address indexed loanManager);
    event AuthorizedCallerUpdated(address indexed caller, bool allowed);
    event UseWhitelistUpdated(bool enabled);
    event AllowedVestingContractUpdated(address indexed vestingContract, bool allowed);
    event AdminTimelockConfigUpdated(bool enabled, uint256 delaySeconds);
    event LoanManagerQueued(address indexed manager, uint256 executeAfter);
    event LoanManagerQueueCancelled();
    event AuthorizedCallerQueued(address indexed caller, bool allowed, uint256 executeAfter);
    event AuthorizedCallerQueueCancelled(address indexed caller);
    event UseWhitelistQueued(bool enabled, uint256 executeAfter);
    event UseWhitelistQueueCancelled();
    event AllowedVestingContractQueued(address indexed vestingContract, bool allowed, uint256 executeAfter);
    event AllowedVestingContractQueueCancelled(address indexed vestingContract);
    event RegistryUpdated(address indexed registry);
    event WrapperNFTUpdated(address indexed wrapperNFT);
    event CollateralTransferred(uint256 indexed collateralId, address indexed oldOwner, address indexed newOwner);
    event CollateralWrapped(uint256 indexed collateralId, uint256 indexed nftId, address indexed borrower);

    constructor(address _registry, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_registry != address(0), "registry=0");
        registry = IVestingRegistry(_registry);
    }

    function setRegistry(address _registry) external onlyGovernor {
        require(_registry != address(0), "registry=0");
        registry = IVestingRegistry(_registry);
        emit RegistryUpdated(_registry);
    }

    function setWrapperNFT(address _wrapperNFT) external onlyGovernor {
        require(_wrapperNFT != address(0), "wrapperNFT=0");
        wrapperNFT = IVestraWrapperNFT(_wrapperNFT);
        emit WrapperNFTUpdated(_wrapperNFT);
    }

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

    function setAuthorizedCaller(address caller, bool allowed) external onlyGovernor {
        require(!adminTimelockEnabled, "timelocked");
        _applyAuthorizedCaller(caller, allowed);
    }

    function queueAuthorizedCaller(address caller, bool allowed) external onlyGovernor {
        require(adminTimelockEnabled, "timelock disabled");
        require(caller != address(0), "caller=0");
        uint256 executeAfter = block.timestamp + adminTimelockDelay;
        pendingAuthorizedCallers[caller] = PendingBoolValue({
            value: allowed,
            executeAfter: executeAfter,
            exists: true
        });
        emit AuthorizedCallerQueued(caller, allowed, executeAfter);
    }

    function executeQueuedAuthorizedCaller(address caller) external onlyGovernor {
        PendingBoolValue memory pending = pendingAuthorizedCallers[caller];
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingAuthorizedCallers[caller];
        _applyAuthorizedCaller(caller, pending.value);
    }

    function cancelQueuedAuthorizedCaller(address caller) external onlyGovernor {
        require(pendingAuthorizedCallers[caller].exists, "no queued config");
        delete pendingAuthorizedCallers[caller];
        emit AuthorizedCallerQueueCancelled(caller);
    }

    // Note: UseWhitelist and AllowedVestingContract logic removed in favor of VestingRegistry.
    // Legacy mapping configurations have been stripped.

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

    function _applyAuthorizedCaller(address caller, bool allowed) internal {
        require(caller != address(0), "caller=0");
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerUpdated(caller, allowed);
    }

    function getRank(address projectToken) public view returns (uint8) {
        return registry.getRank(projectToken);
    }

    function authorizeAuction(address auction) external {
        require(msg.sender == loanManager, "not manager");
        authorizedCallers[auction] = true;
    }

    function transferNft(uint256 nftId, address to) external {
        require(authorizedCallers[msg.sender], "not authorized");
        require(address(wrapperNFT) != address(0), "wrapperNFT=0");
        IERC721(address(wrapperNFT)).safeTransferFrom(address(this), to, nftId);
    }

    function escrow(
        uint256 collateralId,
        address vestingContract,
        address borrower
    ) external {
        require(borrower != address(0), "borrower=0");
        require(
            msg.sender == borrower ||
                msg.sender == loanManager ||
                authorizedCallers[msg.sender],
            "not authorized"
        );
        require(vestingContract.code.length > 0, "not a contract");
        
        require(address(registry) != address(0), "registry not initialized");
        uint8 rank = registry.getRank(vestingContract);
        require(rank > 0 && rank <= 3, "unverified or blacklisted contract");

        require(collaterals[collateralId].vestingContract == address(0), "id used");

        IVestingWalletToken vesting = IVestingWalletToken(vestingContract);
        require(vesting.beneficiary() == borrower, "not beneficiary");

        uint256 start = vesting.start();
        uint256 duration = vesting.duration();
        require(duration > 0, "duration=0");
        uint256 unlockTime = start + duration;
        require(unlockTime > block.timestamp, "already unlocked");

        address token = vesting.token();
        require(token != address(0), "token=0");
        uint256 total = vesting.totalAllocation();
        require(total > 0, "total=0");

        collaterals[collateralId] = Collateral({
            vestingContract: vestingContract,
            token: token,
            totalAmount: total,
            unlockTime: unlockTime
        });
        vestingContracts[collateralId] = vestingContract;

        // Mint Wrapper NFT
        if (address(wrapperNFT) != address(0)) {
            uint256 nftId = wrapperNFT.mint(
                address(this),
                vestingContract,
                token,
                total,
                unlockTime,
                "" // Default empty URI for now
            );
            collateralToNftId[collateralId] = nftId;
            emit CollateralWrapped(collateralId, nftId, borrower);
        }
    }

    function getDetails(
        uint256 collateralId
    ) external view returns (uint256 quantity, address token, uint256 unlockTime) {
        Collateral memory c = collaterals[collateralId];
        require(c.vestingContract != address(0), "unknown collateral");

        uint256 releasedAmt = IVestingWallet(c.vestingContract).released(c.token);
        require(c.totalAmount >= releasedAmt, "released>total");
        quantity = c.totalAmount - releasedAmt;
        token = c.token;
        unlockTime = c.unlockTime;
    }

    function releaseTo(uint256 collateralId, address to, uint256 amount) external {
        require(
            msg.sender == loanManager || authorizedCallers[msg.sender],
            "not authorized"
        );
        require(to != address(0), "to=0");

        Collateral memory c = collaterals[collateralId];
        require(c.vestingContract != address(0), "unknown collateral");
        require(block.timestamp >= c.unlockTime, "not unlocked");
        require(amount > 0, "amount=0");

        IVestingWalletTokenRelease(c.vestingContract).releaseTo(to, amount);
    }

    function transferCollateral(uint256 collateralId, address newOwner) external {
        require(
            msg.sender == loanManager || authorizedCallers[msg.sender],
            "not authorized"
        );
        require(newOwner != address(0), "newOwner=0");
        Collateral memory c = collaterals[collateralId];
        require(c.vestingContract != address(0), "unknown collateral");

        emit CollateralTransferred(collateralId, address(this), newOwner);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
