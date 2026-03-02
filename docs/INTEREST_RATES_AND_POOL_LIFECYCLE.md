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
- Optional: If the borrower has voluntarily opted into automated repayment, the protocol may apply a **rate discount and/or LTV boost** configured by governance/owner (see `LoanManager.setAutoRepayConfig`). This is intended to price improved recoverability when the borrower grants the required approvals/delegations.

**Interpretation**: The current implementation treats the pool rate as a **one-time charge** (e.g. 12% of principal at creation), not as an annualized rate that accrues over time. Documentation that refers to “5–15% APR” or “interest compounds” describes a **target product behavior**; the code currently implements a **flat interest amount** set at origination. For alignment, either:
- **Option A**: Document and communicate the product as “flat fee at origination” (e.g. “up to 26% of principal”) and keep the contract as-is, or  
- **Option B**: Introduce time-based accrual (e.g. interest = f(principal, rateBps, startTime, unlockTime)) and reserve “APR” for that model.

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
