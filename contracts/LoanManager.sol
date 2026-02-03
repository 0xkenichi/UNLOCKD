// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
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

    uint256 public constant BPS_DENOMINATOR = 10000;

    struct Loan {
        address borrower;
        uint256 principal;
        uint256 interest;
        uint256 collateralId;
        uint256 unlockTime;
        bool active;
    }

    mapping(uint256 => Loan) public loans;
    uint256 public loanCount;
    mapping(address => bool) public identityLinked;

    event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 amount);
    event LoanRepaid(uint256 indexed loanId, uint256 amount);
    event LoanSettled(uint256 indexed loanId, bool defaulted);
    event IdentityLinked(address indexed borrower, uint256 boostBps);
    event IdentityConfigUpdated(address verifier, uint256 boostBps);
    event LiquidationConfigUpdated(address router, uint24 poolFee, uint256 slippageBps);
    event TreasuryConfigUpdated(address issuanceTreasury, address returnsTreasury);
    event CollateralLiquidated(
        uint256 indexed loanId,
        address indexed token,
        uint256 seizedAmount,
        uint256 usdcReceived
    );

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
        require(router != address(0), "router=0");
        require(slippageBps > 0 && slippageBps <= BPS_DENOMINATOR, "bad slippage");
        uniswapRouter = ISwapRouter(router);
        poolFee = newPoolFee;
        liquidationSlippageBps = slippageBps;
        emit LiquidationConfigUpdated(router, newPoolFee, slippageBps);
    }

    function setTreasuries(address issuance, address returnsAddr) external onlyOwner {
        require(issuance != address(0), "issuance=0");
        require(returnsAddr != address(0), "returns=0");
        issuanceTreasury = issuance;
        returnsTreasury = returnsAddr;
        emit TreasuryConfigUpdated(issuance, returnsAddr);
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
        require(borrowAmount > 0, "amount=0");

        adapter.escrow(collateralId, vestingContract, msg.sender);
        (uint256 quantity, address token, uint256 unlockTime) = adapter.getDetails(collateralId);

        (uint256 pv, uint256 ltvBps) = valuation.computeDPV(quantity, token, unlockTime);
        if (identityLinked[msg.sender] && identityBoostBps > 0) {
            ltvBps = ltvBps + identityBoostBps;
            if (ltvBps > BPS_DENOMINATOR) {
                ltvBps = BPS_DENOMINATOR;
            }
        }
        uint256 maxBorrow = (pv * ltvBps) / BPS_DENOMINATOR;
        require(borrowAmount <= maxBorrow, "exceeds LTV");

        uint256 interestRateBps = pool.getInterestRateBps();
        uint256 interest = (borrowAmount * interestRateBps) / 10000;

        uint256 loanId = loanCount;
        loans[loanId] = Loan({
            borrower: msg.sender,
            principal: borrowAmount,
            interest: interest,
            collateralId: collateralId,
            unlockTime: unlockTime,
            active: true
        });
        loanCount += 1;

        pool.lend(msg.sender, borrowAmount);
        emit LoanCreated(loanId, msg.sender, borrowAmount);
    }

    function repayLoan(uint256 loanId, uint256 amount) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(msg.sender == loan.borrower, "not borrower");
        require(amount > 0, "amount=0");

        address paymentTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
        require(usdc.transferFrom(msg.sender, paymentTreasury, amount), "transfer failed");
        pool.repay(amount);

        uint256 remainingInterest = loan.interest;
        uint256 remainingPrincipal = loan.principal;

        if (amount >= remainingInterest) {
            loan.interest = 0;
            uint256 principalPaid = amount - remainingInterest;
            if (principalPaid >= remainingPrincipal) {
                loan.principal = 0;
                loan.active = false;
            } else {
                loan.principal = remainingPrincipal - principalPaid;
            }
        } else {
            loan.interest = remainingInterest - amount;
        }

        emit LoanRepaid(loanId, amount);
    }

    function settleAtUnlock(uint256 loanId) external whenNotPaused nonReentrant {
        Loan storage loan = loans[loanId];
        require(loan.active, "inactive");
        require(block.timestamp >= loan.unlockTime, "not unlocked");

        uint256 remainingDebt = loan.principal + loan.interest;
        bool defaulted = remainingDebt > 0;
        (uint256 quantity, address token, ) = adapter.getDetails(loan.collateralId);

        address unlockTreasury = returnsTreasury == address(0) ? address(pool) : returnsTreasury;
        if (!defaulted) {
            if (quantity > 0) {
                adapter.releaseTo(loan.collateralId, unlockTreasury, quantity);
            }
        } else if (quantity > 0) {
            uint256 seizeAmount = _calculateSeizeAmount(token, remainingDebt);
            if (seizeAmount > quantity) {
                seizeAmount = quantity;
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
                    require(usdc.transfer(payout, usdcReceived), "usdc transfer failed");
                    if (repayAmount > 0) {
                        pool.repay(repayAmount);
                    }
                }
            }

            if (quantity > seizeAmount) {
                adapter.releaseTo(
                    loan.collateralId,
                    unlockTreasury,
                    quantity - seizeAmount
                );
            }
        }

        loan.active = false;
        loan.principal = 0;
        loan.interest = 0;

        emit LoanSettled(loanId, defaulted);
    }

    function _liquidate(
        uint256 loanId,
        address token,
        uint256 seizeAmount
    ) internal returns (uint256 usdcReceived) {
        if (address(uniswapRouter) == address(0)) {
            return 0;
        }

        IERC20(token).approve(address(uniswapRouter), seizeAmount);
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
        AggregatorV3Interface priceFeed = valuation.priceFeed();
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        require(answer > 0, "bad price");
        uint256 price = uint256(answer);

        uint8 priceDecimals = priceFeed.decimals();
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

        AggregatorV3Interface priceFeed = valuation.priceFeed();
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        require(answer > 0, "bad price");
        uint256 price = uint256(answer);

        uint8 priceDecimals = priceFeed.decimals();
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        uint8 usdcDecimals = IERC20Metadata(address(usdc)).decimals();

        uint256 tokenAmountAtOne = Math.mulDiv(
            debtUsdc,
            10 ** tokenDecimals,
            10 ** usdcDecimals
        );
        return Math.mulDiv(tokenAmountAtOne, 10 ** priceDecimals, price);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
