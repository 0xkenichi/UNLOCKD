# Testing Guide

## Run Tests
- `npm test`

## Coverage
- `npx hardhat coverage`

## Suggested Scenarios
- Full flow: escrow → borrow → repay → settle.
- Default: no repay, settle at unlock, pool repaid.
- Over-borrow rejection (LTV).
- LTV bounds across volatility settings.

## Local Time Travel
Use Hardhat time travel to simulate unlock:
- `evm_increaseTime`
- `evm_mine`
