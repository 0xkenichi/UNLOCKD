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

interface IIdentityVerifier {
    function verifyProof(address user, bytes calldata proof) external returns (bool);
}

contract LoanManager is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ValuationEngine public valuation;
    VestingAdapter public adapter;
    LendingPool public pool;
    address public identityVerifier;
    uint256 public identityBoostBps;
    ISwapRouter public uniswapRouter;
    IERC20 public usdc;
    uint24 public poolFee;
    uint256 public liquidationSlippageBps;
    address public issuanceTreasury;
    address public returnsTreasury;
    uint256 public originationFeeBps;
    bool public adminTimelockEnabled;
    uint256 public adminTimelockDelay = 1 days;
    uint256 public autoRepayLtvBoostBps;
    uint256 public autoRepayInterestDiscountBps;

    struct PendingTreasuryConfig {
        address issuanceTreasury;
        address returnsTreasury;
        uint256 executeAfter;
        bool exists;
    }

    struct PendingLiquidationConfig {
        address router;
        uint24 poolFee;
        uint256 slippageBps;
        uint256 executeAfter;
        bool exists;
    }

    PendingTreasuryConfig public pendingTreasuryConfig;
    PendingLiquidationConfig public pendingLiquidationConfig;

    uint256 public constant BPS_DENOMINATOR = 10000;

    struct Loan {
        address borrower;
        uint256 principal;
        uint256 interest;
        uint256 collateralId;
        uint256 collateralAmount;
        uint256 unlockTime;
        bool active;
    }

    /// @notice Private-mode loan representation: vault is the onchain actor.
    /// The user's primary wallet should not be stored or emitted for these loans.
    struct PrivateLoan {
        address vault;
        uint256 principal;
        uint256 interest;
        uint256 collateralId;
        uint256 collateralAmount;
        uint256 unlockTime;
        bool active;
    }

    mapping(uint256 => Loan) public loans;
    mapping(uint256 => PrivateLoan) public privateLoans;
    uint256 public loanCount;
    mapping(address => bool) public identityLinked;
    mapping(address => uint256) public repayTokenPriority;
    address[] public repayTokens;
    mapping(address => bool) public autoRepayOptIn;
    address[] public autoRepayRequiredTokens;

    event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event PrivateLoanCreated(uint256 indexed loanId, address indexed vault, uint256 amount);
    event LoanRepaid(uint256 indexed loanId, uint256 amount);
    event PrivateLoanRepaid(uint256 indexed loanId, uint256 amount);
    event LoanRepaidWithSwap(
        uint256 indexed loanId,
        address indexed tokenIn,
        uint256 amountIn,
        uint256 usdcReceived
    );
    event LoanSettled(uint256 indexed loanId, bool defaulted);
    event PrivateLoanSettled(uint256 indexed loanId, bool defaulted);
    event IdentityLinked(address indexed borrower, uint256 boostBps);
    event IdentityConfigUpdated(address verifier, uint256 boostBps);
    event LiquidationConfigUpdated(address router, uint24 poolFee, uint256 slippageBps);
    event TreasuryConfigUpdated(address issuanceTreasury, address returnsTreasury);
    event RepayTokenPriorityUpdated(address[] tokens);
    event OriginationFeeUpdated(uint256 originationFeeBps);
    event AdminTimelockConfigUpdated(bool enabled, uint256 delaySeconds);
    event TreasuryConfigQueued(address issuanceTreasury, address returnsTreasury, uint256 executeAfter);
    event TreasuryConfigCancelled();
    event LiquidationConfigQueued(address router, uint24 poolFee, uint256 slippageBps, uint256 executeAfter);
    event LiquidationConfigCancelled();
    event CollateralLiquidated(
        uint256 indexed loanId,
        address indexed token,
        uint256 seizedAmount,
        uint256 usdcReceived
    );
    event AutoRepayOptInUpdated(address indexed borrower, bool enabled);
    event AutoRepayConfigUpdated(uint256 ltvBoostBps, uint256 interestDiscountBps);
    event AutoRepayRequiredTokensUpdated(address[] tokens);

    constructor(
        address _valuation,
        address _adapter,
        address _pool,
        address _identityVerifier,
        uint256 _identityBoostBps,
        address _uniswapRouter,
        uint24 _poolFee,
        uint256 _slippageBps
    ) Ownable(msg.sender) {
        valuation = ValuationEngine(_valuation);
        adapter = VestingAdapter(_adapter);
        pool = LendingPool(_pool);
        identityVerifier = _identityVerifier;
        identityBoostBps = _identityBoostBps;
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
            require(_hasAutoRepayPermissions(msg.sender), "missing repay permissions");
        }
        autoRepayOptIn[msg.sender] = enabled;
        emit AutoRepayOptInUpdated(msg.sender, enabled);
    }

    function setAutoRepayConfig(
        uint256 ltvBoostBps,
        uint256 interestDiscountBps
    ) external onlyOwner {
        require(ltvBoostBps <= 2000, "ltv boost too high");
        require(interestDiscountBps <= 2000, "discount too high");
        autoRepayLtvBoostBps = ltvBoostBps;
        autoRepayInterestDiscountBps = interestDiscountBps;
        emit AutoRepayConfigUpdated(ltvBoostBps, interestDiscountBps);
    }

    function setAutoRepayRequiredTokens(address[] calldata tokens) external onlyOwner {
        require(tokens.length <= 8, "too many tokens");
        // Clear list.
        delete autoRepayRequiredTokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            require(token != address(0), "token=0");
            // Only allow tokens already whitelisted for repay swaps.
            require(repayTokenPriority[token] > 0, "token not allowed");
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
        require(tokenIn != address(0), "token=0");
        require(amountIn > 0, "amount=0");
        if (tokenIn == address(usdc)) {
            return amountIn;
        }
        return _minUsdcOut(tokenIn, amountIn);
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
        require(boostBps <= 2000, "boost too high");
        identityVerifier = verifier;
        identityBoostBps = boostBps;
        emit IdentityConfigUpdated(verifier, boostBps);
    }

    function setLiquidationConfig(
        address router,
        uint24 newPoolFee,
        uint256 slippageBps
    ) external onlyOwner {
        require(!adminTimelockEnabled, "timelocked");
        _applyLiquidationConfig(router, newPoolFee, slippageBps);
    }

    function queueLiquidationConfig(
        address router,
        uint24 newPoolFee,
        uint256 slippageBps
    ) external onlyOwner {
        require(adminTimelockEnabled, "timelock disabled");
        require(router != address(0), "router=0");
        require(slippageBps > 0 && slippageBps <= BPS_DENOMINATOR, "bad slippage");
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
        require(pending.exists, "no queued config");
        require(block.timestamp >= pending.executeAfter, "timelock pending");
        delete pendingLiquidationConfig;
        _applyLiquidationConfig(pending.router, pending.poolFee, pending.slippageBps);
    }

    function cancelQueuedLiquidationConfig() external onlyOwner {
        require(pendingLiquidationConfig.exists, "no queued config");
        delete pendingLiquidationConfig;
        emit LiquidationConfigCancelled();
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

    function setAdminTimelockConfig(bool enabled, uint256 delaySeconds) external onlyOwner {
        require(delaySeconds >= 1 minutes && delaySeconds <= 30 days, "bad delay");
        adminTimelockEnabled = enabled;
        adminTimelockDelay = delaySeconds;
        emit AdminTimelockConfigUpdated(enabled, delaySeconds);
    }

    function _applyLiquidationConfig(
        address router,
        uint24 newPoolFee,
        uint256 slippageBps
    ) internal {
        require(router != address(0), "router=0");
        require(slippageBps > 0 && slippageBps <= BPS_DENOMINATOR, "bad slippage");
        uniswapRouter = ISwapRouter(router);
        poolFee = newPoolFee;
        liquidationSlippageBps = slippageBps;
        emit LiquidationConfigUpdated(router, newPoolFee, slippageBps);
    }

    function _applyTreasuries(address issuance, address returnsAddr) internal {
        require(issuance != address(0), "issuance=0");
        require(returnsAddr != address(0), "returns=0");
        issuanceTreasury = issuance;
        returnsTreasury = returnsAddr;
        emit TreasuryConfigUpdated(issuance, returnsAddr);
    }

    function setOriginationFeeBps(uint256 feeBps) external onlyOwner {
        require(feeBps <= 2000, "fee too high");
        originationFeeBps = feeBps;
        emit OriginationFeeUpdated(feeBps);
    }

    function linkIdentity(bytes calldata proof) external whenNotPaused nonReentrant returns (bool) {
        require(identityVerifier != address(0), "no verifier");
        bool ok = IIdentityVerifier(identityVerifier).verifyProof(msg.sender, proof);
        require(ok, "invalid proof");
        identityLinked[msg.sender] = true;
        emit IdentityLinked(msg.sender, identityBoostBps);
        return true;
    }

    function createLoan(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount
    ) external whenNotPaused nonReentrant {
        _createLoan(collateralId, vestingContract, borrowAmount, 0);
    }

    function createLoanWithCollateralAmount(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount
    ) external whenNotPaused nonReentrant {
        _createLoan(collateralId, vestingContract, borrowAmount, collateralAmount);
    }

    function createPrivateLoan(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount
    ) external whenNotPaused nonReentrant {
        _createPrivateLoan(collateralId, vestingContract, borrowAmount, 0);
    }

    function createPrivateLoanWithCollateralAmount(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount
    ) external whenNotPaused nonReentrant {
        _createPrivateLoan(collateralId, vestingContract, borrowAmount, collateralAmount);
    }

    function isPrivateLoan(uint256 loanId) external view returns (bool) {
        return privateLoans[loanId].vault != address(0);
    }

    function _createLoan(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount
    ) internal {
        require(borrowAmount > 0, "amount=0");

        adapter.escrow(collateralId, vestingContract, msg.sender);
        (uint256 quantity, address token, uint256 unlockTime) = adapter.getDetails(collateralId);
        require(quantity > 0, "quantity=0");
        uint256 pledgedQuantity = collateralAmount == 0 ? quantity : collateralAmount;
        require(pledgedQuantity <= quantity, "collateral>available");

        (uint256 pv, uint256 ltvBps) = valuation.computeDPV(pledgedQuantity, token, unlockTime);
        if (identityLinked[msg.sender] && identityBoostBps > 0) {
            ltvBps = ltvBps + identityBoostBps;
            if (ltvBps > BPS_DENOMINATOR) {
                ltvBps = BPS_DENOMINATOR;
            }
        }
        bool autoRepayEligible = autoRepayOptIn[msg.sender] && _hasAutoRepayPermissions(msg.sender);
        if (autoRepayEligible && autoRepayLtvBoostBps > 0) {
            ltvBps = ltvBps + autoRepayLtvBoostBps;
            if (ltvBps > BPS_DENOMINATOR) {
                ltvBps = BPS_DENOMINATOR;
            }
        }
        uint256 maxBorrow = (pv * ltvBps) / BPS_DENOMINATOR;
        require(borrowAmount <= maxBorrow, "exceeds LTV");

        uint256 interestRateBps = pool.getInterestRateBps();
        if (autoRepayEligible && autoRepayInterestDiscountBps > 0) {
            if (interestRateBps > autoRepayInterestDiscountBps) {
                interestRateBps = interestRateBps - autoRepayInterestDiscountBps;
            } else {
                interestRateBps = 0;
            }
        }
        uint256 interest = (borrowAmount * interestRateBps) / BPS_DENOMINATOR;
        uint256 originationFee = (borrowAmount * originationFeeBps) / BPS_DENOMINATOR;
        interest += originationFee;

        uint256 loanId = loanCount;
        loans[loanId] = Loan({
            borrower: msg.sender,
            principal: borrowAmount,
            interest: interest,
            collateralId: collateralId,
            collateralAmount: pledgedQuantity,
            unlockTime: unlockTime,
            active: true
        });
        loanCount += 1;

        pool.lend(msg.sender, borrowAmount);
        emit LoanCreated(loanId, msg.sender, borrowAmount);
    }

    function _createPrivateLoan(
        uint256 collateralId,
        address vestingContract,
        uint256 borrowAmount,
        uint256 collateralAmount
    ) internal {
        require(borrowAmount > 0, "amount=0");

        // Private-mode assumes the *vault* is the beneficiary/recipient (or wrapper) of the vesting.
        // That way, the user's primary wallet is not required to appear in loan state or events.
        adapter.escrow(collateralId, vestingContract, msg.sender);
        (uint256 quantity, address token, uint256 unlockTime) = adapter.getDetails(collateralId);
        require(quantity > 0, "quantity=0");
        uint256 pledgedQuantity = collateralAmount == 0 ? quantity : collateralAmount;
        require(pledgedQuantity <= quantity, "collateral>available");

        (uint256 pv, uint256 ltvBps) = valuation.computeDPV(pledgedQuantity, token, unlockTime);
        // Optional boosts are applied to the vault address (not to a user wallet).
        if (identityLinked[msg.sender] && identityBoostBps > 0) {
            ltvBps = ltvBps + identityBoostBps;
            if (ltvBps > BPS_DENOMINATOR) {
                ltvBps = BPS_DENOMINATOR;
            }
        }
        bool autoRepayEligible = autoRepayOptIn[msg.sender] && _hasAutoRepayPermissions(msg.sender);
        if (autoRepayEligible && autoRepayLtvBoostBps > 0) {
            ltvBps = ltvBps + autoRepayLtvBoostBps;
            if (ltvBps > BPS_DENOMINATOR) {
                ltvBps = BPS_DENOMINATOR;
            }
        }
        uint256 maxBorrow = (pv * ltvBps) / BPS_DENOMINATOR;
        require(borrowAmount <= maxBorrow, "exceeds LTV");

        uint256 interestRateBps = pool.getInterestRateBps();
        if (autoRepayEligible && autoRepayInterestDiscountBps > 0) {
            if (interestRateBps > autoRepayInterestDiscountBps) {
                interestRateBps = interestRateBps - autoRepayInterestDiscountBps;
            } else {
                interestRateBps = 0;
            }
        }
        uint256 interest = (borrowAmount * interestRateBps) / BPS_DENOMINATOR;
        uint256 originationFee = (borrowAmount * originationFeeBps) / BPS_DENOMINATOR;
        interest += originationFee;

        uint256 loanId = loanCount;
        privateLoans[loanId] = PrivateLoan({
            vault: msg.sender,
            principal: borrowAmount,
            interest: interest,
            collateralId: collateralId,
            collateralAmount: pledgedQuantity,
            unlockTime: unlockTime,
            active: true
        });
        loanCount += 1;

        pool.lend(msg.sender, borrowAmount);
        emit PrivateLoanCreated(loanId, msg.sender, borrowAmount);
    }

    function repayLoan(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(msg.sender == loan.borrower, "not borrower");
        require(loan.principal + loan.interest > 0, "paid");
        require(amount > 0, "amount=0");

        _repayUsdcFrom(loanId, msg.sender, amount);
    }

    function repayPrivateLoan(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        PrivateLoan storage loan = privateLoans[loanId];
        require(loan.active, "inactive");
        require(loan.principal + loan.interest > 0, "paid");
        require(amount > 0, "amount=0");

        _repayUsdcFromPrivate(loanId, msg.sender, amount);
    }

    function repayWithSwap(
        uint256 loanId,
        address tokenIn,
        uint256 amountIn,
        uint256 minUsdcOut
    ) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(msg.sender == loan.borrower, "not borrower");
        require(loan.principal + loan.interest > 0, "paid");
        require(amountIn > 0, "amount=0");
        require(tokenIn != address(0), "token=0");
        require(repayTokenPriority[tokenIn] > 0, "token not allowed");

        uint256 usdcReceived;
        if (tokenIn == address(usdc)) {
            usdc.safeTransferFrom(msg.sender, address(this), amountIn);
            usdcReceived = amountIn;
        } else {
            require(address(uniswapRouter) != address(0), "router=0");
            IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
            IERC20(tokenIn).forceApprove(address(uniswapRouter), amountIn);

            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
                .ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: address(usdc),
                    fee: poolFee,
                    recipient: address(this),
                    deadline: block.timestamp + 300,
                    amountIn: amountIn,
                    amountOutMinimum: minUsdcOut,
                    sqrtPriceLimitX96: 0
                });

            usdcReceived = uniswapRouter.exactInputSingle(params);
        }

        _applyUsdcToLoan(loanId, msg.sender, usdcReceived);
        emit LoanRepaidWithSwap(loanId, tokenIn, amountIn, usdcReceived);
    }

    function repayWithSwapBatch(
        uint256 loanId,
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata minUsdcOut
    ) external whenNotPaused nonReentrant {
        require(tokens.length == amounts.length, "length mismatch");
        require(tokens.length == minUsdcOut.length, "length mismatch");

        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(msg.sender == loan.borrower, "not borrower");
        require(loan.principal + loan.interest > 0, "paid");

        uint256 lastPriority = 0;
        for (uint256 i = 0; i < tokens.length; i++) {
            address tokenIn = tokens[i];
            uint256 amountIn = amounts[i];
            if (amountIn == 0) continue;

            uint256 priority = repayTokenPriority[tokenIn];
            require(priority > 0, "token not allowed");
            require(priority >= lastPriority, "priority order");
            lastPriority = priority;

            uint256 usdcReceived;
            if (tokenIn == address(usdc)) {
                usdc.safeTransferFrom(msg.sender, address(this), amountIn);
                usdcReceived = amountIn;
            } else {
                require(address(uniswapRouter) != address(0), "router=0");
                IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
                IERC20(tokenIn).forceApprove(address(uniswapRouter), amountIn);

                ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
                    .ExactInputSingleParams({
                        tokenIn: tokenIn,
                        tokenOut: address(usdc),
                        fee: poolFee,
                        recipient: address(this),
                        deadline: block.timestamp + 300,
                        amountIn: amountIn,
                        amountOutMinimum: minUsdcOut[i],
                        sqrtPriceLimitX96: 0
                    });

                usdcReceived = uniswapRouter.exactInputSingle(params);
            }

            _applyUsdcToLoan(loanId, msg.sender, usdcReceived);
            emit LoanRepaidWithSwap(loanId, tokenIn, amountIn, usdcReceived);

            if (!loan.active) {
                break;
            }
        }
    }

    // Keeper / third-party initiated repayments (borrower opt-in required)

    function repayLoanFor(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(autoRepayOptIn[loan.borrower], "auto repay disabled");
        require(loan.principal + loan.interest > 0, "paid");
        require(amount > 0, "amount=0");
        _repayUsdcFrom(loanId, loan.borrower, amount);
    }

    function repayWithSwapFor(
        uint256 loanId,
        address tokenIn,
        uint256 amountIn,
        uint256 minUsdcOut
    ) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(autoRepayOptIn[loan.borrower], "auto repay disabled");
        require(loan.principal + loan.interest > 0, "paid");
        require(amountIn > 0, "amount=0");
        require(tokenIn != address(0), "token=0");
        require(repayTokenPriority[tokenIn] > 0, "token not allowed");

        // Prevent malicious callers from forcing bad slippage for the borrower.
        if (tokenIn != address(usdc)) {
            uint256 minFloor = _minUsdcOut(tokenIn, amountIn);
            require(minUsdcOut >= minFloor, "minOut too low");
        }

        uint256 usdcReceived;
        if (tokenIn == address(usdc)) {
            usdc.safeTransferFrom(loan.borrower, address(this), amountIn);
            usdcReceived = amountIn;
        } else {
            require(address(uniswapRouter) != address(0), "router=0");
            IERC20(tokenIn).safeTransferFrom(loan.borrower, address(this), amountIn);
            IERC20(tokenIn).forceApprove(address(uniswapRouter), amountIn);

            ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
                .ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: address(usdc),
                    fee: poolFee,
                    recipient: address(this),
                    deadline: block.timestamp + 300,
                    amountIn: amountIn,
                    amountOutMinimum: minUsdcOut,
                    sqrtPriceLimitX96: 0
                });

            usdcReceived = uniswapRouter.exactInputSingle(params);
        }

        _applyUsdcToLoan(loanId, loan.borrower, usdcReceived);
        emit LoanRepaidWithSwap(loanId, tokenIn, amountIn, usdcReceived);
    }

    function repayWithSwapBatchFor(
        uint256 loanId,
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata minUsdcOut
    ) external whenNotPaused nonReentrant {
        require(tokens.length == amounts.length, "length mismatch");
        require(tokens.length == minUsdcOut.length, "length mismatch");

        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(autoRepayOptIn[loan.borrower], "auto repay disabled");
        require(loan.principal + loan.interest > 0, "paid");

        uint256 lastPriority = 0;
        for (uint256 i = 0; i < tokens.length; i++) {
            address tokenIn = tokens[i];
            uint256 amountIn = amounts[i];
            if (amountIn == 0) continue;

            uint256 priority = repayTokenPriority[tokenIn];
            require(priority > 0, "token not allowed");
            require(priority >= lastPriority, "priority order");
            lastPriority = priority;

            // Prevent malicious callers from forcing bad slippage for the borrower.
            if (tokenIn != address(usdc)) {
                uint256 minFloor = _minUsdcOut(tokenIn, amountIn);
                require(minUsdcOut[i] >= minFloor, "minOut too low");
            }

            uint256 usdcReceived;
            if (tokenIn == address(usdc)) {
                usdc.safeTransferFrom(loan.borrower, address(this), amountIn);
                usdcReceived = amountIn;
            } else {
                require(address(uniswapRouter) != address(0), "router=0");
                IERC20(tokenIn).safeTransferFrom(loan.borrower, address(this), amountIn);
                IERC20(tokenIn).forceApprove(address(uniswapRouter), amountIn);

                ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
                    .ExactInputSingleParams({
                        tokenIn: tokenIn,
                        tokenOut: address(usdc),
                        fee: poolFee,
                        recipient: address(this),
                        deadline: block.timestamp + 300,
                        amountIn: amountIn,
                        amountOutMinimum: minUsdcOut[i],
                        sqrtPriceLimitX96: 0
                    });

                usdcReceived = uniswapRouter.exactInputSingle(params);
            }

            _applyUsdcToLoan(loanId, loan.borrower, usdcReceived);
            emit LoanRepaidWithSwap(loanId, tokenIn, amountIn, usdcReceived);

            if (!loan.active) {
                break;
            }
        }
    }

    function setRepayTokenPriority(address[] calldata tokens) external onlyOwner {
        for (uint256 i = 0; i < repayTokens.length; i++) {
            repayTokenPriority[repayTokens[i]] = 0;
        }
        delete repayTokens;

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            require(token != address(0), "token=0");
            if (repayTokenPriority[token] == 0) {
                repayTokens.push(token);
                repayTokenPriority[token] = i + 1;
            }
        }
        emit RepayTokenPriorityUpdated(tokens);
    }

    function getRepayTokenPriority() external view returns (address[] memory) {
        return repayTokens;
    }

    function _repayUsdcFrom(uint256 loanId, address payer, uint256 amount) internal {
        require(payer != address(0), "payer=0");
        usdc.safeTransferFrom(payer, address(this), amount);
        _applyUsdcToLoan(loanId, payer, amount);
    }

    function _repayUsdcFromPrivate(uint256 loanId, address payer, uint256 amount) internal {
        require(payer != address(0), "payer=0");
        usdc.safeTransferFrom(payer, address(this), amount);
        _applyUsdcToPrivateLoan(loanId, payer, amount);
    }

    function _applyUsdcToLoan(uint256 loanId, address payer, uint256 usdcAmount) internal {
        if (usdcAmount == 0) {
            return;
        }

        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");

        uint256 remainingDebt = loan.principal + loan.interest;
        uint256 applied = usdcAmount > remainingDebt ? remainingDebt : usdcAmount;
        uint256 refund = usdcAmount > applied ? usdcAmount - applied : 0;

        address paymentTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
        if (applied > 0) {
            usdc.safeTransfer(paymentTreasury, applied);
            _applyRepayment(loanId, applied);
        }
        if (refund > 0) {
            usdc.safeTransfer(payer, refund);
        }
    }

    function _applyRepayment(uint256 loanId, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        uint256 poolDebt = pool.totalBorrowed();
        uint256 repayAmount = amount > poolDebt ? poolDebt : amount;
        if (repayAmount > 0) {
            pool.repay(repayAmount);
        }

        Loan storage loan = loans[loanId];
        uint256 remainingInterest = loan.interest;
        uint256 remainingPrincipal = loan.principal;

        if (amount >= remainingInterest) {
            loan.interest = 0;
            uint256 principalPaid = amount - remainingInterest;
            if (principalPaid >= remainingPrincipal) {
                loan.principal = 0;
            } else {
                loan.principal = remainingPrincipal - principalPaid;
            }
        } else {
            loan.interest = remainingInterest - amount;
        }

        emit LoanRepaid(loanId, amount);
    }

    function _applyUsdcToPrivateLoan(uint256 loanId, address payer, uint256 usdcAmount) internal {
        if (usdcAmount == 0) {
            return;
        }

        PrivateLoan storage loan = privateLoans[loanId];
        require(loan.active, "inactive");

        uint256 remainingDebt = loan.principal + loan.interest;
        uint256 applied = usdcAmount > remainingDebt ? remainingDebt : usdcAmount;
        uint256 refund = usdcAmount > applied ? usdcAmount - applied : 0;

        address paymentTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
        if (applied > 0) {
            usdc.safeTransfer(paymentTreasury, applied);
            _applyPrivateRepayment(loanId, applied);
        }
        if (refund > 0) {
            usdc.safeTransfer(payer, refund);
        }
    }

    function _applyPrivateRepayment(uint256 loanId, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        uint256 poolDebt = pool.totalBorrowed();
        uint256 repayAmount = amount > poolDebt ? poolDebt : amount;
        if (repayAmount > 0) {
            pool.repay(repayAmount);
        }

        PrivateLoan storage loan = privateLoans[loanId];
        uint256 remainingInterest = loan.interest;
        uint256 remainingPrincipal = loan.principal;

        if (amount >= remainingInterest) {
            loan.interest = 0;
            uint256 principalPaid = amount - remainingInterest;
            if (principalPaid >= remainingPrincipal) {
                loan.principal = 0;
            } else {
                loan.principal = remainingPrincipal - principalPaid;
            }
        } else {
            loan.interest = remainingInterest - amount;
        }

        emit PrivateLoanRepaid(loanId, amount);
    }

    function settleAtUnlock(uint256 loanId) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(block.timestamp >= loan.unlockTime, "not unlocked");

        uint256 remainingDebt = loan.principal + loan.interest;
        bool defaulted = remainingDebt > 0;
        (uint256 quantity, address token, ) = adapter.getDetails(loan.collateralId);
        uint256 collateralAvailable = quantity;
        if (collateralAvailable > loan.collateralAmount) {
            collateralAvailable = loan.collateralAmount;
        }

        address unlockTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
        if (!defaulted) {
            if (collateralAvailable > 0) {
                adapter.releaseTo(loan.collateralId, unlockTreasury, collateralAvailable);
            }
        } else if (collateralAvailable > 0) {
            uint256 seizeAmount = _calculateSeizeAmount(token, remainingDebt);
            if (seizeAmount > collateralAvailable) {
                seizeAmount = collateralAvailable;
            }

            if (seizeAmount > 0) {
                adapter.releaseTo(loan.collateralId, address(this), seizeAmount);
                uint256 usdcReceived = _liquidate(
                    loanId,
                    token,
                    seizeAmount
                );
                if (usdcReceived > 0) {
                    uint256 repayAmount = usdcReceived;
                    uint256 poolDebt = pool.totalBorrowed();
                    if (repayAmount > poolDebt) {
                        repayAmount = poolDebt;
                    }
                    address payout = returnsTreasury == address(0)
                        ? address(pool)
                        : returnsTreasury;
                    usdc.safeTransfer(payout, usdcReceived);
                    if (repayAmount > 0) {
                        pool.repay(repayAmount);
                    }
                }
            }

            if (collateralAvailable > seizeAmount) {
                adapter.releaseTo(
                    loan.collateralId,
                    unlockTreasury,
                    collateralAvailable - seizeAmount
                );
            }
        }

        loan.active = false;
        loan.principal = 0;
        loan.interest = 0;

        emit LoanSettled(loanId, defaulted);
    }

    function settlePrivateAtUnlock(uint256 loanId) external whenNotPaused nonReentrant {
        PrivateLoan storage loan = privateLoans[loanId];
        require(loan.active, "inactive");
        require(loan.vault != address(0), "vault=0");
        require(block.timestamp >= loan.unlockTime, "not unlocked");

        uint256 remainingDebt = loan.principal + loan.interest;
        bool defaulted = remainingDebt > 0;
        (uint256 quantity, address token, ) = adapter.getDetails(loan.collateralId);
        uint256 collateralAvailable = quantity;
        if (collateralAvailable > loan.collateralAmount) {
            collateralAvailable = loan.collateralAmount;
        }

        // Release collateral back to the vault (the onchain actor for private-mode loans).
        address unlockTreasury = loan.vault;
        if (!defaulted) {
            if (collateralAvailable > 0) {
                adapter.releaseTo(loan.collateralId, unlockTreasury, collateralAvailable);
            }
        } else if (collateralAvailable > 0) {
            uint256 seizeAmount = _calculateSeizeAmount(token, remainingDebt);
            if (seizeAmount > collateralAvailable) {
                seizeAmount = collateralAvailable;
            }

            if (seizeAmount > 0) {
                adapter.releaseTo(loan.collateralId, address(this), seizeAmount);
                uint256 usdcReceived = _liquidate(loanId, token, seizeAmount);
                if (usdcReceived > 0) {
                    uint256 repayAmount = usdcReceived;
                    uint256 poolDebt = pool.totalBorrowed();
                    if (repayAmount > poolDebt) {
                        repayAmount = poolDebt;
                    }
                    address payout = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
                    usdc.safeTransfer(payout, usdcReceived);
                    if (repayAmount > 0) {
                        pool.repay(repayAmount);
                    }
                }
            }

            if (collateralAvailable > seizeAmount) {
                adapter.releaseTo(
                    loan.collateralId,
                    unlockTreasury,
                    collateralAvailable - seizeAmount
                );
            }
        }

        loan.active = false;
        loan.principal = 0;
        loan.interest = 0;

        emit PrivateLoanSettled(loanId, defaulted);
    }

    function _liquidate(
        uint256 loanId,
        address token,
        uint256 seizeAmount
    ) internal returns (uint256 usdcReceived) {
        if (address(uniswapRouter) == address(0)) {
            return 0;
        }

        IERC20(token).forceApprove(address(uniswapRouter), seizeAmount);
        uint256 minOut = _minUsdcOut(token, seizeAmount);

        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: token,
                tokenOut: address(usdc),
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp + 300,
                amountIn: seizeAmount,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            });

        usdcReceived = uniswapRouter.exactInputSingle(params);
        emit CollateralLiquidated(loanId, token, seizeAmount, usdcReceived);
    }

    function _minUsdcOut(
        address token,
        uint256 amountIn
    ) internal view returns (uint256) {
        (uint256 price, uint8 priceDecimals) = _readValidatedOraclePrice(token);

        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint8 usdcDecimals = IERC20Metadata(address(usdc)).decimals();

        uint256 usdValue = Math.mulDiv(amountIn, price, 10 ** tokenDecimals);
        uint256 expectedUsdc = Math.mulDiv(usdValue, 10 ** usdcDecimals, 10 ** priceDecimals);
        return (expectedUsdc * liquidationSlippageBps) / BPS_DENOMINATOR;
    }

    function _calculateSeizeAmount(
        address token,
        uint256 debtUsdc
    ) internal view returns (uint256) {
        if (address(token) == address(usdc)) {
            return debtUsdc;
        }

        (uint256 price, uint8 priceDecimals) = _readValidatedOraclePrice(token);

        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint8 usdcDecimals = IERC20Metadata(address(usdc)).decimals();

        uint256 tokenAmountAtOne = Math.mulDiv(
            debtUsdc,
            10 ** tokenDecimals,
            10 ** usdcDecimals
        );
        return Math.mulDiv(tokenAmountAtOne, 10 ** priceDecimals, price);
    }

    function _readValidatedOraclePrice(
        address token
    ) internal view returns (uint256 price, uint8 decimals) {
        address feedAddress = valuation.getPriceFeedForToken(token);
        require(feedAddress != address(0), "feed=0");
        AggregatorV3Interface priceFeed = AggregatorV3Interface(feedAddress);
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();
        require(answer > 0, "bad price");
        require(answeredInRound >= roundId, "stale round");
        require(updatedAt > 0, "bad timestamp");
        require(block.timestamp >= updatedAt, "future round");
        require(block.timestamp - updatedAt <= valuation.maxPriceAge(), "stale price");
        return (uint256(answer), priceFeed.decimals());
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
