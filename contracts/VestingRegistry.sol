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
    
    // V6.0 Citadel: Strict EVM Bytecode Verification
    // Prevent malicious Sablier/Superfluid clones by strictly checking the runtime bytecode hash
    mapping(bytes32 => bool) public verifiedBytecodeHashes;
    
    event ContractSubmitted(address indexed wrapper, address indexed submitter);
    event ContractRanked(address indexed wrapper, uint8 rank);
    event BytecodeHashVerified(bytes32 indexed bytecodeHash, bool status);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice V6.0 Citadel - Admin explicitly whitelists valid factory/wrapper runtime bytecode hashes
     */
    function setVerifiedBytecode(bytes32 bytecodeHash, bool status) external onlyOwner {
        verifiedBytecodeHashes[bytecodeHash] = status;
        emit BytecodeHashVerified(bytecodeHash, status);
    }

    /**
     * @notice Allows any user to submit a vesting wrapper for vetting, IF the bytecode matches.
     */
    function submitContract(address wrapper) external {
        require(wrapper != address(0), "wrapper=0");
        require(wrapper.code.length > 0, "not a contract");
        require(!isSubmitted[wrapper], "already submitted");
        
        // V6.0 Citadel: Prevent impersonator contracts
        bytes32 codeHash = _getRuntimeBytecodeHash(wrapper);
        require(verifiedBytecodeHashes[codeHash], "unverified bytecode hash");
        
        isSubmitted[wrapper] = true;
        emit ContractSubmitted(wrapper, msg.sender);
    }

    function _getRuntimeBytecodeHash(address _addr) internal view returns (bytes32 codeHash) {
        assembly {
            codeHash := extcodehash(_addr)
        }
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
