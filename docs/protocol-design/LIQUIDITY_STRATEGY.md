## Liquidity Strategy Overview

Vestra Protocol provides vesting-backed credit infrastructure where lenders gain
liquidity and borrowers gain access to vested tokens and missed sales.

This document outlines multiple liquidity strategies. The initial focus is the
lenders // borrowers matching system. As the protocol scales and the agent
becomes fully autonomous, additional liquidity sources can be layered in.

## Phase 1: Lenders // Borrowers Matching System

- Lenders create pools and define risk preferences (LTV caps, interest, unlock
  windows).
- Borrowers pledge vested tokens as collateral and receive USDC loans.
- Matching is handled by the protocol agent and onchain settlement uses the
  existing lending pool contract.
- This creates immediate liquidity without protocol custody of private keys.

### Phase 1b: Hybrid deposits (on-demand + fixed-term)

To support a more passive lender experience (USD+-style simplicity) while keeping
borrower-side agreements detailed, Vestra supports a hybrid liquidity surface:

- **On-demand deposits** into the main pool (`LendingPool.sol`) with utilization-based
  rate displays as **estimates** (not guarantees).
- **Fixed-term tranche deposits** (`TermVault.sol`) that offer a **minimum return**
  funded by a treasury/reward reserve budget (deposits revert if the vault is not
  prefunded enough to honor the minimum).

## Phase 2: Treasury-Funded Loans (Agent-Led)

Once the agent is live and the matching system is stable, the protocol treasury
can provide credit directly:

- Treasury capital backs loans for qualified borrowers.
- The agent automates underwriting signals and allocates treasury liquidity
  across approved pools.
- Returns flow back to the protocol and can bootstrap higher liquidity depth.

## Phase 3: Community-Led Liquidity Pools

Communities can create pools that match their own vested tokens:

- This provides liquidity without putting sell pressure on the token.
- It is a better option than buybacks for supporting contributors with locked
  allocations.
- Pools can be coordinated by DAOs, founders, or contributor groups.

## Additional Liquidity Ideas (As We Scale)

- Partnership pools with funds and market makers.
- Tranche structures for risk-tiered liquidity.
- Cross-chain liquidity routing once Base and Solana flows are fully aligned.
- Stablecoin reserves or third-party credit facilities.

## Summary

The liquidity strategy is deliberately modular: start with lender-borrower
matching, then expand to treasury-backed lending and community pools, while
adding new liquidity sources as the protocol and agent mature.
