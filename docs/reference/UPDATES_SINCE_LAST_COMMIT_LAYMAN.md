# What Changed Since the Last Commit (Simple Version)

This is a plain-English explanation of everything that has been updated in the project since the last commit.

## Big Picture

A lot of work was done in one pass. The updates mainly focus on:

- making borrowing and repayment smarter and safer,
- adding stronger privacy options for users,
- improving risk controls for admins,
- adding new contract capabilities,
- and reorganizing documentation so it is easier to find.

## 1) Backend (Server + Database) Improvements

### What changed

- The backend logic was expanded a lot (core API/server behavior and data handling).
- New database tables were added for:
  - **risk flags** (mark wallets/tokens as higher risk),
  - **token exposure tracking** (how much loan exposure exists per token),
  - **repayment jobs** (queue/track repay operations),
  - **relayer nonces** (anti-replay security for signed actions).
- A new backfill process was added to rebuild exposure data from old events.
- A new price behavior module was added to evaluate token behavior (like drawdown and range).

### Why it matters

- The system can now make better risk decisions.
- Admins can identify risky borrower patterns earlier.
- Repayment and relayer workflows are safer and more trackable.

## 2) Smart Contract Upgrades

### What changed

- Two new contracts were added:
  - `TermVault`: supports fixed-term deposits with guaranteed-return accounting.
  - `VestraVault`: a minimal vault used for private/relayed on-chain actions.
- Existing core contracts were updated (`LoanManager`, `ValuationEngine`).
- Deployment scripts/config were updated to support the new contract flows.

### Why it matters

- The protocol now supports more structured lending/deposit behavior.
- Privacy-mode execution has proper on-chain support.
- Deployments are better aligned with new features.

## 3) Frontend and User Experience

### What changed

- Added privacy-mode controls and setup helpers in the UI.
- Added a privacy setup wizard for EVM and Solana flows.
- Added an Admin Risk page to manage and review flagged wallets/tokens.
- Updated borrow/repay/dashboard/lender/portfolio pages and shared components.
- Updated frontend API + contract utilities so the UI can use the new backend features.

### Why it matters

- Users get clearer privacy controls.
- Admins get practical tools to monitor risk and take action.
- Core user flows are better connected to the new backend/contract features.

## 4) Security and Reliability Upgrades

### What changed

- Added nonce-based replay protection for signed relayer actions.
- Added more data structures to support risk checks and exposure limits.
- Environment and tooling scripts were updated for safer deployment setup and sync.

### Why it matters

- Harder for attackers to replay signed requests.
- Fewer chances of configuration mismatch between backend/frontend/deployments.
- Better operational safety as the protocol grows.

## 5) Documentation Overhaul

### What changed

- Docs were reorganized from a flat structure into clear topic folders.
- The docs home page (`docs/README.md`) was rewritten as a central hub.
- New docs were added around privacy, legal, risk, and oracle behavior.
- A pitch deck PDF was added.

### Why it matters

- Faster onboarding for team members and partners.
- Easier for developers and non-technical readers to find the right information.

## 6) Scale of the Update

Since the last commit, the working tree includes:

- many modified files,
- many moved/renamed docs,
- many new files,
- and one deleted file.

This was a **large multi-area upgrade**, not a small patch.

## 7) Important Note

The local database file `backend/data/indexer.sqlite` grew a lot.  
If this file is generated from local/runtime data, you may want to double-check whether it should be committed.

---

If you want, I can also create:

- a **1-page investor-friendly summary**, or
- a **release-note version** formatted for GitHub/Notion.
