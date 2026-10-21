// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./governance/VestraAccessControl.sol";

/**
 * @title VestraMultisigRelayer
 * @notice Light-weight 2-of-3 multisig specifically for oracle and risk updates.
 * Required to close Gap 5 (Single-EOA Relayer compromise risk).
 */
contract VestraMultisigRelayer is VestraAccessControl, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    address[] public signers;
    uint256 public constant THRESHOLD = 2;
    mapping(bytes32 => bool) public executed;

    event TransactionExecuted(address indexed target, bytes data, uint256 nonce);

    constructor(address[] memory _signers, address _initialGovernor) VestraAccessControl(_initialGovernor) {
        require(_signers.length == 3, "must have 3 signers");
        signers = _signers;
    }

    /**
     * @notice Checks if an address is an authorized signer.
     */
    function isSigner(address account) public view returns (bool) {
        for (uint i = 0; i < signers.length; i++) {
            if (signers[i] == account) return true;
        }
        return false;
    }

    /**
     * @notice Executes a transaction on the target (e.g., ValuationEngine) if 2/3 signatures are provided.
     * @param target The address to call.
     * @param data The calldata to execute.
     * @param nonce A unique identifier per transaction to prevent replays.
     * @param signatures An array of exactly 2 ECDSA signatures.
     */
    function execute(
        address target,
        bytes calldata data,
        uint256 nonce,
        bytes[] calldata signatures
    ) external nonReentrant {
        require(signatures.length == THRESHOLD, "need exactly 2 signatures");
        
        bytes32 txHash = keccak256(abi.encode(target, data, nonce, block.chainid));
        require(!executed[txHash], "transaction already executed");
        executed[txHash] = true;

        address lastSigner = address(0);
        for (uint i = 0; i < THRESHOLD; i++) {
            address signer = txHash.toEthSignedMessageHash().recover(signatures[i]);
            require(isSigner(signer), "invalid signer");
            require(signer > lastSigner, "duplicate or unordered signers");
            lastSigner = signer;
        }

        (bool success, ) = target.call(data);
        require(success, "execution failed");

        emit TransactionExecuted(target, data, nonce);
    }
}
