# VestingAdapter — Antigravity Deployment Runbook (Sepolia)

## 1. Pre-deploy checklist

- [ ] Confirm `governor` = Vestra multisig on Sepolia (not an EOA)
- [ ] Confirm `guardian` = ops wallet with fast-response access
- [ ] Confirm `loanManager` = deployed LoanManager address (from contracts.ts)
- [ ] Sablier v2 LockupLinear on Sepolia = `0xd4300c5bC0B9e27c73eBAbDc747ba990B1B570Db`
      (verify on https://docs.sablier.com/contracts/v2/deployments)
- [ ] Run `forge test --match-contract VestingAdapterTest -vvv` — all must pass

---

## 2. Deploy

```bash
forge create \
  contracts/adapters/VestingAdapter.sol:VestingAdapter \
  --constructor-args \
    <GOVERNOR_ADDRESS> \
    <GUARDIAN_ADDRESS> \
    <LOAN_MANAGER_ADDRESS> \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PK \
  --verify \
  --etherscan-api-key $ETHERSCAN_KEY
```

Save the deployed address → update `contracts.ts`:
```ts
11155111: {
  VestingAdapter: "<DEPLOYED_ADDRESS>",
  ...
}
```

---

## 3. Post-deploy cast verification

Replace `$VA` with deployed VestingAdapter address.
Replace `$SABLIER` with Sablier v2 LockupLinear address.

### 3a. Whitelist Sablier

```bash
cast send $VA \
  "setWhitelisted(uint8,address,bool)" \
  0 $SABLIER true \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $GOVERNOR_PK
```

**Expected:** tx success. No revert.

Verify:
```bash
cast call $VA \
  "whitelisted(uint8,address)(bool)" \
  0 $SABLIER \
  --rpc-url $SEPOLIA_RPC_URL
```
**Expected output:** `true`

---

### 3b. Confirm loanManager is set correctly

```bash
cast call $VA "loanManager()(address)" --rpc-url $SEPOLIA_RPC_URL
```
**Expected:** `<LOAN_MANAGER_ADDRESS>`

---

### 3c. Confirm roles

```bash
# GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE")
cast call $VA \
  "hasRole(bytes32,address)(bool)" \
  $(cast keccak "GOVERNOR_ROLE") \
  <GOVERNOR_ADDRESS> \
  --rpc-url $SEPOLIA_RPC_URL
```
**Expected:** `true`

```bash
cast call $VA \
  "hasRole(bytes32,address)(bool)" \
  $(cast keccak "GUARDIAN_ROLE") \
  <GUARDIAN_ADDRESS> \
  --rpc-url $SEPOLIA_RPC_URL
```
**Expected:** `true`

---

### 3d. End-to-end escrow smoke test (testnet)

Assumes you hold a real Sablier testnet stream NFT.

```bash
# 1. Approve VestingAdapter as operator for your Sablier NFT
cast send $SABLIER \
  "approve(address,uint256)" $VA <STREAM_ID> \
  --rpc-url $SEPOLIA_RPC_URL --private-key $BORROWER_PK

# 2. Call escrow() — protocol 0 = SABLIER_V2
cast send $VA \
  "escrow(uint256,address,uint8)(uint256)" \
  <STREAM_ID> $SABLIER 0 \
  --rpc-url $SEPOLIA_RPC_URL --private-key $BORROWER_PK
```

**Expected:** tx success. Emits `EscrowCreated` event.

```bash
# 3. Verify VestingAdapter now owns the NFT
cast call $SABLIER "ownerOf(uint256)(address)" <STREAM_ID> --rpc-url $SEPOLIA_RPC_URL
```
**Expected:** `$VA`

```bash
# 4. Read escrow details (escrowId = 1 on fresh deployment)
cast call $VA \
  "getDetails(uint256)(address,uint256,uint256,address,uint256,bool)" \
  1 \
  --rpc-url $SEPOLIA_RPC_URL
```
**Expected:** token address, non-zero remaining, future unlockTime, borrower address, loanId=0, released=false

---

## 4. Wire LoanManager

See `LoanManager_VestingAdapter_Integration.sol.md` for the exact snippets.

Key steps:
1. Add `VestingAdapter public vestingAdapter` to LoanManager state.
2. In constructor, set `vestingAdapter = IVestingAdapter(_vestingAdapter)`.
3. Replace `createLoan` stub with the integration body.
4. Add `releaseEscrow` call to `repayLoan`.
5. Add `liquidateEscrow` call to `triggerLiquidation`.
6. Re-run `forge test` — all 14 existing tests must still pass.

---

## 5. Severity guide for failures

| Symptom | Severity | Debug |
|---|---|---|
| `NotWhitelisted` on escrow() | MEDIUM | Governor hasn't called setWhitelisted |
| `NotOwner` on escrow() | LOW | User hasn't approved VestingAdapter as operator |
| `StreamCancelled` on escrow() | LOW | User is trying to escrow a cancelled stream |
| `OnlyLoanManager` on linkLoan | HIGH | LoanManager address mismatch — check setLoanManager |
| NFT stuck in adapter | CRITICAL | releaseEscrow/liquidateEscrow not called by LoanManager — check integration |
| Double release succeeds | CRITICAL | CEI violated somewhere — re-audit immediately |
