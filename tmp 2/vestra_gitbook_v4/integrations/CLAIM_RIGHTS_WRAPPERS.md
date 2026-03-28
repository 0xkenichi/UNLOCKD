# Claim-Rights Wrappers

Vestra uses a standardized wrapper system to interact with various vesting contracts.

## The Wrapper Interface
Every collateral asset must be "wrapped" or "adapted" to the Vestra standards.
1.  **Direct Stream Hooks**: For Sablier/Streamflow streams (Native support).
2.  **Vestra Wrapper NFT**: For custom vesting contracts. We wrap the ownership rights into a metadata-rich NFT that acts as the vault key.

## Admin-Access Audit
The protocol MUST verify that the underlying vesting contract does not have "Malicious Admin Access" (e.g., the ability for the deployer to cancel the stream at will).
- **Hardened Standard**: Only immutable or "DAO-governed" streams are eligible for Tier 1 LTV.
- **Revocable Streams**: Treated as Tier 3 (5-10% LTV) with mandatory OmegaWatcher monitoring.
