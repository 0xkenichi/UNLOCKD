// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Mock verifier that simulates Semaphore-style proof checks.
/// This is intentionally permissive for testnets and demos.
contract IdentityVerifierMock {
    mapping(address => bool) public verified;

    event ProofSubmitted(address indexed user, bytes proof);

    function verifyProof(address user, bytes calldata proof) external returns (bool) {
        // Mock rule: any non-empty proof marks the user verified.
        if (proof.length == 0) {
            return false;
        }
        verified[user] = true;
        emit ProofSubmitted(user, proof);
        return true;
    }

    function isVerified(address user) external view returns (bool) {
        return verified[user];
    }
}

