# Testnet Validation & Checkpoint Checklist

This checklist is based on standards used by top-tier DeFi protocols (e.g., Aave, MakerDAO, Uniswap) to ensure a secure and successful bridge from testnet to mainnet.

## Phase 1: Deployment & Infrastructure Readiness
- [ ] **Contract Deployment**:
    - [ ] Deploy all core contracts (LoanManager, ValuationEngine, VestingAdapters).
    - [ ] Verify all contracts on Etherscan/Blockscout.
    - [ ] Initialize admin roles (Timelocks, Multi-sigs).
- [ ] **Infrastructure Triage**:
    - [ ] Indexer (The Graph/Custom) syncing without lag.
    - [ ] API endpoints load-tested (100+ requests/sec).
    - [ ] Database backup systems active.
- [ ] **Environment Parity**:
    - [ ] Environment variables (.env) identical to production structure.

## Phase 2: Functional Core Testing (The "Borrow Flow")
- [ ] **Collateral Wrappers**:
    - [ ] Test 5 different vesting schedules (linear, cliff, staggered).
    - [ ] Verify ESCROW lock/unlock logic across 100 transactions.
- [ ] **Valuation Integrity**:
    - [ ] DPV (Discounted Principal Value) matches spreadsheet models for edge cases.
    - [ ] LTV limits enforced strictly on-chain.
- [ ] **Repayment Logic**:
    - [ ] Partial repayment correctly updates health factor.
    - [ ] Full repayment releases collateral every time.

## Phase 3: Oracle & Risk Stress Testing
- [ ] **Oracle Performance**:
    - [ ] Simulate 50% price drop in 1 hour; verify LTV updates.
    - [ ] Test "Dirty Price" / Staleness checks (Oracle heartbeat).
    - [ ] Verify TWAP window behavior during low liquidity.
- [ ] **Liquidation Engine**:
    - [ ] Trigger manual liquidations on undercollateralized loans.
    - [ ] Verify Dutch Auction price decay works as expected.
    - [ ] Check slippage and MEV protection during liquidation.

## Phase 4: UX & Frontend Validation
- [ ] **Wallet Compatibility**:
    - [ ] Test MetaMask, Coinbase Wallet, and WalletConnect.
    - [ ] Verify mobile responsiveness on iOS/Android.
- [ ] **Data Consistency**:
    - [ ] Frontend balances match on-chain balances exactly.
    - [ ] Transaction history populates within 2 seconds of confirmation.
- [ ] **Error Handling**:
    - [ ] User-friendly error messages for "Insufficient Balance," "Unsupported Asset," etc.

## Phase 5: Governance & Security Gates
- [ ] **Governance Simulation**:
    - [ ] Propose and execute a parameter change (e.g., LTV cap).
    - [ ] Test the "Emergency Pause" and "Resume" functions.
- [ ] **Security Baseline**:
    - [ ] Slither / Aderyn static analysis run current with zero "High" issues.
    - [ ] Bug bounty program live on testnet (e.g., via Immunefi).
- [ ] **Beta Tester Feedback**:
    - [ ] Collect 50+ user survey responses.
    - [ ] Address 100% of "Critical" UX friction points.

## Milestone Checkpoints (Go/No-Go)
- [ ] **Alpha Checkpoint**: Core flow (Borrow/Repay) 100% bug-free on Sepolia.
- [ ] **Beta Checkpoint**: Liquidation engine and Oracle fallbacks verified under stress.
- [ ] **Mainnet Candidate**: 2+ weeks of "Zero Error" logs in the testnet backend.

---

> [!TIP]
> Each item must be checked and signed off by a lead engineer or risk committee member before proceeding to Mainnet.
