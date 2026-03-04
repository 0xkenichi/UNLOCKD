# Frictionless Account Abstraction Onboarding — Vestra Protocol

**Version:** V5.0  
**Status:** Implementation Guide  
**Audience:** Frontend Engineers, Product Team

---

## Overview

This document defines how Vestra will offer a **1-click, Web2-like onboarding experience** that invisibly deploys and manages ERC-4337 Smart Contract Wallets and generates zk-Identity attestations behind the scenes. The user should experience this as signing in with their face or fingerprint — nothing more.

---

## Architecture

### 1. Embedded Wallet Provider
Vestra will integrate with **[Privy](https://privy.io)** as the primary embedded wallet solution.

- When a new user connects their EOA (MetaMask, Coinbase Wallet, WalletConnect), Privy silently provisions an **ERC-4337 Smart Account** for them in the background.
- The user's EOA acts as the **initial owner/signer** of the Smart Account.
- The Smart Account address is derived deterministically from the EOA, so it is the same on every chain.

```
EOA (MetaMask) → Signs once → Privy creates Smart Account (ERC-4337)
```

### 2. Passkey-Based Signing (FaceID / TouchID)
Instead of requiring the user to approve 5+ wallet transactions for account setup and loan delegation, Vestra will use **WebAuthn Passkeys** as additional signers on the Smart Account.

- On first visit, the user is prompted: *"Enable 1-click signing with FaceID/TouchID?"*
- A Passkey is generated and registered as a **co-signer** on the ERC-4337 Smart Account.
- Subsequent interactions (loan origination, collateral delegation, guarantor lock acceptance) are signed with the Passkey — no MetaMask popup required.

```
User clicks "Create Loan" → FaceID prompt → Passkey signs ERC-4337 UserOp → Loan created
```

### 3. Silent Guarantor Lock
When a user takes a high-value or high-risk loan, the Vestra Protocol contract is temporarily added as a **co-signer / guardian** on the Smart Account.

- The delegation permission is bundled into the loan origination UserOperation.
- The user sees: *"Enabling Recourse Protection for this loan."* with a brief tooltip explanation.
- No separate transaction is required. It is atomic with the loan open.

```
Loan Origination UserOp:
  - Lock collateral in VestingAdapter
  - Grant Vestra GuardianModule permission on Smart Account
  - Set secondary asset allowance
```

### 4. 1-Click zk-Identity Attestation
The Gitcoin Passport and social zk-proofs are generated via an **in-app OAuth popup flow**:

1. User clicks *"Verify Identity"* on the Borrow page or Identity page.
2. A modal appears: *"Connect your accounts to unlock better rates."*
3. For each provider (X/Twitter, Gmail, Humanity Protocol, etc.):
   - The user clicks *"Connect X"* → OAuth popup opens.
   - The popup uses **TLSNotary / Reclaim Protocol** to generate a ZK proof in the browser that the user owns the account, without transmitting any private data.
   - On success the modal shows a green checkmark: *"X account verified ✓"*
4. The Gitcoin Passport Score and stamps are fetched from the user's linked wallet using the Gitcoin Passport API.
5. The composite Identity Score (IAS) is computed backend-side and stored as an attestation NFT on the user's Smart Account.

```
Click "Verify Identity" → OAuth popup → ZK proof generated client-side → Stamp recorded → IAS updated
```

---

## UI/UX Rules

| Rule | Requirement |
|------|-------------|
| Smart Account creation | **Invisible** — no modal, no gas prompt, no mention unless user asks |
| Passkey registration | **One prompt only**, on first loan or identity verification |
| Guarantor Lock | **One informational tooltip** during loan creation flow; never a separate step |
| zk-Attestation | **Popup-based OAuth flow** — no extensions, no CLi, no manual copying of proofs |
| Failure handling | All fallbacks (MetaMask signing, manual verification) available but secondary |

---

## Technical Notes

### Required Packages
```json
{
  "@privy-io/react-auth": "^1.x",
  "@webauthn-works/browser-sdk": "latest",
  "reclaim-protocol-sdk": "latest",
  "@gitcoin/passport-sdk-reader": "latest"
}
```

### ERC-4337 Bundler
Use **Alchemy's AA SDK** (`@alchemy/aa-core`) or **Pimlico's permissionless.js** as the bundler/paymaster backend.

### Paymaster (Gasless Onboarding)
The protocol should sponsor gas for the first Smart Account deployment and the first identity attestation transaction via an **ERC-4337 Paymaster**. This eliminates the "I need ETH first" cold-start problem for new users.

---

## Rollout Plan

| Phase | Scope |
|-------|-------|
| Phase 1 (Testnet) | Privy integration, Smart Account deployment, basic Passkey signing |
| Phase 2 (Testnet+) | zk-Attestation OAuth flow, Gitcoin Passport API integration |
| Phase 3 (Mainnet) | Gasless onboarding via Paymaster, Guarantor Lock atomic bundling |
| Phase 4 (Mainnet+) | Full Tier 3 Proof-of-Life KYC portal (Sumsub / Jumio integrations) |
