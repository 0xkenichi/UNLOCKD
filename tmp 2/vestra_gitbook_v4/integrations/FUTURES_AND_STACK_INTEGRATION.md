# Futures & Stack Integration

Vestra bridges the gap between spot value and future delivery.

## Hedging the Unlock
Borrowers can use their liquidity payout to open hedging positions on perpetual exchanges (like GMX or dYdX) to protect the value of their remaining vested tokens.
- **Vestra Native Integration**: Future versions will allow a "One-Click Hedge" where the `LoanManager` automatically opens a short position on an integrated DEX to lock in the dDPV.

## Liquidation Futures
Market makers can trade "rights" to future default auctions, creating a secondary market for distressed vesting assets. This provides even deeper liquidity for the protocol's recovery mechanisms.
