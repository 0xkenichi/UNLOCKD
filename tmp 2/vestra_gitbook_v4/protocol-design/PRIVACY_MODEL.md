# Privacy Model: ERC-5564 Stealth Flow

Vestra provides uncompromising financial privacy for borrowers via an opt-in stealth address system. This prevents the public link between a borrower's known identity (the owner of the vesting contract) and the liquidity payout.

## Implementation: ERC-5564
We leverage the **ERC-5564: Stealth Addresses** standard to ensure that every loan payout goes to a unique, non-linkable address.

### The Stealth Flow
1.  **Announcement**: The borrower provides their **Stealth Meta-Address** to the Vestra Command Center.
2.  **Relayer Computation**: The off-chain Relayer generates a new **Ephemeral Public Key** and derives a **One-Time Stealth Address**.
3.  **Loan Execution**: The `LoanManager` executes the withdrawal, sending the USDC to the derived address.
4.  **Privacy Tagging**: The Relayer calls the `Announcer.announce()` function, emitting the metadata needed for the borrower to "discover" their funds.
5.  **Claiming**: The borrower uses their private key to "view" and claim the funds from the stealth address.

## Cost Model
To ensure protocol sustainability, the privacy feature is **Opt-In**:
- **Standard Account**: Uses the borrower's primary wallet. Zero extra cost.
- **Sovereign Privacy Account**: User pays a nominal relayer fee (in GAS/ETH) to cover the stealth derivation and announcement event.

## Why Stealth Addresses?
Unlike Mixers (like Tornado Cash), Vestra's stealth flow does not "pool" assets. It simply breaks the direct graph link. This provides the highest level of privacy while maintaining a clean, compliant history of fund origins within the protocol.
