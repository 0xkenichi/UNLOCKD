// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./BaseAuction.sol";
import "./VestingAdapter.sol";

/**
 * @title StagedTrancheAuction
 * @notice Liquidates massive vested positions automatically over discrete time periods (tranches) 
 * instead of a single massive block sale that would dump the market.
 */
contract StagedTrancheAuction is BaseAuction {
    using SafeERC20 for IERC20;
    
    struct TrancheState {
        uint256 tranchesCount;
        uint256 currentTranche;
        uint256 trancheDuration;
        uint256 baseTotalAssets;
        uint256 assetsPerTranche;
    }
    
    mapping(uint256 => TrancheState) public trancheStates;

    constructor(address _adapter, address _usdc) BaseAuction(_adapter, _usdc) {}

    // Override the base creation to initialize tranche states
    function _initializeTranche(
        uint256 auctionId,
        uint256 tranches,
        uint256 interval
    ) external {
        // Restricted to the factory or loan manager configuring the auction
        require(tranches > 0 && tranches <= 100, "bad tranche count");
        
        AuctionItem storage auction = auctions[auctionId];
        require(auction.startTime > 0, "auction not started");
        
        VestingAdapter adapterContract = VestingAdapter(adapter);
        (uint256 quantity, , ) = adapterContract.getDetails(auction.collateralId);

        trancheStates[auctionId] = TrancheState({
            tranchesCount: tranches,
            currentTranche: 0,
            trancheDuration: interval,
            baseTotalAssets: quantity,
            assetsPerTranche: quantity / tranches
        });
    }

    // A buyer can buy out the CURRENT tranche at the current decaying Dutch price
    function bid(uint256 auctionId, uint256 amount) external override nonReentrant whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        require(_isActive(auction), "ended");
        require(auction.startPrice >= auction.endPrice, "bad range");
        
        TrancheState storage tranche = trancheStates[auctionId];
        require(tranche.tranchesCount > 0, "not configured");
        require(tranche.currentTranche < tranche.tranchesCount, "all tranches sold");
        
        // Ensure the current tranche's time window is open
        uint256 currentTrancheStartTime = auction.startTime + (tranche.currentTranche * tranche.trancheDuration);
        require(block.timestamp >= currentTrancheStartTime, "tranche not active yet");

        uint256 currentPrice = getCurrentPrice(auctionId);
        require(amount == currentPrice, "bad amount");

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        auction.highestBidder = msg.sender;
        auction.highestBid = amount;
        
        // Execute the sale for *just* this tranche's proportion of the collateral
        tranche.currentTranche += 1;
        emit BidPlaced(auctionId, amount);

        // If this was the final tranche, fully finalize the auction
        if (tranche.currentTranche == tranche.tranchesCount) {
             _finalizeAuction(auctionId, msg.sender, amount);
        } else {
            // Partial send of funds (tranche portion) to the seller immediately.
            _distributeProceeds(auction.seller, amount);
        }
    }

    function endAuction(uint256 auctionId) external override nonReentrant whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        require(!_isActive(auction), "active");

        AuctionState storage state = auctionStates[auctionId];
        require(!state.finalized, "finalized");
        _finalizeNoBid(auctionId);
    }

    function getCurrentPrice(uint256 auctionId) public view override returns (uint256) {
        AuctionItem storage auction = auctions[auctionId];
        TrancheState storage tranche = trancheStates[auctionId];
        
        if (tranche.tranchesCount == 0 || block.timestamp >= auction.startTime + auction.duration) {
            return auction.endPrice;
        }

        uint256 currentTrancheStartTime = auction.startTime + (tranche.currentTranche * tranche.trancheDuration);
        if (block.timestamp < currentTrancheStartTime) {
            return auction.startPrice; // Not open yet
        }
        
        uint256 timeElapsedInTranche = block.timestamp - currentTrancheStartTime;
        uint256 maxTrancheTime = tranche.trancheDuration;
        
        if (timeElapsedInTranche >= maxTrancheTime) {
            return auction.endPrice;
        }

        uint256 totalDecay = auction.startPrice - auction.endPrice;
        return auction.startPrice - (totalDecay * timeElapsedInTranche) / maxTrancheTime;
    }
}
