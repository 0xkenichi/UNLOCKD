// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract LendingPool is ReentrancyGuard, Ownable, Pausable {
    IERC20 public usdc;
    address public loanManager;

    mapping(address => uint256) public deposits;
    uint256 public totalDeposits;
    uint256 public totalBorrowed;

    uint256 public constant BPS_DENOMINATOR = 10000;

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    modifier onlyLoanManager() {
        require(msg.sender == loanManager, "not loan manager");
        _;
    }

    function setLoanManager(address manager) external onlyOwner {
        require(manager != address(0), "manager=0");
        loanManager = manager;
    }

    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "amount=0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "transfer failed");
        deposits[msg.sender] += amount;
        totalDeposits += amount;
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "amount=0");
        require(deposits[msg.sender] >= amount, "insufficient deposit");
        require(availableLiquidity() >= amount, "insufficient liquidity");
        deposits[msg.sender] -= amount;
        totalDeposits -= amount;
        require(usdc.transfer(msg.sender, amount), "transfer failed");
    }

    function lend(address to, uint256 amount) external nonReentrant onlyLoanManager whenNotPaused {
        require(amount > 0, "amount=0");
        require(availableLiquidity() >= amount, "insufficient liquidity");
        totalBorrowed += amount;
        require(usdc.transfer(to, amount), "transfer failed");
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
        return utilizationRateBps() > 5000 ? 1000 : 500; // 10% or 5%
    }

    function availableLiquidity() public view returns (uint256) {
        return totalDeposits - totalBorrowed;
    }
}
