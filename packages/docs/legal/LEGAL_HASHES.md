# Sovereign NFT Legal Documentation

This document stores the verified SHA-256 hashes for the protocol's legal agreements. These hashes are used in the `legalTermsHash` field of `LoanNFT` (Sovereign NFT) to provide immutable proof of the terms accepted during loan origination.

## Vestra UNA Constitution
- **File**: `VESTRA_UNA_CONSTITUTION.md`
- **Version**: 1.0
- **SHA-256 Hash**: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` 
*(Note: Replace with actual hash after final review)*

## Terms of Service
- **File**: `TERMS_OF_SERVICE_FRAMEWORK.md`
- **Version**: 1.0
- **SHA-256 Hash**: `Pending finalization`

## Instructions for Verification
To verify a Sovereign NFT's legal terms:
1. Retrieve the `legalTermsHash` from the NFT metadata on-chain.
2. Calculate the SHA-256 hash of the corresponding legal document in this repository.
3. Compare the hashes. They must match exactly.
