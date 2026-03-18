// SPDX-License-Identifier: BSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./VestingRegistry.sol";
import "./faucets/USDCFaucet.sol"; // Using USDCFaucet as a mock token for testnet vesting

contract VestingFactory is Ownable {
    VestingRegistry public registry;
    address public rewardToken;

    event VestingContractCreated(address indexed contractAddress, address indexed recipient, uint256 amount);

    constructor(address _registry, address _rewardToken) Ownable(msg.sender) {
        registry = VestingRegistry(_registry);
        rewardToken = _rewardToken;
    }

    /**
     * @notice Create a new vesting contract and automatically submit it to the registry.
     */
    function createVesting(address recipient, uint256 amount, uint256 durationMonths) external returns (address) {
        // In a real implementation, this would deploy a clone of a Sablier/OZ Vesting contract
        // For MVP, we use a specialized mock that implements the VestingAdapter interface
        
        // Mock deployment logic
        address mockVesting = address(uint160(uint256(keccak256(abi.encodePacked(recipient, amount, block.timestamp)))));
        
        // Auto-vet for testnet speed (only if it's our factory)
        registry.vetContract(mockVesting, 3); // Rank 3 - Standard
        
        emit VestingContractCreated(mockVesting, recipient, amount);
        return mockVesting;
    }
}
