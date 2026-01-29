# Contracts Reference

This is a high-level reference for MVP contracts and their roles.

## `ValuationEngine`
- Computes DPV and LTV using price feeds and risk params.
- Uses conservative discounts (time, volatility, liquidity, shock).
- Outputs `pv` and `ltvBps` for loan sizing.

## `VestingAdapter`
- Validates vesting contracts and escrows claim rights.
- Exposes `getDetails(collateralId)` for quantity + unlock time.
- Releases collateral on settlement.

## `LendingPool`
- Accepts deposits and tracks utilization.
- Transfers loan funds to borrowers.
- Accepts repayments from `LoanManager`.

## `LoanManager`
- Core loan issuance and enforcement.
- Handles interest, repayment, and settlement.
- Executes liquidation (DEX swap) on default.

## Auctions (optional)
- `BaseAuction`: shared auction logic (escrow via `VestingAdapter`, fee handling, finalize + claim at unlock).
- `DutchAuction`: descending price; first taker wins.
- `EnglishAuction`: ascending bids with immediate refunds to previous highest.
- `SealedBidAuction`: commit/reveal first-price; non-winners refunded on reveal, previous highest refunded when outbid.
- `AuctionFactory`: deploys auction instances for a given adapter + USDC pair.

## Mocks (test only)
- `MockUSDC`, `MockPriceFeed`, `MockVestingWallet`, `MockSwapRouter`.
