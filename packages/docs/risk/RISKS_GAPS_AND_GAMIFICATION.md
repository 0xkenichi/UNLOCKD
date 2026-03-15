# Vestra Protocol: Risks, Gaps, and Gamification / Cheating Vectors

**Purpose:** Catalog of protocol and operational risks, documentation/design gaps, and ways actors can gamify or cheat the system. Use for risk committee review, audit scoping, and mitigation planning.

**Last updated:** 2026-02-14

---

## 1. Protocol and Smart Contract Risks

### 1.1 Oracle and Valuation

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Stale or manipulated price** | ValuationEngine uses Chainlink (and token-specific feeds). Staleness is bounded by `maxPriceAge` (e.g. 1 hour). If a feed is delayed or manipulated, DPV and max borrow can be wrong. | Flash-loan or coordinated pump before borrow to inflate PV; borrow at inflated LTV; price reverts leaving undercollateralized position at unlock. |
| **No volatility feed** | Volatility is a fixed governance parameter per engine, not a live feed. | Borrow when vol is low; if vol spikes before unlock, collateral value can drop and default becomes rational for borrower (walk away). |
| **Token without dedicated feed** | Fallback to default price feed; wrong asset price can be used. | List unknown token; get valuation from wrong feed; borrow against “overvalued” collateral. |
| **Unlock supply shock not on-chain** | Litepaper/RISK_MODELS mention 10–30% extra discount when >5% supply unlocks at once; not clearly enforced on-chain. | Borrow against large unlock; at unlock, price dumps and protocol seizes tokens at much lower value than debt. |

**Gaps:** No circuit breaker for extreme price deviation; no explicit “unlock impact” parameter in ValuationEngine; volatility is static.

### 1.2 Collateral and Adapters

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Fake or non-standard vesting** | VestingAdapter trusts `vestingContract` to report `totalAmount`, `unlockTime`, `released()`. Malformed or custom contracts can lie. | Deploy vesting that reports high quantity and far unlock; escrow; get loan; never have real tokens at unlock → default with no recoverable value. |
| **Whitelist off by default** | `useWhitelist` is false by default; any contract implementing the interface can be escrowed (CLAIM_RIGHTS_WRAPPERS.md). | Point adapter at a malicious “vesting” contract that always reports max amount and future unlock; drain pool. |
| **Wrapper as beneficiary** | For OZ/Superfluid/Timelock, wrapper is beneficiary. If wrapper or operator logic is wrong, release can go to wrong party. | Exploit bug in wrapper `releaseTo` or operator approval (e.g. Sablier) to route tokens away from protocol at unlock. |
| **Sablier operator revocation** | Recipient can revoke wrapper’s operator approval before unlock. | Escrow Sablier stream, get loan, revoke operator; at unlock protocol cannot call `withdraw` → settlement fails or tokens go to borrower. |

**Gaps:** No on-chain verification that vesting contract is a known implementation (e.g. bytecode hash); Sablier path depends on operator not being revoked; no explicit “collateral audit” checklist for new vesting types.

### 1.3 Loans and Settlement

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Settlement is permissionless** | Anyone can call `settleAtUnlock(loanId)` once `block.timestamp >= unlockTime`. Borrower has no exclusive right to settle. | Keeper/MEV bot always settles; no “last-minute repay” race for borrower (UX/correlation risk, not theft). Front-run repayment tx with settlement to force default. |
| **Interest accrual model** | Interest is stored and updated; if there’s rounding or time manipulation, debt could be understated. | (Lower likelihood) Time-dependent logic could be gamed if block timestamps are used in a manipulatable way. |
| **Liquidation via DEX** | On default, protocol seizes tokens and swaps via Uniswap with `_minUsdcOut`. Slippage and illiquid markets can yield far less than debt. | Borrow against illiquid token; at unlock don’t repay; protocol sells into thin market; pool takes loss; borrower may have extracted more than “fair” value. |
| **No early liquidation** | Protocol cannot liquidate before unlock. If token goes to near zero before unlock, collateral is worthless but debt still accrues. | Borrow at max LTV; token crashes; borrower has no incentive to repay; at unlock protocol gets worthless tokens. |

**Gaps:** No formal invariant tests for “debt never exceeds collateral value at issuance” under oracle failure; slippage/minOut policy not fully specified per pool in docs.

### 1.4 Auctions

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Sealed-bid commitment** | Commitment is `keccak256(auctionId, bidAmount, nonce)`. If nonce is predictable or reused, bids can be revealed by others or correlated. | Weak nonce → front-run reveal or infer bid; last-second reveal to minimize information to others. |
| **Reserve and timing** | Dutch auction: first bid at or above current price wins. English: highest bid wins. Reserve (endPrice) set at creation. | Collusion: seller and bidder agree off-chain; bidder wins at reserve; seller gets liquidity, bidder gets claim at discount. |
| **No bidder identity policy** | Auctions don’t enforce identity/allowlist on bidders. | Sybil bidders to create fake competition or to bid from multiple wallets and withdraw one winning bid. |
| **Claim after auction** | Winner must call `claim()` after unlock. If winner never claims, tokens remain in adapter; protocol doesn’t auto-sweep. | Griefing: winner doesn’t claim; seller already got paid; claim rights stuck until someone claims (operational ambiguity). |

**Gaps:** No documented policy for unclaimed auction collateral; no explicit anti-collusion or identity requirements for auctions in PRIVACY_MODEL.

### 1.5 Governance and Access

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Owner / admin centralization** | ValuationEngine, VestingAdapter, LoanManager, LendingPool, etc. have owner or authorized-caller controls. Timelock is optional. | Compromised owner or admin key → change oracle, add malicious adapter, pause and extract, or set extreme LTV. |
| **Timelock bypass** | When `adminTimelockEnabled` is false, some contracts allow immediate config changes (e.g. setPriceFeed, setTokenPriceFeed). | Owner turns off timelock and swaps to malicious price feed in one tx. |
| **Multisig not enforced** | SECURITY_AUDIT_CLOSEOUT recommends multisig; not mandated in code or deployment docs. | Single key compromise → full protocol control. |

**Gaps:** No on-chain “security checklist” (e.g. timelock always on for mainnet); multisig and key rotation not in CONTRACTS or DEPLOYMENT.

---

## 2. Adverse Selection and Vesting Discovery

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Vesting not on-chain** | Many VCs and insiders use OTC or off-chain vesting; you won’t see all vested supply on Sablier or similar. On-chain vesting can understate true exit risk. | We see “10% vesting on-chain” but large OTC programs exist; at unlock or exit, price impact is worse than our model. |
| **Wrong “profile” of collateral** | We need to query the chain for the right kind of token/vesting (by type, source, protocol). Without that, we treat all vesting alike. | List high-risk or OTC-like vesting that we don’t flag; get same terms as safer vesting. |
| **Lender disclosure** | Lenders are the backbone; they must understand that on-chain vesting may be incomplete and that adverse selection (borrowers who know they will exit) can concentrate in our pool. | — |

**Mitigations:** Document the limitation (we cannot see OTC); improve vesting discovery (query by chain, protocol, type) and use it for underwriting and risk; disclose to lenders that on-chain vesting may be partial. See session notes and build plan: `docs/risk/VESTED_TOKEN_LENDING_SESSION_2026-02-14.md`, and `docs/FOUNDER_INSIDER_RISK_AND_FLAGGING.md` for insider/cohort risk.

---

## 3. Identity, Scoring, and Eligibility (Gamification Hotspots)

### 3.1 Passport / Identity Score (Backend)

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Deterministic pseudo-score** | `/api/identity/passport-score/:wallet` uses `sha256(walletAddress)` to derive score 12–47.99 and stamps 2–13 for MVP (“mock: true”). | Generate many addresses; pick one with highest hash-derived score; use that wallet for better tier/LTV. |
| **Admin can patch profile** | Admin can PATCH identity profile (`linkedAt`, `identityProofHash`, `sanctionsPass`). | Insider or compromised admin upgrades a wallet’s profile to “Verified” / “Trusted” for better terms or to bypass checks. |
| **Attestations from any provider** | identityCreditScore.js weights providers (e.g. worldid 120, gitcoin_passport 90). If attestations are self-reported or from a mock, they can be faked. | In testnet, “Gitcoin” attestation is seeded from wallet hash; same wallet always gets same score → no real identity. |
| **No on-chain binding** | Identity tier and LTV boost are used by backend/UI; LoanManager’s IdentityVerifier is optional (mock). | Better terms are granted off-chain or via backend; no cryptographic proof that the borrower is the same as the “verified” identity. |

**Gaps:** P0_WAR_ROOM_FIXLIST already notes identity scoring is simulated and can be mistaken for production. No doc that clearly states “identity does not affect on-chain loan terms in MVP.”

### 3.2 Airdrop Leaderboard

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Event-based scoring** | Leaderboard score = weighted events (wallet_connect, loan_created, etc.) + unique events + consistency + feedback. One wallet = one identity. | Sybil: many wallets, each does minimal “high weight” actions (e.g. connect + quote_requested + feedback); each gets airdrop allocation. |
| **Feedback from payload** | Wallet address taken from contact/feedback payload (`payload.walletAddress` etc.). | Submit feedback with arbitrary wallet addresses; attribute points to wallets that did nothing; inflate their leaderboard score. |
| **No on-chain proof** | Leaderboard is from analytics_events and contact_submissions in DB; no requirement that wallet signed or had session. | Bot: create sessions and events for many addresses; export CSV and use as “allocation shortlist” → airdrop goes to sybils. |
| **Penalties are small** | frontend_error / unhandled_rejection only -8 to -12; high-value actions +30–56. | Spam good events; occasional errors don’t offset gains. |

**Gaps:** TOKENOMICS_FINAL says “staged claim windows with anti-sybil controls” but airdrop leaderboard logic is purely event-based; no proof-of-uniqueness (e.g. Semaphore, phone, or on-chain history) specified.

### 3.3 Presale and Allocation

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Eligibility policy not public** | PRESALE_EXECUTION_CHECKLIST and FUNDING_PRESALE_SPRINT reference eligibility and allocation mechanics but don’t publish the exact rules. | Insider knowledge of eligibility (e.g. KYC, allowlist) could be used to structure multiple entities or wallets to get more than intended allocation. |
| **No cap per wallet in docs** | Presale 7%, community 15%; per-wallet or per-entity caps not specified in TOKENOMICS_FINAL. | Multiple wallets or entities to exceed intended per-person allocation. |

**Gaps:** Public eligibility and per-wallet/per-entity caps not in a single canonical doc; compliance “allowlists” mentioned in PRIVACY_MODEL but not tied to presale.

---

## 3. Privacy and Relayer Risks

| Risk | Description | Gamification / Cheat |
|------|-------------|----------------------|
| **Relayer trust** | PRIVACY_MODEL: relayers submit tx on behalf of users; “use multiple relayers and signed requests” as mitigation. | Malicious relayer: front-run, drop, or alter user tx; or leak (address, amount, timing) to third parties. |
| **Mempool and MEV** | Relayers can use private RPC but it’s optional. Public mempool → searchers see borrow/repay/settle intent. | MEV: sandwich repay or settlement; or front-run auction reveal. |
| **Third-party repayment** | Allowing third-party repayments for privacy can obscure who actually repaid. | Borrower and “friend” coordinate: “friend” repays to avoid linkability; protocol has no way to attribute repayment to borrower for credit history. |

**Gaps:** Relayer set and accountability (slashing, reputation) not specified; no standard for “private RPC” adoption.

---

## 4. Operational and Process Gaps

| Area | Gap | Consequence |
|------|-----|-------------|
| **Incident response** | Runbook exists; tabletop and “successful incident-response tabletop” are pre-mainnet requirements but not evidenced in repo. | Delayed or inconsistent response under exploit or oracle failure. |
| **Risk parameter changes** | RISK_COMMITTEE_CHARTER requires rationale + simulation; no automated check that every param change has an attached doc or proposal ID. | Changes pushed without evidence. |
| **Admin audit** | Admin actions logged to admin_audit_logs; no requirement that high-impact actions (e.g. identity profile patch, repay-sweep) require 2-of-N or approval workflow. | Single admin can alter identity or move funds. |
| **Dependency and upgrades** | SECURITY_AUDIT_CLOSEOUT: “Continue dependency risk reduction.” No automated Dependabot/Renovate policy or upgrade SLA. | Known vulnerable deps in production. |
| **Invariant / fuzz** | Closeout calls for “invariant/fuzz harnesses for debt/collateral conservation and insolvency stress paths.” Not present in repo. | Edge cases in settlement or LTV slip to mainnet. |

---

## 5. Summary: Top 10 Gamification / Cheat Vectors

1. **Fake vesting + no whitelist** – Deploy malicious “vesting” contract, escrow, borrow, no real collateral at unlock → pool loss.
2. **Identity score from wallet hash** – Generate addresses until one has high pseudo-score; use for better tier/terms in testnet or if carried to mainnet.
3. **Airdrop sybil** – Many wallets + minimal high-weight events + feedback with faked wallet in payload → many airdrop allocations.
4. **Oracle / price manipulation** – Temporarily inflate token price (or use wrong feed), borrow at high LTV, price reverts → undercollateralized at unlock.
5. **Sablier operator revocation** – Escrow stream, get loan, revoke wrapper as operator → at unlock protocol can’t withdraw; borrower keeps stream.
6. **Auction collusion** – Seller and bidder agree off-chain; bid at reserve; seller gets liquidity, bidder gets claim cheaply.
7. **Admin identity patch** – Compromised or insider admin sets sanctionsPass / identityProofHash to get favorable terms or bypass checks.
8. **Illiquid collateral default** – Borrow against illiquid token at max LTV; at unlock don’t repay; protocol sells at large slippage → pool shortfall.
9. **Governance/owner takeover** – Single owner or compromised multisig; set malicious oracle or adapter, pause and extract, or raise LTV to unsafe levels.
10. **Feedback wallet spoofing** – Contact form submissions with others’ or fake wallet addresses to pump airdrop leaderboard for those addresses.

---

## 6. Recommended Mitigations (Prioritized)

- **Critical (before mainnet)**  
  - Enforce adapter whitelist by default and document allowed vesting patterns; add bytecode or factory checks if feasible.  
  - Remove or clearly isolate deterministic passport pseudo-score from any production eligibility; require real attestation provider for “verified” tiers.  
  - Require multisig + timelock for all governance contracts; document in DEPLOYMENT and CONTRACTS.  
  - Add invariant tests (and ideally fuzz) for debt ≤ collateral value at issuance and settlement conservation.

- **High**  
  - Define airdrop anti-sybil (e.g. unique-human proof, on-chain history, or cap per wallet with clear rules) and document in TOKENOMICS or ops.  
  - Harden Sablier path: document operator revocation risk; consider escrow that locks operator or use wrapper that cannot be revoked.  
  - Publish presale/community-sale eligibility and per-wallet/per-entity caps; add operational checks.

- **Medium**  
  - Add oracle deviation and unlock-impact checks where feasible; document reserve/minOut and slippage policy per pool.  
  - Require two-party or logged approval for admin identity profile patches and repay-sweep.  
  - Specify relayer set, reputation, and optional slashing; recommend private RPC for sensitive flows.

This document should be reviewed by the Risk Committee and updated when new features or contracts are added. **Related:** For how to solve and stay ahead, see **`docs/REMEDIATION_AND_STAYING_AHEAD.md`**. Link this doc from RISK_COMMITTEE_CHARTER, SECURITY_ROADMAP, and INVESTOR_DATAROOM_INDEX as the central “Risks and Gamification” reference.
