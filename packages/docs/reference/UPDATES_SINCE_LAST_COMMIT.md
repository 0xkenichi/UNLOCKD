# Updates and Improvements Since Last Commit

This document summarizes all current working-tree changes relative to `HEAD` (the latest commit on this branch).

## Snapshot (Current Working Tree)

- **41 modified files**
- **57 renamed/moved files**
- **42 new untracked files**
- **1 deleted file**
- Tracked diff size: **6,796 insertions / 597 deletions** across **56 tracked files**
- Notable binary data growth: `backend/data/indexer.sqlite` increased significantly (event/index data expansion)

## Key Improvements by Area

### 1) Backend and Data Layer

- Expanded backend logic in `backend/server.js` and `backend/persistence.js` (major additions for risk/privacy/relayer flows and data handling).
- Added **risk intelligence and cohort support**:
  - `backend/migrations/0006_risk_flags.sql`
  - `backend/migrations/0008_indexer_events_token.sql`
  - `frontend/src/pages/AdminRisk.jsx` consumes these capabilities.
- Added **loan concentration tracking**:
  - `backend/migrations/0007_loan_token_exposure.sql`
  - `backend/lib/backfillConcentration.js`
  - `backend/scripts/backfill-loan-token-exposure.js`
- Added **repayment job queue groundwork**:
  - `backend/migrations/0009_repay_jobs.sql`
- Added **relayer replay protection**:
  - `backend/migrations/0010_relayer_nonces.sql`
- Added **price behavior module** for ATH/ATL and drawdown/range analysis:
  - `backend/lib/priceBehavior.js`

### 2) Smart Contracts and On-Chain Capabilities

- Added new contracts:
  - `contracts/TermVault.sol` (fixed-term USDC vault, guarantee-capacity accounting, maturity/early-withdraw flows)
  - `contracts/VestraVault.sol` (minimal execution vault for private/relayed actions)
- Updated existing protocol contracts:
  - `contracts/LoanManager.sol`
  - `contracts/ValuationEngine.sol`
- Deployment flow updates in:
  - `deploy/000_full_deploy.js`
  - `deploy/001_deploy_all.js`
  - `hardhat.config.js`
  - `deployments/sepolia/VestingAdapter.json`

### 3) Privacy Mode and Frontend UX

- Introduced privacy-mode primitives:
  - `frontend/src/utils/privacyMode.js` (persistent toggle state)
  - `frontend/src/utils/privacy.js` (stable payload hashing + typed relayer auth structure)
- Added privacy UI components:
  - `frontend/src/components/privacy/PrivacyModeToggle.jsx`
  - `frontend/src/components/privacy/PrivacyUpgradeWizard.jsx`
- Expanded app/page logic to support new flows:
  - Borrow/repay/dashboard/lender/portfolio and common wallet/chain UI components
  - New admin page: `frontend/src/pages/AdminRisk.jsx`
  - Route update: `frontend/src/routes.js`
- Updated API integration helpers and contract/chains utilities:
  - `frontend/src/utils/api.js`
  - `frontend/src/utils/chains.js`
  - `frontend/src/utils/contracts.js`

### 4) Tooling, Scripts, and Environment

- Added scripts for deployment hygiene and synchronization:
  - `scripts/check-deploy-env.js`
  - `scripts/sync-frontend-contracts.js`
- Added pitch deck generation helper:
  - `scripts/generate_pearx_pitch_deck.py`
- Environment/template updates:
  - `backend/.env.example`
  - `frontend/.env.example`
- Dependency/config updates:
  - `package.json`
  - `backend/package.json`
  - `backend/package-lock.json`
  - `frontend/vite.config.js`

### 5) Documentation Reorganization and Expansion

- Major docs taxonomy refactor from flat `docs/` into structured subfolders:
  - `docs/build-and-deploy/`
  - `docs/protocol-design/`
  - `docs/risk/`
  - `docs/security/`
  - `docs/integrations/`
  - `docs/reference/`
  - plus additional topic folders
- `docs/README.md` rewritten as a central documentation hub.
- Added/expanded topic docs on:
  - AI/privacy model
  - founder/insider risk flagging
  - oracles and price behavior
  - loan terms/legal guidance
  - risk remediation and parameter hardening
- Added deck asset:
  - `docs/Vestra_PearX_S26_Pitch_Deck.pdf`

## Notable Net-New Files (Representative)

- Backend: `backend/lib/backfillConcentration.js`, `backend/lib/priceBehavior.js`, `backend/relayer/evmRelayer.js`
- Migrations: `backend/migrations/0006_risk_flags.sql` through `0010_relayer_nonces.sql`
- Contracts: `contracts/TermVault.sol`, `contracts/VestraVault.sol`
- Frontend: `frontend/src/pages/AdminRisk.jsx`, privacy components/utilities under `frontend/src/components/privacy/` and `frontend/src/utils/`
- Scripts: `scripts/check-deploy-env.js`, `scripts/sync-frontend-contracts.js`, `scripts/generate_pearx_pitch_deck.py`

## Operational Notes

- `backend/data/indexer.sqlite` is heavily changed and much larger; if this is environment-generated data, confirm whether it should be versioned.
- This change set appears to combine:
  - protocol feature expansion,
  - privacy/relayer architecture,
  - risk/admin tooling,
  - and docs reorganization.
  Splitting into focused commits may improve reviewability.

