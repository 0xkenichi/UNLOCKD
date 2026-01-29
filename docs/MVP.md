# Building the MVP: Credit Markets for Time-Locked Digital Assets
## Protocol MVP Documentation v1.0

Date: January 28, 2026  
Author: Grok (xAI) -- Tailored for Cursor Development

### Overview
This is a comprehensive guide to building a full Minimum Viable Product (MVP) for the protocol. The MVP focuses on core functionality: allowing users to borrow against vested/locked tokens on-chain, with conservative valuation, loan issuance, repayment, and auto-settlement. We'll deploy on Ethereum Sepolia testnet for quick iteration. Since you're using Cursor, this includes tips on leveraging it for Solidity dev (code completions, audits, tests).

The MVP scope is narrow:

In:
- Core contracts
- Basic adapters for common vesting (e.g., OpenZeppelin)
- Risk valuation with Monte Carlo-inspired conservatism
- Lending pool
- Script-based testing

Out:
- Full frontend (use ethers.js scripts for interaction)
- Multi-chain
- Identity module (optional add-on)
- Advanced governance

Aim for audit-ready code.

Estimated build time: 1-2 weeks for a solo dev familiar with Solidity/Hardhat.  
Assumptions: You have basic Solidity knowledge; we'll use Hardhat for dev env.

---

## 1. MVP Goals and Success Criteria
### Core user flow
1. User escrows a vesting position (e.g., from an OpenZeppelin vesting contract).
2. Protocol values it conservatively (DPV with risk discounts).
3. User borrows USDC (or test stablecoin) up to LTV.
4. Interest accrues; repay anytime.
5. At unlock: auto-settle (release or seize).

### Success metrics
- Deploy to Sepolia.
- End-to-end test: Create loan, repay, settle (via time warp in tests).
- Handle defaults securely.
- Basic risk model integration (e.g., fixed params first, then oracle-fed).

### Non-goals
- Production security (get audits post-MVP).
- Tokenomics (add later).
- Real liquidity (use test funds).

---

## 1.5 What Now: Roadmap to a Live MVP
This is a prioritized path from blueprint to a demoable MVP and early pilot.

### Immediate Next Steps (1-7 days)
1. Deploy to Base Sepolia for real addresses:
   - `npx hardhat deploy --network baseSepolia --tags full`
   - Capture `ValuationEngine` and `LoanManager` addresses.
2. Wire addresses into the frontend:
   - Update `frontend/src/App.tsx` with deployed addresses.
   - Run `cd frontend && npm run dev` and connect MetaMask (Base Sepolia).
3. Manual end-to-end flow (short vesting):
   - Create vesting (1-4 hours for test).
   - Escrow, borrow small amount, repay partial/full.
   - Wait unlock, call `settleAtUnlock`.
4. Quick win: Soulbound loan NFT for binding proof.
   - Mint NFT in `createLoan` with loan terms in metadata.
   - Disable transfers (soulbound) and burn on full repay.

### Medium-Term (1-4 weeks)
- Frontend polish: borrow/repay buttons, debt view, LTV preview.
- Pilot feedback: 1-2 test users or a small DAO on Base Sepolia.
- Risk calibration: run Monte Carlo sims quarterly and update sigma/LTV.
- Deploy frontend (Vercel) for easy demo access.

### Longer-Term (1-3 months)
- Add liquidation integration (DEX router) for defaults.
- Multi-chain deployment (Avalanche, Abstract).
- Optional cross-chain reputation (LayerZero/CCIP).
- Governance rollout for parameter tuning (CRDT token + DAO).
- Security: Slither, coverage, and external audits.

### Quick Wins You Can Do Today
- Deploy on Base Sepolia and share addresses.
- Add soulbound NFT mint on `createLoan`.
- Add a borrow button in the frontend (Wagmi write).
- Run a BIO-specific Monte Carlo sim for a pilot deck.

---

## 2. Tech Stack
Build with tools that play well with Cursor's AI features.

| Component | Recommendation | Why | Cursor Tip |
| --- | --- | --- | --- |
| Smart Contracts | Solidity ^0.8.20 | Standard for DeFi; secure features like custom errors. | "Complete this Solidity contract for a DeFi lending pool." |
| Dev Framework | Hardhat | Easy testing, deployment, scripting. Alternatives: Foundry for speed. | "Write a Hardhat test for loan creation." |
| Testing | Chai/Mocha (built-in Hardhat) | Unit + integration tests. | "Add tests for edge cases like default settlement." |
| Oracles | Chainlink Price Feeds | Reliable for MVP; free on testnet. | "Add Chainlink oracle to valuation function." |
| Libraries | OpenZeppelin Contracts | ERC20, vesting adapters, access control. | "Extend OpenZeppelin VestingWallet." |
| Deployment | Hardhat-deploy plugin | Scripted deploys to Sepolia. | "Generate a Hardhat deploy script for multiple contracts." |
| Interaction | Ethers.js (Hardhat scripts) | CLI for interaction; no full UI yet. | "Write an ethers.js script to create a loan." |
| Risk Modeling | Off-chain Python + on-chain fixed-point math | Use Monte Carlo results to inform params. | "Run sims in Cursor's terminal or embed Python snippets." |
| Wallet/Testnet | MetaMask + Sepolia faucet | Free ETH/USDC. | N/A |

### Setup steps
1. Init project: `npx hardhat init`
2. Install deps: `npm i @openzeppelin/contracts @chainlink/contracts hardhat-deploy dotenv chai`
3. Config `.env`: Add `ALCHEMY_API_KEY` (for Sepolia), `PRIVATE_KEY`.
4. In Cursor: Open project, enable AI completions for Solidity files.

---

## 3. Core Contracts to Build
Focus on 4-5 contracts for MVP. Use the pseudocode from the whitepaper as starters -- paste into Cursor and prompt refinements (e.g., "Add reentrancy guards and error handling").

### 3.1 VestingAdapter.sol
Purpose: Interface with external vesting contracts (e.g., OpenZeppelin VestingWallet). Verify locks, escrow claim rights (as NFT or pointer).

Key functions:
- `registerVesting(address vestingContract, uint256 vestingId)` -- Verify and store unlock details.
- `escrow(uint256 collateralId)` -- Transfer claim to protocol (if NFT) or delegate rights.
- `release(uint256 collateralId, address to)` -- Release post-settlement.
- `getDetails(uint256 collateralId)` -- Return quantity, token, unlockTime.

Events: `VestingEscrowed`, `VestingReleased`.

MVP simplifications: Support only linear vesting; whitelist known contracts.

Cursor tip: "Implement an adapter for OpenZeppelin vesting using interface."

### 3.2 ValuationEngine.sol
Purpose: Compute DPV and borrow limits. Integrate Chainlink for price/vol.

Key functions:
- `computeDPV(uint256 quantity, address token, uint256 unlockTime)` -- Returns PV, LTV.

Use fixed-point math (ABDK lib) for exp/sqrt. Incorporate Monte Carlo insights: Use 5th percentile approximations for conservatism.

Risk params: Governance-set (e.g., r=5%, liquidity=0.9, shock=0.95). Hardcode for MVP, add DAO later.

Events: `ValuationUpdated`.

Cursor tip: "Integrate Chainlink price feed and implement exponential discount with ABDKMath."

#### Integrated Risk Curve Table (Monte Carlo sims)
Use this to hardcode/test params. For on-chain, approximate with lookups or formulas. Use linear interpolation between table values for sigma based on token type.

| Time (months) | D_time | Mean_PV (sigma=0.3) | Perc5_PV (sigma=0.3) | Borrow_Limit (sigma=0.3) | Mean_PV (sigma=0.5) | Perc5_PV (sigma=0.5) | Borrow_Limit (sigma=0.5) | Mean_PV (sigma=0.7) | Perc5_PV (sigma=0.7) | Borrow_Limit (sigma=0.7) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 1.000 | 10000.000 | 10000.000 | 3420.000 | 10000.000 | 10000.000 | 3420.000 | 10000.000 | 10000.000 | 3420.000 |
| 3 | 0.988 | 9992.790 | 7735.850 | 2562.980 | 9984.960 | 6427.160 | 2129.400 | 10033.700 | 5288.890 | 1752.280 |
| 6 | 0.975 | 10004.700 | 6901.350 | 2212.750 | 9990.690 | 5279.830 | 1692.850 | 10032.600 | 3914.750 | 1255.160 |
| 9 | 0.963 | 10021.000 | 6301.520 | 1953.080 | 10015.600 | 4420.700 | 1370.140 | 9972.310 | 3058.330 | 947.890 |
| 12 | 0.951 | 10027.900 | 5853.340 | 1751.610 | 10023.800 | 3922.220 | 1173.720 | 10108.800 | 2502.840 | 748.974 |
| 15 | 0.939 | 10029.800 | 5406.060 | 1559.990 | 10009.200 | 3429.270 | 989.557 | 10132.500 | 2023.750 | 583.979 |
| 18 | 0.928 | 10023.400 | 5112.930 | 1420.760 | 10091.000 | 2981.740 | 828.550 | 10032.100 | 1658.950 | 460.981 |
| 21 | 0.916 | 9956.700 | 4845.300 | 1294.600 | 10061.700 | 2645.140 | 706.747 | 10056.700 | 1420.980 | 379.668 |
| 24 | 0.905 | 9981.250 | 4592.600 | 1178.000 | 10059.300 | 2437.430 | 625.201 | 10042.600 | 1149.160 | 294.761 |
| 27 | 0.894 | 9991.330 | 4341.720 | 1067.250 | 10091.800 | 2209.130 | 543.033 | 9904.300 | 1001.020 | 246.063 |
| 30 | 0.882 | 10016.100 | 4123.180 | 969.463 | 10175.900 | 1989.880 | 467.870 | 10287.000 | 908.340 | 213.573 |
| 33 | 0.872 | 10024.000 | 3904.530 | 876.322 | 9935.270 | 1797.060 | 403.327 | 10237.800 | 755.122 | 169.478 |
| 36 | 0.861 | 9949.750 | 3711.320 | 793.296 | 10099.000 | 1655.000 | 353.755 | 9943.890 | 657.094 | 140.454 |

### 3.3 LoanManager.sol
Purpose: Issue/track/settle loans.

Key functions:
- `createLoan(uint256 collateralId, uint256 amount)` -- Check DPV, escrow, mint debt.
- `repayLoan(uint256 loanId, uint256 amount)` -- Reduce debt.
- `settleAtUnlock(uint256 loanId)` -- Timestamp-check; release/seize based on debt.
- `liquidate(uint256 loanId)` -- For defaults (sell to DEX via Uniswap integration).

Struct: `Loan { borrower, amount, interest, collateralId, unlockTime }`.  
Events: `LoanCreated`, `Repaid`, `Settled`, `Seized`.

MVP simplifications: Fixed interest (10% APR); no partial liquidations yet.

Cursor tip: "Add compound interest accrual using block.timestamp."

### 3.4 LendingPool.sol
Purpose: Manage lender deposits, borrows, utilization-based rates.

Key functions:
- `deposit(uint256 amount)` -- Add liquidity (ERC20 approve/transfer).
- `withdraw(uint256 amount)` -- Remove if utilization allows.
- `lend(address to, uint256 amount)` -- Internal for LoanManager.

Interest model: Utilization curve (e.g., 80% optimal, then rate ramps).  
MVP simplifications: Single asset (USDC); no multi-pool.

Cursor tip: "Implement a simple Aave-like lending pool with utilization rate."

### 3.5 Optional: IdentityModule.sol
Defer for MVP v1.1: Stub with wallet-only; add DID later.

Total LOC estimate: 500-800 across contracts (keep modular).

---

## 4. Implementation Steps
1. Setup project (1-2 hours): Hardhat init, install deps, config networks.
2. Build contracts (3-5 days): Start with ValuationEngine (integrate math/oracles), then Adapter, LoanManager, Pool. Use Cursor for boilerplate/errors.
3. Integrate risk models (1 day): Hardcode MC-derived curves; test with table values.
4. Write scripts (1 day): `deploy.js`, `interact.js` (e.g., `node scripts/createLoan.js`).
5. Security checks: Use Slither (install via pip); prompt Cursor: "Audit this contract for reentrancy."

---

## 5. Testing Strategy
### Unit tests
Each function (e.g., DPV calc matches sims).

### Integration
Full flow; use Hardhat's time warp helpers for unlocks.

### Edge cases
Zero-time lock, max LTV, defaults, high vol.

### Coverage
Aim 90%+ (hardhat-coverage plugin).

Example test snippet (paste into Cursor):
```javascript
describe("LoanManager", () => {
  it("creates and settles loan", async () => {
    // Deploy mocks, create vesting, escrow, borrow, advance time, settle
    expect(await loanManager.getDebt(loanId)).to.eq(0);
  });
});
```

---

## 6. Deployment and Pilots
Deploy to Sepolia: `npx hardhat deploy --network sepolia`.  
Verify: Etherscan plugin.  
Pilot: Reach out to small DAOs (e.g., via X: search for "DAO vesting liquidity needs"). Test with mock vesting.  
Monitoring: Use Tenderly for simulations/debug.

---

## 7. Risks and Mitigations
- Oracle failure: Fallback to last good price.
- Math precision: Test fixed-point overflows.
- Upgrades: Use UUPS proxy (OpenZeppelin) for post-MVP fixes.
- Audits: Post-MVP, submit to Code4rena.

---

## 8. Next Steps Post-MVP
- Add frontend (Wagmi/React).
- Integrate identity (Ceramic DIDs).
- Launch tokenomics/DAO.
- Full audits.
- Mainnet.

