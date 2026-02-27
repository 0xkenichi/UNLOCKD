# UNLOCKD Feature Catalog and How It Works

This document is a full inventory of the protocol and product features currently described across the UNLOCKD docs set, with practical implementation detail and feature status.

Status labels used below:
- **Live/Implemented**: Present in contracts/backend/frontend docs and/or update logs as currently available.
- **In Progress**: Partially implemented, documented, or scaffolded with clear next steps.
- **Planned**: Documented target behavior not yet fully shipped.

---

## 0) Best Features (Deep Dive)

This section goes deeper on the strongest UNLOCKD differentiators, with concrete flow detail.

### 0.1 Vesting-backed credit with deterministic unlock settlement
- **Why this is a top feature:** Most credit systems require liquid collateral and continuous liquidation management. UNLOCKD prices time-lock risk directly and enforces outcomes at unlock.
- **Detailed flow:**
  1. User escrows claim rights via `VestingAdapter` (or wrapper-backed vesting source).
  2. Adapter exposes deterministic quantity + unlock time.
  3. `ValuationEngine` computes DPV and max LTV under conservative discounting.
  4. `LoanManager` issues loan only if amount is inside policy bounds.
  5. Borrower repays partially or fully before unlock.
  6. At unlock, settlement branch is deterministic: full repay -> release, partial -> seize required amount and return excess, default -> seize + liquidate for pool recovery.
- **Why it matters:** The system turns uncertain collateral into a bounded, rules-driven lifecycle without requiring off-chain legal enforcement to run the core mechanics.
- **Status:** **Live/Implemented**.

### 0.2 Privacy architecture that separates enforcement from identity
- **Why this is a top feature:** UNLOCKD tries to preserve user privacy without sacrificing lender safety and protocol enforceability.
- **Detailed flow (conceptual):**
  1. User can choose public/pseudonymous/relayed mode.
  2. In relayed mode, execution intent is signed and passed to relayer infrastructure.
  3. Nonce + typed payload hashing defends against replay.
  4. Public/AI-facing APIs are designed to avoid exposing per-wallet activity linkage.
  5. AI receives protocol knowledge + aggregate platform snapshots, not address-level activity feeds.
  6. On-chain settlement remains deterministic regardless of privacy mode.
- **Why it matters:** Privacy is treated as a transport-and-data-layer design, not a bypass of risk/compliance controls.
- **Status:** **Live/Implemented core + In Progress hardening**.

### 0.3 Risk intelligence with insider-aware controls
- **Why this is a top feature:** Standard DeFi risk controls often miss wallet-token relationship risk (founder/team/cohort behavior).
- **Detailed flow:**
  1. Internal risk flags are stored by wallet and optional token scope.
  2. Quote path checks applicable flags at wallet or wallet+token granularity.
  3. If flagged, quote LTV can be capped through insider policy (for example, `INSIDER_LTV_BPS`).
  4. Cohort and concentration endpoints help detect clustered exits and exposure buildup.
  5. Admin risk console supports flag lifecycle operations and internal monitoring.
- **Why it matters:** It combines protocol-level quantitative controls with operational intelligence for asymmetric behavior.
- **Status:** **Live/Implemented baseline + In Progress policy maturation**.

### 0.4 Hybrid liquidity surface (on-demand + fixed-term tranches)
- **Why this is a top feature:** Supports both active and passive lender preferences.
- **Detailed flow:**
  - On-demand deposits route through `LendingPool` with utilization-driven rate dynamics.
  - Fixed-term deposits route through `TermVault` where minimum-return capacity is checked before accepting deposits.
  - Combined surface helps liquidity depth while preserving conservative credit controls.
- **Why it matters:** It broadens lender participation without changing borrower-side settlement guarantees.
- **Status:** **Live/Implemented**.

### 0.5 AI assistant with strict privacy/data boundaries
- **Why this is a top feature:** AI utility is integrated without converting user activity into exposed behavioral telemetry.
- **Detailed flow:**
  1. Agent loads protocol knowledge and aggregate snapshot context.
  2. Wallet addresses are intentionally excluded from LLM payload context.
  3. Public activity endpoints remove borrower identifiers.
  4. AI answers from policy + aggregate state, not per-user behavior traces.
- **Why it matters:** You get support/education automation while preserving "no one should know which holder did what when" at app/API level.
- **Status:** **Live/Implemented with ongoing automation enhancements**.

---

## 1) Core Protocol Primitive

### 1.1 Borrow against time-locked value
- **What it is:** Users borrow stablecoins against vested/locked token claim rights without breaking vesting.
- **How it works:** A vesting position is escrowed through `VestingAdapter`; `ValuationEngine` computes conservative DPV and LTV; `LoanManager` issues the loan; `LendingPool` supplies USDC.
- **Status:** **Live/Implemented**.

### 1.2 Non-custodial settlement at unlock
- **What it is:** Settlement happens by contract logic at unlock time, not by discretionary off-chain action.
- **How it works:** At unlock, `settleAtUnlock` enforces one of three outcomes: full repay -> release, partial repay -> partial seizure + return excess, default -> seize and liquidate.
- **Status:** **Live/Implemented**.

### 1.3 Time-based default model (no margin-call loop)
- **What it is:** Risk resolution is anchored to unlock-time settlement, not continuous price-trigger liquidations.
- **How it works:** Debt is repaid before unlock (optionally partial). If not fully repaid by settlement, collateral seizure/liquidation resolves the debt path.
- **Status:** **Live/Implemented**.

---

## 2) Collateral and Vesting Integrations

### 2.1 VestingAdapter escrow layer
- **What it is:** Adapter layer that validates vesting collateral and escrows claim rights.
- **How it works:** Adapter exposes collateral details (quantity/unlock time) and release hooks used by settlement logic.
- **Status:** **Live/Implemented**.

### 2.2 Wrapper support for real vesting standards
- **What it is:** Claim-right wrappers for standards that do not natively support `releaseTo`.
- **How it works:** Wrapper is beneficiary/operator and provides settlement-compatible release method.
- **Supported patterns:** OpenZeppelin `VestingWallet`, `TokenTimelock`, Sablier v2 Lockup, Superfluid streams.
- **Status:** **Live/Implemented** (with known operational caveats for some paths).

### 2.3 Sablier import flow in Borrow UI
- **What it is:** Borrow flow can import Sablier streams via wrapper + stream metadata.
- **How it works:** UI collects lockup + stream ID + wrapper address, then routes into adapter escrow/loan flow.
- **Status:** **Live/Implemented**, feature-flag controllable (`VITE_FEATURE_SABLIER_IMPORT`).

### 2.4 Adapter whitelist hardening
- **What it is:** Governance option to restrict allowed vesting contracts/wrappers.
- **How it works:** `setUseWhitelist(true)` + per-contract allowlist (`setAllowedVestingContract`).
- **Status:** **Live/Implemented**, recommended as mandatory for mainnet hardening.

---

## 3) Valuation, Risk, and Loan Sizing

### 3.1 Discounted Present Value (DPV) engine
- **What it is:** Conservative valuation model for locked claims (`PV = Q * P * D`).
- **How it works:** Composite discount includes time, volatility, liquidity, and supply-shock-style conservatism.
- **Status:** **Live/Implemented**.

### 3.2 LTV controls
- **What it is:** Borrow caps from PV and risk policy.
- **How it works:** Loan size constrained by `maxBorrow <= PV * LTV`; LTV levels are governance/risk controlled.
- **Status:** **Live/Implemented**.

### 3.3 ATH/ATL-aware risk adjustment
- **What it is:** Price-history-aware conservatism using all-time-high/all-time-low behavior.
- **How it works:** Drawdown/range metrics are used to tighten DPV/LTV through bounds/penalty logic.
- **Status:** **In Progress** (documented and partially wired; automation/data refresh path still being completed).

### 3.4 Monte Carlo calibration
- **What it is:** Off-chain quantitative stress modeling to calibrate conservative on-chain parameters.
- **How it works:** Monte Carlo tail metrics (e.g., P5/ES) inform sigma assumptions, LTV policy, and governance updates.
- **Status:** **Live process + In Progress operationalization**.

### 3.5 Insider-aware risk caps
- **What it is:** Additional downside protection for founder/team/insider wallet-token relationships.
- **How it works:** Internal flagging can cap wallet quote LTV (e.g., `INSIDER_LTV_BPS`), with cohort alerts and token-level review.
- **Status:** **Live/Implemented** at backend quote policy level; broader policy maturation is **In Progress**.

---

## 4) Interest, Lending Pools, and Liquidity Surfaces

### 4.1 Utilization-based interest tiers
- **What it is:** Dynamic pool rate model with low/mid/high utilization bands.
- **How it works:** `LendingPool.getInterestRateBps()` returns tiered rate by utilization; governance/timelock can update thresholds and rates.
- **Status:** **Live/Implemented**.

### 4.2 Current interest application model
- **What it is:** Flat origination-time interest charge (plus origination fee), fixed over loan life.
- **How it works:** At loan creation, rate is sampled and converted into fixed interest amount; repayments apply interest first, principal second.
- **Status:** **Live/Implemented**.

### 4.3 Main lending pool
- **What it is:** Perpetual pool for deposits/borrows and utilization accounting.
- **How it works:** Tracks `totalDeposits`, `totalBorrowed`, depositor balances, and provides borrower liquidity.
- **Status:** **Live/Implemented**.

### 4.4 Community pools lifecycle
- **What it is:** Fundraising-to-lending pool state machine for community-led liquidity.
- **How it works:** `FUNDRAISING -> ACTIVE` (target reached), `FUNDRAISING -> REFUNDING` (deadline missed), `ACTIVE -> CLOSED` (manual close).
- **Status:** **Live/Implemented**.

### 4.5 Hybrid lender deposit experience
- **What it is:** On-demand pool plus fixed-term tranche vault surface.
- **How it works:** Main pool supports on-demand deposits; `TermVault` adds fixed-term deposits with minimum-return capacity checks.
- **Status:** **Live/Implemented** (recently added in current update set).

### 4.6 Treasury-funded credit phase
- **What it is:** Protocol treasury as a direct liquidity source after market matching stabilizes.
- **How it works:** Agent-guided underwriting and allocation from treasury-managed capital.
- **Status:** **Planned / early design**.

---

## 5) Repayment and Settlement Features

### 5.1 Partial and full repay
- **What it is:** Borrower can repay incrementally or in full before unlock.
- **How it works:** Debt accounting updates on each repay call; settlement handles final state at unlock.
- **Status:** **Live/Implemented**.

### 5.2 EVM auto-repay (opt-in)
- **What it is:** Keeper-assisted repayments for opted-in borrowers.
- **How it works:** Borrower opts in on-chain; keepers execute repay/swap-for flows using configured token priority and capped amounts/slippage safeguards.
- **Status:** **Live/Implemented** (with configurable keeper env controls).

### 5.3 Borrower-initiated repay with swaps
- **What it is:** Repay from non-USDC assets via configured swap paths.
- **How it works:** Approved tokens are swapped (Uniswap v3 default) to repay debt via `repayWithSwap` / batch variants.
- **Status:** **Live/Implemented**.

### 5.4 Solana auto-repay sweep modes
- **What it is:** Server-side delegated token sweeps for Solana repayment operations.
- **How it works:** Configurable modes (`usdc-only`, `transfer`, `swap`) with priority mint lists and Jupiter swap integration.
- **Status:** **Live/Implemented** (feature-gated operationally by env).

### 5.5 Keeper-driven auto-settlement
- **What it is:** Scheduled EVM keeper scans unlocked loans and triggers `settleAtUnlock`.
- **How it works:** Configured interval/scan windows/tx budget per tick; reduces manual settlement dependency.
- **Status:** **Live/Implemented**.

---

## 6) Liquidation and Auction Features

### 6.1 Default liquidation via DEX routing
- **What it is:** Seized collateral is sold into configured liquidity routes to repay pool debt.
- **How it works:** LoanManager routes collateral sale with slippage/min-out controls.
- **Status:** **Live/Implemented**.

### 6.2 Optional non-loan auction primitive
- **What it is:** Debt-free early exit path where users sell claim rights instead of borrowing.
- **How it works:** Claim rights are auctioned; winner receives claim at unlock; seller receives stablecoins minus fee.
- **Status:** **Live/Implemented** as optional module.

### 6.3 Multiple auction types
- **What it is:** Different price discovery modes for claim-right sales.
- **How it works:** Dutch (descending), English (ascending), Sealed Bid (commit/reveal first-price), deployed via `AuctionFactory`.
- **Status:** **Live/Implemented**.

### 6.4 Sealed-bid privacy and signaling reduction
- **What it is:** Reduced information leakage during bidding.
- **How it works:** Commitment hash + later reveal window prevents immediate bid disclosure.
- **Status:** **Live/Implemented**.

### 6.5 Lender claim-right secondary transfer path
- **What it is:** Ability for lenders to transfer/auction claim rights post-loan.
- **How it works:** Planned with lifecycle-consistency constraints so borrower repay rights and ownership logic remain unambiguous.
- **Status:** **Planned**.

---

## 7) Privacy Architecture and Relayer System (Detailed)

### 7.1 Privacy objective and operating principle
- **Objective:** Prevent app/API/AI layers from becoming a correlation oracle for "which holder used the platform and when," while preserving deterministic on-chain enforcement.
- **Operating principle:** Privacy changes the interaction surface and metadata exposure, not the core debt/collateral settlement rules.
- **Status:** **Live objective + In Progress hardening**.

### 7.2 Privacy modes (what changes between modes)
- **Public mode:** User interacts directly with contracts from their own wallet; highest transparency.
- **Pseudonymous mode:** User rotates addresses and minimizes direct linkage at UX/operational layer.
- **Relayed/shielded mode:** Relayer submits transactions to reduce direct wallet-action linkage at the application flow level.
- **Verified-private mode (target):** User proves eligibility/membership without full identity disclosure.
- **Status:** Public/pseudonymous/relayed core behavior is **Live/Implemented**; verified-private proofs are **Planned**.

### 7.3 Privacy data boundaries (critical)
- **Boundary A: On-chain state is public by nature.**
  - Privacy model does not claim chain-level invisibility against determined chain analysts.
- **Boundary B: App/API must not amplify linkage.**
  - Public activity APIs should not expose borrower addresses or wallet-level borrower identifiers.
  - Exports should not include direct wallet fields for activity browsing surfaces.
- **Boundary C: AI must be aggregate-only for activity context.**
  - Agent gets protocol docs + aggregate platform snapshot, not per-wallet behavior feeds.
- **Boundary D: Internal risk/compliance remains allowed.**
  - Internal risk systems can maintain controlled-access flagging and relationship intelligence without exposing this publicly.
- **Status:** **Live policy with partial implementation completed**.

### 7.4 End-to-end relayed flow (how private execution works)
- **Step 1: User intent creation**
  - User initiates action (borrow/repay/settle intent) from privacy-enabled UI flow.
  - Payload is structured and signed in a deterministic format.
- **Step 2: Intent authentication**
  - Backend validates signature structure and nonce policy.
  - Nonce + TTL constraints define freshness and replay window.
- **Step 3: Replay defense**
  - Nonce state is tracked (`relayer_nonces`).
  - Previously consumed nonce/intent cannot be executed again.
- **Step 4: Relayer submission**
  - Relayer submits transaction on user’s behalf.
  - Optional private RPC and/or batching can reduce mempool-intent leakage.
- **Step 5: Settlement and accounting**
  - Contract settlement logic is unchanged by relay path.
  - Loan/debt/collateral accounting remains identical to direct mode.
- **Step 6: Response shaping**
  - Public activity surfaces return redacted/aggregate-friendly payloads.
  - Internal logs should avoid binding user message/action content to wallet identifiers where unnecessary.
- **Status:** **Live/Implemented scaffolding + In Progress operational maturity**.

### 7.5 API privacy contract (what is and is not exposed)
- **Allowed publicly:**
  - Aggregate counts (loan counts, repay counts, defaults by period).
  - Aggregate pool metrics (deposits, borrowed, utilization, pool states).
  - Opaque identifiers where necessary for UX continuity.
- **Disallowed publicly (target policy):**
  - Borrower wallet addresses in activity feeds/exports.
  - Per-holder behavior timelines that can trivially re-identify user actions.
  - Lender-facing surfaces that reveal per-loan token/borrower linkage.
- **Why this matters:** It prevents the web app from becoming a convenience layer for deanonymization.
- **Status:** **Live in key endpoints, with iterative hardening across surfaces**.

### 7.6 AI privacy architecture (how CRDT AI is constrained)
- **Data AI can use:**
  - Protocol docs/specs/risk models.
  - Aggregate platform snapshot (counts/totals/utilization/pool-state-level data).
- **Data AI should not receive:**
  - Wallet addresses (connected or third-party) as raw context.
  - Per-user/per-wallet action history in prompt context.
  - Linking metadata that says "wallet X borrowed at time T."
- **Prompt/runtime controls:**
  - System prompt enforces "protocol + aggregate only" behavior.
  - Runtime context can pass boolean hints (for example, wallet connected yes/no) without raw address disclosure.
- **Status:** **Live/Implemented baseline; automation and audit checks are In Progress**.

### 7.7 Lender-facing portfolio-light privacy
- **Goal:** Lenders see risk and utilization information without borrower doxxing surfaces.
- **Allowed design pattern:**
  - Aggregate exposure buckets, utilization bands, maturity distributions, flagged-vs-unflagged totals.
- **Avoided design pattern:**
  - Loan-by-loan borrower/token reveal in public lender surfaces.
- **Status:** **Documented and partially implemented; still In Progress**.

### 7.8 Privacy threat model and concrete mitigations
- **Threat: Address linkage through direct user tx**
  - **Mitigation:** Relayed execution path + optional address hygiene (pseudonymous mode).
- **Threat: Mempool surveillance/MEV inference**
  - **Mitigation:** Private RPC channels and batching at relayer path (where enabled).
- **Threat: Replay of signed private intents**
  - **Mitigation:** Nonce table + typed hash + freshness checks.
- **Threat: API deanonymization from activity feeds**
  - **Mitigation:** Borrower field removal/redaction + aggregate-first endpoints.
- **Threat: AI becoming an identity leakage channel**
  - **Mitigation:** Aggregate-only AI context contract + prompt guardrails.
- **Threat: Internal-to-external data bleed**
  - **Mitigation:** Access control boundaries between risk-intel internals and public app/API surfaces.
- **Status:** Mixed: core mitigations are **Live**, advanced relayer/accountability/proof layers are **In Progress/Planned**.

### 7.9 Residual privacy risks (important and explicit)
- **Chain visibility remains:** A sophisticated analyst can still infer behavior from raw on-chain state.
- **Metadata cannot be fully erased:** Timing, gas, and transfer graph analysis can still correlate events.
- **Relayer trust is non-zero:** Relayer governance/reputation/slashing model is still maturing.
- **Tradeoff:** Stronger privacy may increase latency/complexity/cost in some flows.
- **Status:** **Accepted residual risk with ongoing mitigation roadmap**.

### 7.10 Privacy implementation status checklist
- **Have now:**
  - Privacy mode UX controls and flow hooks.
  - Relayer replay protection (`relayer_nonces` + structured auth payload paths).
  - Aggregate platform snapshot for AI.
  - Borrower redaction in key activity/feed surfaces.
- **Next hardening priorities:**
  - Formal relayer accountability model (reputation/slashing/service policy).
  - Wider API/privacy contract audits across all endpoints and exports.
  - Verified-private proof layer (group membership / selective disclosure).
  - Stronger privacy regression testing in release gates.

---

## 8) Identity, Eligibility, and Reputation Features

### 8.1 Optional identity-aware credit path
- **What it is:** Identity/proof hooks for better terms in policy-approved pools.
- **How it works:** Optional verifier/proof inputs can adjust eligibility and pricing assumptions.
- **Status:** **In Progress** (MVP has optional/mock pathways; production-grade policy controls are still evolving).

### 8.2 Eligibility without identity disclosure
- **What it is:** Verified-private concept where users prove membership/eligibility but not real-world identity.
- **How it works:** Planned Semaphore-like/group membership proof path for policy-gated pools.
- **Status:** **Planned**.

### 8.3 Airdrop/engagement scoring infrastructure
- **What it is:** Event-driven scoring surfaces for growth and allocation experiments.
- **How it works:** Backend analytics events + leaderboard logic drive score outputs.
- **Status:** **Live/Implemented**, with explicit anti-sybil hardening flagged as **In Progress**.

---

## 9) Risk Intelligence, Admin Controls, and Governance Ops

### 9.1 Internal risk flags engine
- **What it is:** Wallet/token risk-flag store with admin controls.
- **How it works:** `risk_flags` persistence + admin APIs + UI for adding/removing/filtering flags.
- **Status:** **Live/Implemented**.

### 9.2 Cohort and concentration monitoring
- **What it is:** Risk intel for loan concentration and clustered behavior.
- **How it works:** Token exposure tables/backfills + cohort endpoints (by borrower/by token) from indexed events.
- **Status:** **Live/Implemented**.

### 9.3 Admin Risk console
- **What it is:** Frontend control plane for internal risk operations.
- **How it works:** `/admin/risk` surfaces flags and cohort analytics for internal roles.
- **Status:** **Live/Implemented**.

### 9.4 Risk Committee governance process
- **What it is:** Formal governance framework for risk parameter changes and emergencies.
- **How it works:** Structured rationale + simulation evidence + vote path + timelock + emergency expiry and retrospective review.
- **Status:** **Live/Documented governance framework**.

### 9.5 Emergency controls
- **What it is:** Pause/tighten controls for oracle failure, attack, default cluster, or liquidity shock.
- **How it works:** Governance/guardian paths can pause adapters/pools, tighten LTV, disable routes, then publish incident notes.
- **Status:** **Live/Implemented in parts + In Progress procedural hardening**.

---

## 10) Oracle Security and Market Data Features

### 10.1 Primary oracle support (EVM + Solana)
- **What it is:** Multi-chain price inputs for valuation.
- **How it works:** Chainlink feeds on EVM and Pyth/Hermes paths for Solana-linked flows.
- **Status:** **Live/Implemented**.

### 10.2 Staleness enforcement
- **What it is:** Hard rejection of stale prices.
- **How it works:** `maxPriceAge` check ensures valuation only uses fresh feed updates.
- **Status:** **Live/Implemented**.

### 10.3 Token-specific feed mapping
- **What it is:** Asset-level oracle routing for listed collateral.
- **How it works:** Dedicated feed mapping per token to avoid incorrect default feed pricing.
- **Status:** **Live/Implemented**.

### 10.4 Deviation checks and circuit breaker
- **What it is:** Additional defense against short-lived price manipulation.
- **How it works:** Planned primary-vs-reference deviation thresholds and temporary borrow pause/conservative pricing.
- **Status:** **Planned / In Progress**.

### 10.5 Price-behavior service
- **What it is:** Backend analytics for drawdown/range/ATH/ATL context.
- **How it works:** Service computes spot + behavior metrics and returns risk suggestion; used by API and AI.
- **Status:** **Live/Implemented module**, broader automation feed refresh is **In Progress**.

---

## 11) AI and Agent Features

### 11.1 In-app CRDT AI assistant
- **What it is:** Protocol assistant for user Q&A and flow guidance.
- **How it works:** Uses protocol docs + intents + tools + aggregate platform snapshot context.
- **Status:** **Live/Implemented**.

### 11.2 Price-behavior AI intent
- **What it is:** AI can answer token behavior/risk framing questions.
- **How it works:** Agent classifies price-behavior intent and calls backend behavior service for structured metrics.
- **Status:** **In Progress** (architecture and service available; full intent/tooling finalization ongoing).

### 11.3 ASI:One model backend integration
- **What it is:** Optional ASI:One provider for the agent’s final response generation.
- **How it works:** Set `ASI_ONE_API_KEY`; agent backend attempts ASI model path while preserving existing RAG/tool stack.
- **Status:** **Live/Implemented**.

### 11.4 ASI ecosystem discoverability
- **What it is:** Publish UNLOCKD as an ASI/Agentverse-compatible agent.
- **How it works:** Adapter/full uAgents path with chat protocol + mailbox + agent registration.
- **Status:** **Planned**.

---

## 12) Frontend Product Features

### 12.1 Core borrower experience
- **Views:** borrow simulator (PV/LTV), create loan, repay (partial/full), settlement status.
- **How it works:** Reads valuation + loan state; writes escrow/create/repay/settle transactions.
- **Status:** **Live/Implemented**.

### 12.2 Wallet and chain UX
- **What it is:** Wallet connection and chain operations for EVM flows.
- **How it works:** RainbowKit + Wagmi integration, plus chain prompts/connect components.
- **Status:** **Live/Implemented**.

### 12.3 Admin and risk pages
- **What it is:** Internal pages for airdrop and risk operations.
- **How it works:** Routes include admin risk page and supporting APIs.
- **Status:** **Live/Implemented**.

### 12.4 Privacy UX elements
- **What it is:** Privacy mode toggle and setup wizard.
- **How it works:** Client utilities persist mode preference and shape privacy-related request flows.
- **Status:** **Live/Implemented**.

---

## 13) Tokenomics, DAO, and Economic Features

### 13.1 CRDT token spec
- **What it is:** ERC-20 + votes governance token with fixed 1B cap.
- **How it works:** No Phase 1 inflation, governance timelock controls treasury/policy changes.
- **Status:** **Live/Defined policy**.

### 13.2 Phase 1 allocation and vesting schedule
- **What it is:** Treasury/team/liquidity/community/presale/investor/airdrop allocations with explicit vesting cliffs/linear unlocks.
- **How it works:** Time-based unlock policy per bucket; governance constraints on acceleration.
- **Status:** **Live/Defined policy**.

### 13.3 Fee routing by risk profile
- **What it is:** Fee split among lenders, treasury, and safety module varies by risk class.
- **How it works:** Low/balanced/high-risk routing percentages with governance-tunable parameters.
- **Status:** **Live/Defined policy**.

### 13.4 Governance guardrails
- **What it is:** Quorum, threshold, voting window, and timelock constraints.
- **How it works:** Parameter changes require rationale + simulation summary before execution path.
- **Status:** **Live/Defined policy**, implementation maturity depends on deployment/governance activation stage.

---

## 14) Integration and Ecosystem Features

### 14.1 Protocol integration tracking
- **What it is:** Backend tables for vesting and fundraising source linkage.
- **How it works:** `vesting_sources` and `fundraising_sources` provide segmentation, rollout, and ops observability.
- **Status:** **Live/Implemented**.

### 14.2 Fundraising onboarding route control
- **What it is:** Optional onboarding flow for project fundraising links.
- **How it works:** Frontend flag can hide/show route; backend endpoints currently available and can be auth/rate-limited.
- **Status:** **Live/Implemented**, production hardening **In Progress**.

### 14.3 Futures/perps integration path
- **What it is:** Optional stack extension for hedge/liquidation and broader credit tooling.
- **How it works:** Adds oracle/backend/frontend hooks while keeping core lending primitive modular.
- **Status:** **Planned / architectural**.

### 14.4 Multi-chain deployment targets
- **What it is:** Deployment support across Sepolia, Base (testnet/mainnet), and Flow EVM environments.
- **How it works:** Hardhat deploy scripts + sync scripts wire addresses into frontend/backend runtime.
- **Status:** **Live/Implemented**.

---

## 15) Security and Operational Features

### 15.1 Timelock and multisig governance posture
- **What it is:** Parameter/control updates routed through delay + shared-signature controls.
- **How it works:** Timelocked update functions and ops policy require multisig ownership for mainnet safety.
- **Status:** **Live capability + In Progress rollout hardening**.

### 15.2 API/session/rate-limit protections
- **What it is:** Operational defenses for backend abuse and reliability.
- **How it works:** Session TTLs, nonce TTLs, route-specific rate limits, body-size caps, Turnstile integration.
- **Status:** **Live/Implemented**.

### 15.3 Supabase + SQLite fallback persistence
- **What it is:** Shared durable persistence with local fallback.
- **How it works:** Supabase as recommended production backend; SQLite fallback for local/single-node workflows.
- **Status:** **Live/Implemented**.

### 15.4 Testnet readiness and load gates
- **What it is:** Explicit capacity targets and load-test pass criteria before broader opening.
- **How it works:** Tiered concurrency objectives + route-specific p99/error gates + launch-day rollback/incident operations.
- **Status:** **Live/Documented operations framework**.

### 15.5 Incident response and security roadmap process
- **What it is:** Structured response, closeout tracking, and security maturation plan.
- **How it works:** Runbooks, war-room fixlists, audit closeout docs, recurring security roadmap milestones.
- **Status:** **Live/Documented**, execution cadence is ongoing.

---

## 16) Legal and Commercialization Features

### 16.1 Loan Terms and Risk Disclosure integration pattern
- **What it is:** Single canonical legal document + explicit acceptance trigger in borrow flow.
- **How it works:** User must read/accept terms before create-loan action; links legal terms to contract behavior and addresses.
- **Status:** **In Progress** (outline and legal memo present; final counsel-approved production terms to complete).

### 16.2 Partner pilot LOI framework
- **What it is:** Non-binding partner onboarding instrument for pilot execution.
- **How it works:** LOI defines pilot scope, responsibilities, KPIs, confidentiality baseline, and path to definitive agreements.
- **Status:** **Live/Implemented template**.

### 16.3 IP and commercialization guardrails
- **What it is:** Trademark/patent/trade-secret strategy recommendations around protocol primitive and brand.
- **How it works:** Legal framework in memo drives trademark/patent filing and public messaging constraints.
- **Status:** **Documented strategy / Planned execution**.

---

## 17) Immediate "Have Now" vs "Next" Snapshot

### Have Now (high-confidence implemented)
- Vesting-backed borrowing core flow (escrow -> value -> loan -> repay -> settle).
- Utilization-tier rate model and community pool lifecycle.
- Repay modes (manual + swap + auto-repay scaffolding), default liquidation.
- Optional auction module (Dutch/English/Sealed Bid).
- Risk flags, cohort monitoring, admin risk page.
- Privacy mode UX, relayer nonce replay protection, aggregate-only AI privacy protections.
- Multi-chain deployment scripts and operational env controls.
- CRDT tokenomics/governance policy docs and fee-routing model.

### Next / Not Fully Closed Yet
- Full ATH/ATL automation and complete price-behavior operational pipeline.
- Deviation/circuit-breaker oracle controls in production-hard form.
- Production-grade anti-sybil identity/airdrop enforcement.
- Full insider graph + cohort alert automation maturity.
- Final counsel-approved Loan Terms + mandatory in-flow acceptance UX.
- Advanced relayer trust/accountability and proof-system rollout at scale.

---

## 18) Notes from This Scan

- The feature set in this repo spans protocol, backend, frontend, risk ops, tokenomics, security, legal, and GTM layers; it is not just a lending contract set.
- A referenced deck PDF path appears in update notes, while export docs point to `docs/deck/vestra-moonshots-deck.pdf` as the generated output location.
- This catalog is built from current documentation snapshots and should be refreshed as contract behavior, backend APIs, and governance policies are finalized.
