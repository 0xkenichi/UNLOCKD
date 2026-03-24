# Vestra Protocol — Testnet Execution Runbook
## Exact Step-by-Step: Zero to Working Testnet
> For Antigravity (builder) and QA testers

---

## PREREQUISITES

```bash
# Required installs
node --version   # must be >= 20
foundryup        # installs forge, cast, anvil
# If foundryup not installed:
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Get Sepolia ETH (testnet faucet)
# https://sepoliafaucet.com  OR  https://faucet.quicknode.com/ethereum/sepolia
# You need ~0.5 ETH for all deployments + test transactions
```

---

## PHASE 1: SMART CONTRACT DEPLOYMENT (Sepolia)

### 1.1 — Project Setup
```bash
mkdir vestra-contracts && cd vestra-contracts
forge init .
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
echo "@openzeppelin/=lib/openzeppelin-contracts/" >> remappings.txt
```

### 1.2 — Copy Contracts
Place the following files in `src/`:
- `MockVestingToken.sol`         (from §1 of SMART_CONTRACTS.md)
- `MockSablierStream.sol`        (from §2)
- `LendingPool.sol`              (from §4)
- `VestraWrapperNFT.sol`         (from §5)
- `LoanManager.sol`              (from §6)

Place deployment script in `script/`:
- `DeployTestnet.s.sol`          (from §7)

### 1.3 — Environment
```bash
cp .env.example .env
# Fill in:
# DEPLOYER_PRIVATE_KEY    = your testnet wallet private key (has Sepolia ETH)
# RELAYER_PRIVATE_KEY     = separate wallet for RELAYER_ROLE (can be same as deployer on testnet)
# INSURANCE_FUND_ADDRESS  = any wallet address (receives penalties)
# VALUATION_ENGINE_ADDRESS = already-deployed ValuationEngine on Sepolia
# SEPOLIA_RPC_URL          = your Alchemy/Infura Sepolia RPC
# ETHERSCAN_API_KEY        = for contract verification
# TEST_WALLET_1            = a test wallet address (will receive a mock stream)
```

### 1.4 — Apply ValuationEngine Patch
Add `MAX_STALENESS` guard to existing `ValuationEngine.sol` (see §3 of SMART_CONTRACTS.md).
Re-deploy or upgrade as appropriate.

### 1.5 — Compile & Test
```bash
forge build
forge test -vvv
# All tests must pass before deploy
```

### 1.6 — Deploy
```bash
forge script script/DeployTestnet.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vvvv
```

**CRITICAL:** Copy the console output addresses and update:
1. `.env` (all `*_ADDRESS` vars)
2. `frontend/src/config/contracts.ts` (CONTRACTS[11155111])
3. `packages/backend/.env` (all `*_ADDRESS` vars)

### 1.7 — Verify Deployment Manually
```bash
# Verify LendingPool is wired correctly
cast call $LENDING_POOL_ADDRESS "availableLiquidity()(uint256)" --rpc-url $SEPOLIA_RPC_URL

# Verify deployer seeded 100,000 USDC
# Should return 100000000000 (100,000 USDC in 6-dec)

# Verify test stream was created for TEST_WALLET_1
cast call $MOCK_SABLIER_ADDRESS "getStream(uint256)" 1 --rpc-url $SEPOLIA_RPC_URL
```

---

## PHASE 2: BACKEND SERVICES

### 2.1 — Setup
```bash
cd packages/backend
npm install
cp .env.example .env
# Fill in all values (see §5 of BACKEND_SERVICES.md)
```

### 2.2 — Supabase
```bash
# Install Supabase CLI
npm install -g supabase

supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Run the migration from §1 of BACKEND_SERVICES.md
supabase db push
# Or paste the SQL directly into Supabase Dashboard → SQL Editor
```

### 2.3 — Start Services
```bash
# Option A: Docker (recommended)
docker-compose up --build -d

# Option B: Individual processes
npm run start:price-cache   # Terminal 1 — fills Redis with price candles
npm run start:events        # Terminal 2 — listens to on-chain events
npm run start:vcs-cron      # Terminal 3 — syncs VCS scores
```

### 2.4 — Verify Backend Health
```bash
# Check Redis has price data
redis-cli llen "prices:11155111:0xmLDO_SEPOLIA"
# Should return > 0 after first PriceHistoryCache refresh (5 min)

# Check Supabase collateral_history has rows
# Supabase Dashboard → Table Editor → collateral_history

# Check event listener caught the test stream creation
# Supabase Dashboard → Table Editor → loans
# (Won't have rows yet until a loan is originated through the UI)
```

---

## PHASE 3: FRONTEND

### 3.1 — Setup
```bash
cd packages/frontend
npm install
cp .env.local.example .env.local
# Fill in:
# NEXT_PUBLIC_SEPOLIA_RPC        = your Alchemy Sepolia RPC
# NEXT_PUBLIC_WC_PROJECT_ID      = WalletConnect project ID
# NEXT_PUBLIC_SUPABASE_URL       = your Supabase project URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY  = Supabase anon key
```

### 3.2 — Update Contract Addresses
In `src/config/contracts.ts`, fill in all deployed addresses from Phase 1.

### 3.3 — Start
```bash
npm run dev
# Open http://localhost:3000
```

---

## PHASE 4: END-TO-END TEST FLOWS

Run these in order. Each flow validates a full protocol path.

### TEST FLOW A: Lender deposits USDC

**Actors:** Wallet A (lender, has mUSDC)

```
Step 1: Give Wallet A some mUSDC
  cast send $MOCK_USDC_ADDRESS "mint(address,uint256)" WALLET_A 50000000000 \
    --rpc-url $SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY

Step 2: Navigate to /lend in browser with Wallet A connected

Step 3: Enter amount: 10000, select "30 days"
  Expected: Effective APY shown (should be ~5% if pool is empty / low utilization)

Step 4: Click "Approve USDC"
  Expected: MetaMask opens, confirms approve tx, button changes to "Deposit & Lock"

Step 5: Click "Deposit & Lock"
  Expected: MetaMask confirms, success toast, My Positions shows 1 active deposit

VERIFY:
  cast call $LENDING_POOL_ADDRESS "totalDeposited()(uint256)" --rpc-url $SEPOLIA_RPC
  # Should return 110000000000 (100k from deploy seed + 10k from Wallet A)
```

### TEST FLOW B: Lender tries early withdrawal (penalty test)

```
Step 1: Immediately after Flow A, go to My Positions on /lend
Step 2: Click "Withdraw" on the 30-day deposit
Step 3: Confirm the transaction

VERIFY:
  - Wallet A receives LESS than 10,000 USDC (principal - 5% penalty = 9,500 USDC)
  - Insurance fund receives 500 USDC penalty

  cast call $MOCK_USDC_ADDRESS "balanceOf(address)(uint256)" $INSURANCE_FUND_ADDRESS \
    --rpc-url $SEPOLIA_RPC
  # Should return 500000000 (500 USDC)
```

### TEST FLOW C: Borrower originates a loan

**Actors:** TEST_WALLET_1 (has mLDO stream #1 from deploy script)

```
Step 1: Connect TEST_WALLET_1 in browser

Step 2: Navigate to /borrow
  Expected: VCS badge shows "STANDARD" tier (score not yet synced)

Step 3: Backend: manually trigger VCS sync for TEST_WALLET_1
  curl -X POST http://localhost:3001/api/vcs/sync \
    -H "Content-Type: application/json" \
    -d '{"wallet": "TEST_WALLET_1_ADDRESS"}'
  Expected: VCS score computed, tier set on-chain via RELAYER_ROLE

Step 4: In browser, click "Select Stream" → Stream #1 appears (mLDO, 180 days)
  Expected: dDPV panel shows valuation and max borrow amount

Step 5: Click "Approve Operator"
  Expected: MetaMask asks to approve LoanManager as stream operator

Step 6: Set borrow amount to 50% of shown max borrow. Click "Draw Loan"
  Expected: MetaMask confirms, USDC arrives in TEST_WALLET_1 wallet

VERIFY:
  cast call $LOAN_MANAGER_ADDRESS "getBorrowerLoans(address)(uint256[])" TEST_WALLET_1 \
    --rpc-url $SEPOLIA_RPC
  # Should return [1]

  cast call $WRAPPER_NFT_ADDRESS "ownerOf(uint256)(address)" 1 --rpc-url $SEPOLIA_RPC
  # Should return TEST_WALLET_1

  cast call $MOCK_USDC_ADDRESS "balanceOf(address)(uint256)" TEST_WALLET_1 \
    --rpc-url $SEPOLIA_RPC
  # Should have mUSDC equal to the borrowed amount
```

### TEST FLOW D: Borrower repays loan

```
Step 1: Navigate to /portfolio with TEST_WALLET_1

Step 2: Find active loan. See "Total Owed" = borrowed + accrued interest

Step 3: Click "Repay". Approve USDC spend, confirm repayment tx.

VERIFY:
  - Loan NFT #1 burned (ownerOf reverts with "nonexistent token")
  - Supabase loans table: status = 'repaid'
  - LendingPool.totalBorrowed decreased

  cast call $WRAPPER_NFT_ADDRESS "ownerOf(uint256)(address)" 1 --rpc-url $SEPOLIA_RPC
  # Should REVERT (NFT burned)
```

### TEST FLOW E: Auto-settlement at stream maturity

**Note:** On testnet, fast-forward time using `vm.warp` in a local Anvil fork,
OR use a very short stream duration (e.g., 1 hour) for real Sepolia testing.

```
# Create a short-duration stream for settlement testing:
cast send $MOCK_SABLIER_ADDRESS "createStream(address,address,uint256,uint256,uint256)" \
  TEST_WALLET_2 $MOCK_LDO_ADDRESS 1000000000000000000000 $(date +%s) $(($(date +%s) + 3600)) \
  --rpc-url $SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY

# Originate loan against it (via UI: /borrow)
# Wait 1 hour (or use Anvil to warp time)
# Call settleLoan:
cast send $LOAN_MANAGER_ADDRESS "settleLoan(uint256)" LOAN_ID \
  --rpc-url $SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY

VERIFY:
  - Loan marked settled in Supabase
  - NFT burned
  - LendingPool repaid
```

---

## PHASE 5: BASE SEPOLIA DEPLOYMENT

Repeat Phase 1 with Base Sepolia RPC:
```bash
forge script script/DeployTestnet.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY \
  -vvvv
```

Update `CONTRACTS[84532]` in `frontend/src/config/contracts.ts`.
Add `baseSepolia` chain to wagmi config.

---

## SECURITY CHECKLIST BEFORE SHARING WITH TESTERS

- [ ] ValuationEngine has MAX_STALENESS patch applied
- [ ] Relayer wallet is a SEPARATE key from deployer
- [ ] Insurance fund address is NOT the deployer wallet
- [ ] All contracts verified on Etherscan (users can inspect code)
- [ ] `pause()` tested — Guardian can halt protocol in emergency
- [ ] No contract has mint/admin backdoor accessible post-deploy
- [ ] `.env` with private keys is NOT committed to git
- [ ] Frontend shows correct network (Sepolia, not mainnet) banner

---

## QUICK REFERENCE: Useful Cast Commands

```bash
# Check pool utilization
cast call $LENDING_POOL_ADDRESS "utilizationBps()(uint256)" --rpc-url $SEPOLIA_RPC

# Check current APY (BPS)
cast call $LENDING_POOL_ADDRESS "currentApyBps()(uint256)" --rpc-url $SEPOLIA_RPC

# Check specific loan
cast call $LOAN_MANAGER_ADDRESS "loans(uint256)" 1 --rpc-url $SEPOLIA_RPC

# Check total owed on a loan
cast call $LOAN_MANAGER_ADDRESS "totalOwed(uint256)(uint256)" 1 --rpc-url $SEPOLIA_RPC

# Mint mUSDC to any wallet (deployer key required)
cast send $MOCK_USDC_ADDRESS "mint(address,uint256)" WALLET 1000000000 \
  --rpc-url $SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY

# Create a test stream (deployer key required, mLDO must be approved first)
cast send $MOCK_LDO_ADDRESS "approve(address,uint256)" $MOCK_SABLIER_ADDRESS 100000000000000000000000 \
  --rpc-url $SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY

cast send $MOCK_SABLIER_ADDRESS \
  "createStream(address,address,uint256,uint256,uint256)" \
  RECIPIENT_WALLET $MOCK_LDO_ADDRESS 10000000000000000000000 \
  $(date +%s) $(($(date +%s) + 15552000)) \
  --rpc-url $SEPOLIA_RPC --private-key $DEPLOYER_PRIVATE_KEY
```

---

## WHAT THIS PROVES TO AUDITORS AND INVESTORS

After all 5 test flows pass:

1. **Locking works** — USDC locked, early exit penalizes correctly, insurance fund funded
2. **APY curve works** — utilization drives APY upward mathematically
3. **dDPV computes** — ValuationEngine returns non-zero values with oracle data
4. **Credit limits enforced** — VCS tier controls max borrow on-chain
5. **NFT represents loan** — ERC-721 minted at origination, burned at repayment
6. **Claim rights escrowed** — stream operator approved to protocol at loan time
7. **Repayment clears loan** — principal + interest returned to pool, NFT burned
8. **Settlement auto-triggers** — matured stream settles on-chain permissionlessly
9. **Supabase synced** — all state mirrored off-chain for dashboard and VCS
10. **Cross-chain registry** — same contract suite works on Sepolia + Base Sepolia
