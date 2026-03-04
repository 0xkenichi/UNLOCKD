// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "./ValuationEngine.sol";
import "./VestingAdapter.sol";
import "./LendingPool.sol";
import "./AuctionFactory.sol";
import "./IAuction.sol";
import "./InsuranceVault.sol";
import "./DistressedDebtBond.sol";
import "./IsolatedLendingPool.sol";
import "./libraries/LoanLogicLib.sol";
import "./LoanManagerStorage.sol";

contract LoanManager is LoanManagerStorage {
    using SafeERC20 for IERC20;



    constructor(
        address _valuation,
        address _adapter,
        address _pool,
        address _identityVerifier,
        uint256 _identityBoostBps,
        address _auctionFactory,
        address _uniswapRouter,
        uint24 _poolFee,
        uint256 _slippageBps
    ) Ownable(msg.sender) {
        valuation = ValuationEngine(_valuation);
        adapter = VestingAdapter(_adapter);
        pool = LendingPool(_pool);
        identityVerifier = _identityVerifier;
        identityBoostBps = _identityBoostBps;
        auctionFactory = AuctionFactory(_auctionFactory);
        uniswapRouter = ISwapRouter(_uniswapRouter);
        poolFee = _poolFee;
        liquidationSlippageBps = _slippageBps;
        usdc = pool.usdc();
        issuanceTreasury = msg.sender;
        returnsTreasury = msg.sender;
        originationFeeBps = 150;
        autoRepayLtvBoostBps = 0;
        autoRepayInterestDiscountBps = 0;
    }

    function setAutoRepayOptIn(bool enabled) external whenNotPaused nonReentrant {
        if (enabled) {
            if (!_hasAutoRepayPermissions(msg.sender)) revert MissingRepayPermissions();
        }
        autoRepayOptIn[msg.sender] = enabled;
        emit AutoRepayOptInUpdated(msg.sender, enabled);
    }

    function setAutoRepayConfig(
        uint256 ltvBoostBps,
        uint256 interestDiscountBps
    ) external onlyOwner {
        if (ltvBoostBps > 2000) revert ExceedsLTV();
        if (interestDiscountBps > 2000) revert ExceedsLTV();
        autoRepayLtvBoostBps = ltvBoostBps;
        autoRepayInterestDiscountBps = interestDiscountBps;
        emit AutoRepayConfigUpdated(ltvBoostBps, interestDiscountBps);
    }
    
    function setInsuranceVault(address vault, uint256 bps) external onlyOwner {
        if (bps > 2000) revert ExceedsLTV();
        insuranceVault = InsuranceVault(vault);
        autoHedgeBps = bps;
        emit AutoHedgeConfigured(vault, bps);
    }

    function setAutoRepayRequiredTokens(address[] calldata tokens) external onlyOwner {
        if (tokens.length > 8) revert TooManyTokens();
        // Clear list.
        delete autoRepayRequiredTokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            if (token == address(0)) revert InvalidToken();
            if (repayTokenPriority[token] == 0) revert TokenNotAllowed();
            autoRepayRequiredTokens.push(token);
        }
        emit AutoRepayRequiredTokensUpdated(tokens);
    }

    function getAutoRepayRequiredTokens() external view returns (address[] memory) {
        return autoRepayRequiredTokens;
    }

    function hasAutoRepayPermissions(address borrower) external view returns (bool) {
        return _hasAutoRepayPermissions(borrower);
    }

    function getRemainingDebt(uint256 loanId) external view returns (uint256) {
        Loan memory loan = loans[loanId];
        if (!loan.active) {
            return 0;
        }
        return loan.principal + loan.interest;
    }

    function quoteMinUsdcOut(address tokenIn, uint256 amountIn) external view returns (uint256) {
        if (tokenIn == address(0)) revert InvalidToken();
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == address(usdc)) {
            return amountIn;
        }
        return LoanLogicLib.minUsdcOut(valuation, tokenIn, address(usdc), amountIn, liquidationSlippageBps);
    }

    function _hasAutoRepayPermissions(address borrower) internal view returns (bool) {
        if (borrower == address(0)) return false;
        for (uint256 i = 0; i < autoRepayRequiredTokens.length; i++) {
            address token = autoRepayRequiredTokens[i];
            if (IERC20(token).allowance(borrower, address(this)) == 0) {
                return false;
            }
        }
        return true;
    }

    function setIdentityConfig(address verifier, uint256 boostBps) external onlyOwner {
        if (boostBps > 2000) revert ExceedsLTV();
        identityVerifier = verifier;
        identityBoostBps = boostBps;
        emit IdentityConfigUpdated(verifier, boostBps);
    }

    function setLiquidationConfig(
        address router,
        uint24 newPoolFee,
        uint256 slippageBps
    ) external onlyOwner {
        if (adminTimelockEnabled) revert TimelockPending();
        _applyLiquidationConfig(router, newPoolFee, slippageBps);
    }

    function queueLiquidationConfig(
        address router,
        uint24 newPoolFee,
        uint256 slippageBps
    ) external onlyOwner {
        if (!adminTimelockEnabled) revert TimelockDisabled();
        if (router == address(0)) revert InvalidToken();
        if (slippageBps == 0 || slippageBps > BPS_DENOMINATOR) revert BadSlippage();
        uint256 executeAfter = block.timestamp + adminTimelockDelay;
        pendingLiquidationConfig = PendingLiquidationConfig({
            router: router,
            poolFee: newPoolFee,
            slippageBps: slippageBps,
            executeAfter: executeAfter,
            exists: true
        });
        emit LiquidationConfigQueued(router, newPoolFee, slippageBps, executeAfter);
    }

    function executeQueuedLiquidationConfig() external onlyOwner {
        PendingLiquidationConfig memory pending = pendingLiquidationConfig;
        if (!pending.exists) revert NoQueuedConfig();
        if (block.timestamp < pending.executeAfter) revert TimelockPending();
        delete pendingLiquidationConfig;
        _applyLiquidationConfig(pending.router, pending.poolFee, pending.slippageBps);
    }

    function cancelQueuedLiquidationConfig() external onlyOwner {
        if (!pendingLiquidationConfig.exists) revert NoQueuedConfig();
        delete pendingLiquidationConfig;
        emit LiquidationConfigCancelled();
    }

    /// @notice Explicitly authorize or revoke an account's compliance status.
    /// @param account The address of the borrower or vault.
    /// @param status True to pass, false to block.
    function setSanctionsPass(address account, bool status) external onlyOwner {
        sanctionsPass[account] = status;
        emit SanctionsStatusUpdated(account, status);
    }

    /// @notice V6.0 Citadel - Set the designated Treasury address for a token to enable exclusive OTC buybacks
    function setTokenTreasury(address token, address treasury) external onlyOwner {
        tokenTreasuries[token] = treasury;
        emit TokenTreasurySet(token, treasury);
    }

    function setTreasuries(address issuance, address returnsAddr) external onlyOwner {
        if (adminTimelockEnabled) revert TimelockPending();
        _applyTreasuries(issuance, returnsAddr);
    }

    function queueTreasuries(address issuance, address returnsAddr) external onlyOwner {
        if (!adminTimelockEnabled) revert TimelockDisabled();
        if (issuance == address(0)) revert InvalidToken();
        if (returnsAddr == address(0)) revert InvalidToken();
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
        if (!pending.exists) revert NoQueuedConfig();
        if (block.timestamp < pending.executeAfter) revert TimelockPending();
        delete pendingTreasuryConfig;
        _applyTreasuries(pending.issuanceTreasury, pending.returnsTreasury);
    }

    function cancelQueuedTreasuries() external onlyOwner {
        if (!pendingTreasuryConfig.exists) revert NoQueuedConfig();
        delete pendingTreasuryConfig;
        emit TreasuryConfigCancelled();
    }

    function setAdminTimelockConfig(bool enabled, uint256 delaySeconds) external onlyOwner {
        if (delaySeconds < 1 minutes || delaySeconds > 30 days) revert TimelockPending();
        adminTimelockEnabled = enabled;
        adminTimelockDelay = delaySeconds;
        emit AdminTimelockConfigUpdated(enabled, delaySeconds);
    }

    function _applyTreasuries(address issuance, address returnsAddr) internal {
        if (issuance == address(0)) revert InvalidToken();
        if (returnsAddr == address(0)) revert InvalidToken();
        issuanceTreasury = issuance;
        returnsTreasury = returnsAddr;
        emit TreasuryConfigUpdated(issuance, returnsAddr);
    }

    function _applyLiquidationConfig(
        address router,
        uint24 newPoolFee,
        uint256 slippageBps
    ) internal {
        if (router == address(0)) revert InvalidToken();
        if (slippageBps == 0 || slippageBps > BPS_DENOMINATOR) revert BadSlippage();
        uniswapRouter = ISwapRouter(router);
        poolFee = newPoolFee;
        liquidationSlippageBps = slippageBps;
        emit LiquidationConfigUpdated(router, newPoolFee, slippageBps);
    }

    /// @notice Update the origination fee. Protected by the admin timelock when enabled
    /// to prevent fee changes from being sandwiched between tx submission and mining.
    function setOriginationFeeBps(uint256 feeBps) external onlyOwner {
        if (adminTimelockEnabled) revert TimelockPending();
        if (feeBps > 2000) revert ExceedsLTV();
        originationFeeBps = feeBps;
        emit OriginationFeeUpdated(feeBps);
    }

    /**
     * @notice V8.0 MeTTa - Set the systemic borrow rate. Authorized for Coprocessor.
     */
    function setDynamicBorrowRate(uint256 rateBps) external {
        require(
            msg.sender == valuation.coprocessor() || msg.sender == owner(),
            "unauthorized coprocessor"
        );
        require(rateBps >= 100 && rateBps <= 5000, "rate out of range");
        dynamicBorrowRateBps = rateBps;
        emit DynamicRateUpdated(rateBps);
    }


    function linkIdentity(bytes calldata proof) external whenNotPaused nonReentrant returns (bool) {
        if (identityVerifier == address(0)) revert NoVerifier();
        bool ok = IIdentityVerifier(identityVerifier).verifyProof(msg.sender, proof);
        if (!ok) revert InvalidProof();
        identityLinked[msg.sender] = true;
        emit IdentityLinked(msg.sender, identityBoostBps);
        return true;
    }

    function setFacets(address _origination, address _repayment) external onlyOwner {
        originationFacet = _origination;
        repaymentFacet = _repayment;
    }


    fallback() external payable {
        address facet;
        bytes4 sig = msg.sig;
        
        // Origination Routes
        if (
            sig == bytes4(keccak256("createLoan(uint256,address,uint256,uint256)")) ||
            sig == bytes4(keccak256("createLoanWithCollateralAmount(uint256,address,uint256,uint256,uint256)")) ||
            sig == bytes4(keccak256("createPrivateLoan(uint256,address,uint256,uint256)")) ||
            sig == bytes4(keccak256("createPrivateLoanWithCollateralAmount(uint256,address,uint256,uint256,uint256)"))
        ) {
            facet = originationFacet;
        } 
        // Repayment & Execution Routes
        else {
            facet = repaymentFacet;
        }
        
        require(facet != address(0), "Facet not set");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    
    receive() external payable {}

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
