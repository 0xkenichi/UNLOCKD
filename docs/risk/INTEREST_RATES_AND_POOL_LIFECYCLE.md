# Interest Rates and Lending Pool Time / Lifecycle

This document specifies the **interest rate model** and **lending pool time and lifecycle** for the Vestra protocol. It aligns the on-chain implementation (`LendingPool.sol`, `LoanManager.sol`) with product and risk expectations.

---

## 1. Interest Rate Model

### 1.1 Utilization-based tiers

The **main lending pool** (single global pool of USDC deposits and borrows) uses a **three-tier utilization curve**. The borrower rate is determined at **loan creation** from the pool’s current utilization.

| Utilization (of total deposits) | Tier        | Default rate (bps) | Approx APR |
|---------------------------------|------------|--------------------|------------|
| ≤ 40%                           | Low        | 1200               | 12%        |
| > 40% and ≤ 75%                 | Mid        | 1800               | 18%        |
| > 75%                           | High       | 2600               | 26%        |

- **Thresholds** (configurable by owner): `lowUtilizationThresholdBps` (default 4000), `highUtilizationThresholdBps` (default 7500).
- **Rates** (configurable): `lowUtilizationRateBps`, `midUtilizationRateBps`, `highUtilizationRateBps`.
- **Formula**: `utilizationBps = (totalBorrowed * 10000) / totalDeposits`; rate = one of the three rates depending on thresholds.
- **View**: `LendingPool.getInterestRateBps()` returns the current rate in basis points.

### 1.2 Governance and timelock

- **Immediate update** (when timelock is disabled): `setRateModel(lowThreshold, highThreshold, lowRate, midRate, highRate)`.
- **Timelocked update** (when `adminTimelockEnabled`):  
  `queueRateModel(...)` → wait `adminTimelockDelay` (e.g. 1 day) → `executeQueuedRateModel()` or `cancelQueuedRateModel()`.
- Validation (in `_validateRateModel`) ensures thresholds and rates are ordered and within acceptable bounds.

### 1.3 How interest is applied today (LoanManager)

- At **createLoan**, `LoanManager`:
  1. Reads `interestRateBps = pool.getInterestRateBps()`.
  2. Sets **interest** as: `interest = (borrowAmount * interestRateBps) / BPS_DENOMINATOR`.
  3. Adds **origination fee**: `interest += (borrowAmount * originationFeeBps) / BPS_DENOMINATOR` (e.g. 150 bps = 1.5%).
- This interest is **fixed for the life of the loan**: it does **not** compound and is **not** scaled by time to maturity. Repayments apply to interest first, then principal.

**Interpretation**: The current implementation treats the pool rate as a **one-time charge** (e.g. 12% of principal at creation), not as an annualized rate that accrues over time. Documentation that refers to “5–15% APR” or “interest compounds” describes a **target product behavior**; the code currently implements a **flat interest amount** set at origination. For alignment, either:
- **Option A**: Document and communicate the product as “flat fee at origination” (e.g. “up to 26% of principal”) and keep the contract as-is, or  
- **Option B**: Introduce time-based accrual (e.g. interest = f(principal, rateBps, startTime, unlockTime)) and reserve “APR” for that model.

### 1.4 Rate floor and market alignment

Pool rates must be **competitive with the general market** so lenders have incentive to supply liquidity. Design constraints (see session notes in `docs/risk/VESTED_TOKEN_LENDING_SESSION_2026-02-14.md`):

- **General market floor:** If risk-free or low-risk alternatives (e.g. staking USDC) yield around **7%**, the **borrow rate floor** should be at least that; otherwise lenders would deploy capital elsewhere.
- **Vested / lockup lending benchmark:** For 6–12 month lockup or vested collateral, industry benchmarks are around **10%**. Pools targeting vested collateral should ensure minimum returns in that range so lenders are compensated for lockup and risk.
- Governance and rate-model parameters (e.g. `lowUtilizationRateBps`) should be set so that the **effective floor** never falls below the intended minimum (e.g. 700 bps for 7%, or 1000 bps for 10% for vested pools). Document the chosen floor in pool config or risk-parameter policy.

### 1.5 Lender-facing yields: estimates vs guaranteed minimums

There are two distinct lender experiences:

1. **Main pool (variable, estimate-only)** (`LendingPool.sol`)
   - The UI may show a *projection* (e.g. 1 month / 1 year / 4 years / 5 years) using `getInterestRateBps()` as an input.
   - These numbers are **estimates only** and must be labeled as such.
   - Reason: the current on-chain system does not implement pro-rata yield distribution to depositors. Borrow interest is charged at origination in `LoanManager`, and deposits are tracked but not automatically yield-bearing.

2. **Fixed-term tranches (explicit minimum return)** (`TermVault.sol`)
   - A tranche position has a **guaranteed minimum interest amount** computed at deposit time.
   - That guarantee is only valid if the vault is **prefunded** with reward reserves; deposits revert when reward budget is insufficient.
   - Users can (a) claim interest over time, (b) withdraw principal + remaining interest at maturity, or (c) early withdraw principal minus an early-exit fee while forfeiting remaining guaranteed interest.

**Disclosure requirement**: never label `LendingPool.getInterestRateBps()` as a guaranteed APR for depositors. Reserve the term **guaranteed minimum** for fixed-term tranche products where the guarantee is explicitly encoded.

---

## 2. Lending Pool Time and Lifecycle

There are two concepts: the **main liquidity pool** (deposits/borrows) and **community pools** (fundraising then lending).

### 2.1 Main lending pool (no lifecycle)

The core `LendingPool` state is:

- **totalDeposits**, **totalBorrowed**, **deposits[user]**
- **Utilization** changes over time as borrowers draw and repay; **interest rate** from `getInterestRateBps()` changes with utilization.
- There is **no pool “lifecycle”** (no phases, no automatic close). The pool is perpetual; only rate parameters and roles (loan manager, treasuries) can be updated by owner.

### 2.2 Community pool lifecycle

**Community pools** are created with `createCommunityPool(name, targetAmount, maxAmount, deadline, rewardsByBuildingSize)`. They have an explicit **state machine** and **time triggers**.

**States**

| State         | Meaning |
|---------------|--------|
| FUNDRAISING   | Accepting contributions until target or deadline. |
| ACTIVE        | Target met; contributed USDC has been sent to `issuanceTreasury` and counts toward `totalDeposits` (pool liquidity). |
| REFUNDING     | Deadline passed and target not met; contributors can claim refunds. |
| CLOSED        | Pool no longer active; rewards can still be claimed. |

**Transitions and time**

1. **FUNDRAISING → ACTIVE**
   - **Automatic**: when `totalContributed >= targetAmount` (e.g. on the same tx as a contribution that reaches target).
   - **Manual**: anyone can call `activateCommunityPool(poolId)` when `totalContributed >= targetAmount`.
   - On activation: `totalDeposits += totalContributed`, USDC is transferred to `issuanceTreasury`.

2. **FUNDRAISING → REFUNDING**
   - **Time-based**: on any interaction that calls `_syncCommunityPoolState`, if  
     `state == FUNDRAISING && block.timestamp > deadline && totalContributed < targetAmount`  
     then state is set to REFUNDING and `CommunityPoolMarkedRefunding` is emitted.
   - So **deadline** is the hard cutoff: after that, underfunded pools become refundable.

3. **ACTIVE → CLOSED**
   - **Manual only**: `closeCommunityPool(poolId)` by **owner** or **pool creator**.
   - There is **no automatic** closure by time; community pools stay ACTIVE until explicitly closed.

**Time parameters**

- **deadline**: Set at creation; must be `> block.timestamp`. After deadline, underfunded pools move to REFUNDING.
- **targetAmount** / **maxAmount**: Cap on how much can be raised; `maxAmount >= targetAmount`.

**Summary**

- **Lending pool time**: Main pool has no lifecycle; only utilization (and thus rate) changes over time.  
- **Community pool time**: `deadline` drives FUNDRAISING → REFUNDING when target is not met; activation is by target met (no required time window); closure is manual only.

---

## 3. Reference: Contract touchpoints

| Topic                    | Contract        | Functions / storage |
|--------------------------|-----------------|---------------------|
| Utilization & rate       | `LendingPool`   | `utilizationRateBps()`, `getInterestRateBps()`, `low/mid/highUtilization*` |
| Rate governance          | `LendingPool`   | `setRateModel`, `queueRateModel`, `executeQueuedRateModel`, `cancelQueuedRateModel` |
| Interest at issuance      | `LoanManager`   | `createLoan`: uses `pool.getInterestRateBps()`, sets `loan.interest` (flat) |
| Repayment order           | `LoanManager`   | `_applyRepayment`: interest first, then principal |
| Community pool lifecycle  | `LendingPool`   | `createCommunityPool`, `contributeToCommunityPool`, `activateCommunityPool`, `claimCommunityPoolRefund`, `closeCommunityPool`, `_syncCommunityPoolState` |

---

## 4. Related docs

- **Loan lifecycle**: `docs/WHITEPAPER.md` (§ Loan Lifecycle and Enforcement), `docs/TECHNICAL_SPEC.md` (Borrow / Repay and Settle).
- **Liquidity strategy**: `docs/LIQUIDITY_STRATEGY.md` (lender/borrower matching, community pools).
- **Contracts overview**: `docs/CONTRACTS.md` (LendingPool, LoanManager).
- **Risk and valuation**: `docs/RISK_MODELS.md`, `docs/WHITEPAPER.md` (DPV, LTV). Price history (all-time high / all-time low) and how it factors into DPV and LTV are defined in **`docs/RISK_MODELS.md`** (§ Price history: ATH and ATL).
