# Privacy Model

This document defines the privacy goals, threat assumptions, and mitigations for early exits (loans or auctions) against time-locked claims. Privacy is opt-in and does not weaken settlement or collateral enforcement.

## Goals
- Hide participant identity (borrower or seller) from casual observers.
- Reduce social pressure and coordination attacks around early exits.
- Preserve on-chain enforceability of escrow and settlement.
- Provide policy-driven privacy levels per pool.

## Non-Goals
- Hiding the existence of claim rights or settlements from the chain.
- Bypassing pool governance, compliance requirements, or risk controls.
- Defeating global chain analytics or state-level adversaries.

## Adversary Model
- **Community observers**: monitor addresses to identify early exit behavior.
- **Coordinated actors**: attempt social pressure or retaliation based on activity.
- **Searchers/MEV**: extract intent from mempool and bid data.
- **Analysts**: link actions via metadata, timing, and transfer flows.

## Privacy Modes
- **Public**: direct on-chain interaction. Lowest cost, highest transparency.
- **Pseudonymous**: borrower uses fresh addresses and minimal linkage.
- **Shielded (relayed)**: interactions routed through privacy relayers to reduce linkability.
- **Verified-private**: optional identity proofs provide eligibility without identity disclosure.

## Lender Disclosure Policy (Portfolio-light)

The lender experience is designed to be **portfolio-light** by default:

- Lenders should not be asked to reason about individual borrowers or tokens.
- Lenders should not be able to trivially correlate user activity with on-chain positions via the app UI/API.

### Allowed on lender surfaces
- Aggregate totals (e.g. total deposits, total borrowed, utilization, current rate input).
- Coarse exposure buckets (e.g. by chain, maturity window counts, flagged-vs-unflagged exposure totals).

### Forbidden on lender surfaces
- Borrower addresses, vault addresses, or vesting contract addresses.
- Underlying token identifiers for specific loans (token address / symbol per loan).
- Loan IDs or transaction hashes in public activity feeds.

Implementation note: this does not change the fact that on-chain state is public; it prevents the app from becoming a correlation oracle.

## Core Mechanisms
- **Selective disclosure proofs**: attest to vesting schedule, unlock time, and claim validity without revealing identity.
- **Relayed execution**: relayers submit escrow, borrow, or settlement transactions.
- **Sealed-bid auctions**: commit/reveal prevents social signaling and collusion.
- **Policy controls**: pool-level toggles for allowed privacy modes and required disclosures.

## Threats and Mitigations
- **Address linkage**:
  - Mitigation: relayed execution, fresh addresses, and minimized direct transfers.
- **Timing correlation**:
  - Mitigation: batched relays, randomized delays, and optional settlement windows.
- **Bid leakage in auctions**:
  - Mitigation: sealed-bid commit/reveal and delayed reveal windows.
- **Mempool surveillance**:
  - Mitigation: relayers can use private transaction channels.
- **Inference from repayments**:
  - Mitigation: allow third-party repayments or relayed repayments.

## Residual Risks
- On-chain events are public; sophisticated analysts may infer activity.
- Metadata leakage (timing, gas patterns) cannot be fully eliminated.
- Privacy features may reduce liquidity or increase pricing due to risk.

## Pool Policy and Compliance
- Governance can require limited disclosures for certain assets.
- Pools can restrict privacy to verified members or enable public-only access.
- Compliance disclosures can be enforced via allowlists or proof requirements.

## Implementation Notes
- Privacy features are modular and opt-in per pool.
- Proof systems can be swapped without altering settlement logic.
- All privacy modes retain the same enforcement at unlock.
- **Backend and CRDT AI**: For “no one should know when or which token holders use the platform,” APIs and the AI must not expose addresses or per-user activity. See **`docs/CRDT_AI_KNOWLEDGE_AND_PRIVACY.md`** for aggregate-only platform stats, AI context rules, and activity-feed privacy.

## Concrete Stack (Recommended)
This stack balances feasibility with strong privacy for early exits while preserving auditability.

### Identity and Eligibility
- **Semaphore or similar group membership proofs**: prove membership without revealing identity.
- **Credential sources**: DAO-issued attestations or allowlists; stored off-chain, verified on-chain.
- **Proof inputs**: claim schedule, unlock time bounds, and adapter validity hash.

### Selective Disclosure
- **ZK proofs**: verify eligibility and claim validity without exposing the participant.
- **Proof policy**: per-pool requirements for which facts must be proven.

### Transaction Privacy
- **Relayer network**: submit escrow/borrow/repay/settle on behalf of users.
- **Private RPC**: optional private transaction channels to reduce mempool leakage.
- **Batched execution**: relayer batching to reduce timing correlation.

### Auction Privacy
- **Commit/reveal**: sealed-bid auctions with blinded bid commitments.
- **Reveal windows**: fixed windows to reduce signaling and MEV extraction.

### Compliance Modes
- **Public pools**: no identity requirements, lowest cost.
- **Verified pools**: require proof of eligibility without identity disclosure.
- **Restricted pools**: require limited disclosures or allowlists.

## Proof System Notes
- Use succinct proof systems to minimize gas and verification cost.
- Proofs should be reusable across pools when policy-compatible.
- Avoid embedding personal data on-chain; use hash commitments instead.

## Implementation Plan (Phased)
- **Phase 0: Baseline privacy**
  - Pseudonymous addresses and minimal linkage guidance.
  - Sealed-bid auctions with commit/reveal.
- **Phase 1: Eligibility proofs**
  - Semaphore-style membership proofs for verified pools.
  - Selective disclosure of claim validity and unlock time bounds.
- **Phase 2: Relayer privacy**
  - Relayer network for escrow/borrow/repay/settle.
  - Private transaction channels for mempool protection.
- **Phase 3: Operational hardening**
  - Monitoring, incident response, and privacy regression tests.
  - External security review of proof verification and relayer logic.

## Milestones (Targeted)
- **M0 (0-1 month)**: baseline privacy and sealed-bid auction privacy shipped.
- **M1 (1-3 months)**: eligibility proofs in verified pools and proof policy config.
- **M2 (3-6 months)**: relayer network with batching and private RPC support.
- **M3 (6-9 months)**: full operational hardening, audits, and monitoring.

## Acceptance Criteria
- Users can exit early without revealing identity by default.
- Settlement remains deterministic and enforceable at unlock.
- Pools can enforce policy without accessing personal data.
- Privacy features do not reduce lender safety guarantees.

## Risks and Mitigations
- **Relayer trust**: use multiple relayers and signed requests.
- **Proof cost**: use succinct proofs and batch verification.
- **Metadata leakage**: batch relays and optional timing randomization.
