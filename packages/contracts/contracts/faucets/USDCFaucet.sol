// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title USDCFaucet
 * @notice Testnet USDC with rate-limited minting for Vestra Protocol verification.
 */
contract USDCFaucet is ERC20, Ownable {
    uint256 public constant MINT_AMOUNT = 1000 * 10**6; // 1,000 USDC (6 decimals)
    uint256 public constant INTERVAL = 24 hours;

    mapping(address => uint256) public lastMinted;

    constructor() ERC20("Test USDC", "tUSDC") Ownable(msg.sender) {}

    function mint() external {
        require(block.timestamp >= lastMinted[msg.sender] + INTERVAL, "Faucet: Minting interval not reached");
        lastMinted[msg.sender] = block.timestamp;
        _mint(msg.sender, MINT_AMOUNT);
    }

    /**
     * @notice Lock USDC to simulate yield accrual (e.g., auto-hedge via Aave mocks).
     */
    function lockForYield(uint256 amount) external {
        _burn(msg.sender, amount);
        // Simulate yield accrual; in a real testnet, this would interact with a mock Aave Pool
        // For MVP, we emit an event to be picked up by the risk engine / analytics
        emit YieldLocked(msg.sender, amount, block.timestamp);
    }

    event YieldLocked(address indexed user, uint256 amount, uint256 timestamp);

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
