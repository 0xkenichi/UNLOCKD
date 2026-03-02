// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VestingRegistry
 * @notice Handles the vetting and ranking of vesting contracts/wrappers to be used as collateral.
 * Rank 0: Unverified/Blacklisted
 * Rank 1: Flagship (Best LTV, lowest discount)
 * Rank 2: Premium
 * Rank 3: Standard
 */
contract VestingRegistry is Ownable {
    
    mapping(address => uint8) public ranks;
    mapping(address => bool) public isSubmitted;
    
    event ContractSubmitted(address indexed wrapper, address indexed submitter);
    event ContractRanked(address indexed wrapper, uint8 rank);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Allows any user to submit a vesting wrapper for vetting.
     */
    function submitContract(address wrapper) external {
        require(wrapper != address(0), "wrapper=0");
        require(wrapper.code.length > 0, "not a contract");
        require(!isSubmitted[wrapper], "already submitted");
        
        isSubmitted[wrapper] = true;
        emit ContractSubmitted(wrapper, msg.sender);
    }

    /**
     * @notice Admin function to vet and assign a rank to a contract.
     * @param wrapper The vesting wrapper address.
     * @param rank The assigned rank (1=Flagship, 2=Premium, 3=Standard, 0=Revoke).
     */
    function vetContract(address wrapper, uint8 rank) external onlyOwner {
        require(wrapper != address(0), "wrapper=0");
        require(rank <= 3, "invalid rank");
        
        ranks[wrapper] = rank;
        emit ContractRanked(wrapper, rank);
    }

    /**
     * @notice Returns the rank of a vesting wrapper.
     */
    function getRank(address wrapper) external view returns (uint8) {
        return ranks[wrapper];
    }
}
