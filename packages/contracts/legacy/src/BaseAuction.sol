// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "./governance/VestraAccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IAuction.sol";
import "./VestingAdapter.sol";

abstract contract BaseAuction is VestraAccessControl, IAuction, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct AuctionState {
        address winner;
        uint256 finalPrice;
        bool finalized;
        bool claimed;
    }

    mapping(uint256 => AuctionItem) public auctions;
    mapping(uint256 => AuctionState) internal auctionStates;
    uint256 public auctionCount;
    VestingAdapter public immutable adapter;
    IERC20 public immutable usdc;
    address public feeRecipient;

    uint256 public constant FEE_BPS = 200; // 2%
    uint256 public constant BPS_DENOMINATOR = 10000;

    event AuctionFinalized(uint256 auctionId, address winner, uint256 amount);
    event AuctionClaimed(uint256 auctionId, address winner, uint256 amount);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    constructor(address _adapter, address _usdc, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_adapter != address(0), "adapter=0");
        require(_usdc != address(0), "usdc=0");
        adapter = VestingAdapter(_adapter);
        usdc = IERC20(_usdc);
        feeRecipient = _initialGovernor;
    }

    function setFeeRecipient(address _newRecipient) external onlyGovernor {
        require(_newRecipient != address(0), "recipient=0");
        emit FeeRecipientUpdated(feeRecipient, _newRecipient);
        feeRecipient = _newRecipient;
    }

    function createAuction(
        uint256 collateralId,
        address vestingContract,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    ) external override whenNotPaused {
        require(startPrice > 0, "start=0");
        require(duration > 0, "duration=0");
        if (adapter.vestingContracts(collateralId) == address(0)) {
            adapter.escrow(collateralId, vestingContract, msg.sender);
        }

        auctions[auctionCount] = AuctionItem({
            collateralId: collateralId,
            startPrice: startPrice,
            endPrice: endPrice,
            duration: duration,
            startTime: block.timestamp,
            seller: msg.sender,
            highestBidder: address(0),
            highestBid: 0
        });
        emit AuctionCreated(auctionCount, collateralId);
        auctionCount++;
    }

    function endAuction(uint256 auctionId) external virtual override;
    function bid(uint256 auctionId, uint256 amount) external virtual override;
    function getCurrentPrice(uint256 auctionId) external view virtual override returns (uint256);

    function claim(uint256 auctionId) external override nonReentrant whenNotPaused {
        AuctionState storage state = auctionStates[auctionId];
        require(state.finalized, "not finalized");
        require(!state.claimed, "claimed");
        require(state.winner == msg.sender, "not winner");

        (uint256 quantity, , uint256 unlockTime) = adapter.getDetails(
            auctions[auctionId].collateralId
        );
        require(block.timestamp >= unlockTime, "not unlocked");
        require(quantity > 0, "amount=0");

        state.claimed = true;
        adapter.releaseTo(auctions[auctionId].collateralId, msg.sender, quantity);

        emit AuctionClaimed(auctionId, msg.sender, quantity);
        delete auctions[auctionId];
        delete auctionStates[auctionId];
    }

    function _finalizeAuction(uint256 auctionId, address winner, uint256 amount) internal {
        AuctionState storage state = auctionStates[auctionId];
        require(!state.finalized, "finalized");
        state.winner = winner;
        state.finalPrice = amount;
        state.finalized = true;

        if (amount > 0) {
            _distributeProceeds(auctionId, auctions[auctionId].seller, amount);
        }

        emit AuctionFinalized(auctionId, winner, amount);
        emit AuctionEnded(auctionId, winner, amount);
    }

    function _finalizeNoBid(uint256 auctionId) internal {
        _finalizeAuction(auctionId, auctions[auctionId].seller, 0);
    }

    function _distributeProceeds(uint256 auctionId, address seller, uint256 amount) internal virtual {
        uint256 fee = (amount * FEE_BPS) / BPS_DENOMINATOR;
        if (fee > 0) {
            usdc.safeTransfer(feeRecipient, fee);
        }
        usdc.safeTransfer(seller, amount - fee);
    }

    function _isActive(AuctionItem memory auction) internal view returns (bool) {
        return block.timestamp < auction.startTime + auction.duration;
    }

    function pause() external onlyGovernor {
        _pause();
    }

    function unpause() external onlyGovernor {
        _unpause();
    }
}
