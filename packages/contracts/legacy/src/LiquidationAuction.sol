// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./DutchAuction.sol";
import "./InsuranceVault.sol";
import "./VestingAdapter.sol";

interface ILoanManager {
    function repayLiquidation(uint256 loanId, uint256 amount) external;
    function getRemainingDebt(uint256 loanId) external view returns (uint256);
    function pool() external view returns (address);
    function isolatedPools(uint8 rank) external view returns (address);
    function loans(uint256 loanId) external view returns (
        address borrower,
        address token,
        uint256 principal,
        uint256 interest,
        uint256 collateralId,
        uint256 collateralAmount,
        uint256 loanDuration,
        uint256 unlockTime,
        uint256 hedgeAmount,
        bool active
    );
}

interface IVestingAdapterNft is IVestingRegistry {
    function collateralToNftId(uint256 collateralId) external view returns (uint256);
    function wrapperNFT() external view returns (address);
    function transferNft(uint256 nftId, address to) external;
    function vestingContracts(uint256 collateralId) external view returns (address);
}

/**
 * @title LiquidationAuction
 * @notice A specialized Dutch Auction for liquidating locked vesting positions (vNFTs).
 * Settlement logic is customized to repay the protocol debt first.
 */
contract LiquidationAuction is DutchAuction {
    using SafeERC20 for IERC20;

    address public loanManager;

    event LiquidationSettled(uint256 indexed auctionId, uint256 loanId, address winner, uint256 amount);

    constructor(
        address _adapter,
        address _usdc,
        address _loanManager,
        address _initialGovernor
    ) DutchAuction(_adapter, _usdc, _initialGovernor) {
        loanManager = _loanManager;
    }

    /**
     * @notice Places a bid on a liquidation auction.
     * Overrides DutchAuction.bid to implement instant debt repayment and NFT transfer.
     */
    function bid(uint256 auctionId, uint256 amount) external override nonReentrant whenNotPaused {
        AuctionItem storage auction = auctions[auctionId];
        require(_isActive(auction), "Liquidation auction ended or inactive");
        
        uint256 currentPrice = _getCurrentPrice(auction);
        require(amount >= currentPrice, "Bid amount too low");

        // 1. Collect USDC from buyer
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // 2. Finalize (this will call our overridden _distributeProceeds)
        _finalizeAuction(auctionId, msg.sender, amount);
        
        // 3. Transfer vNFT to winner
        IVestingAdapterNft vAdapter = IVestingAdapterNft(address(adapter));
        uint256 nftId = vAdapter.collateralToNftId(auction.collateralId);
        if (nftId != 0) {
            vAdapter.transferNft(nftId, msg.sender);
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = amount;
        emit LiquidationSettled(auctionId, auctionToLoanId[auctionId], msg.sender, amount);
    }

    /**
     * @notice Liquidation secondary settlement: Repay protocol debt, then surplus to borrower.
     */
    function _distributeProceeds(uint256 auctionId, address seller, uint256 amount) internal override {
        uint256 loanId = auctionToLoanId[auctionId];
        uint256 debt = ILoanManager(loanManager).getRemainingDebt(loanId);
        uint256 repayAmount = amount > debt ? debt : amount;

        usdc.forceApprove(loanManager, repayAmount);
        ILoanManager(loanManager).repayLiquidation(loanId, repayAmount);

        // Refund surplus to borrower if any
        if (amount > repayAmount) {
            usdc.safeTransfer(seller, amount - repayAmount);
        }
    }

    mapping(uint256 => uint256) public auctionToLoanId;

    function setLoanId(uint256 auctionId, uint256 loanId) external {
        require(msg.sender == loanManager || hasRole(GOVERNOR_ROLE, msg.sender), "Not authorized");
        auctionToLoanId[auctionId] = loanId;
    }

    function setLoanManager(address _loanManager) external onlyGovernor {
        loanManager = _loanManager;
    }

    /**
     * @notice V7.0 Citadel: Settle with the Insurance Vault if no bid was placed.
     * Only callable after auction duration ends.
     */
    function settleWithInsurance(uint256 auctionId) external nonReentrant {
        AuctionItem storage auction = auctions[auctionId];
        require(!_isActive(auction), "Auction still active");
        require(auction.highestBidder == address(0), "Bid already placed");
        
        uint256 loanId = auctionToLoanId[auctionId];
        ILoanManager manager = ILoanManager(loanManager);
        uint256 debt = manager.getRemainingDebt(loanId);
        
        // Find the correct pool for this loan
        (,,,, uint256 collateralId,,,,,) = manager.loans(loanId);
        IVestingAdapterNft vAdapter = IVestingAdapterNft(address(adapter));
        address vContract = vAdapter.vestingContracts(collateralId);
        uint8 rank = vAdapter.getRank(vContract);
        
        address targetPool = manager.isolatedPools(rank);
        if (targetPool == address(0)) {
            targetPool = manager.pool();
        }

        // The Insurance Vault transfers the debt to this auction contract
        vVault.collectDeficit(debt);
        uint256 nftId = vAdapter.collateralToNftId(auction.collateralId);
        if (nftId != 0) {
            vAdapter.transferNft(nftId, address(vVault));
        }
        
        _finalizeAuction(auctionId, address(vVault), debt);
        emit LiquidationSettled(auctionId, loanId, address(vVault), debt);
    }
    
    InsuranceVault public vVault; // The Insurance Vault
    function setInsuranceVault(address _vault) external onlyGovernor {
        vVault = InsuranceVault(_vault);
    }
}
