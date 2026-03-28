# Technical Spec: Implementable System Spec

This specification defines the exact logic used in the Vestra Protocol Smart Contracts for the v4.0 release.

## 1. dDPV Calculation Logic
The `ValuationEngine` MUST implement the following formula for all live tokens:

$$dDPV = Q \times EWMA(P, t) \times e^{-r \cdot T} \times (1 - V_{historical}) \times \Omega$$

- **Precision**: Calculations are performed in `wad` (18 decimals) using the `ABDKMath64x64` library for exponential and square root operations.
- **Oracle Smoothing**: `EWMA` is calculated over a rolling 30-day window to prevent spot-price manipulation.

## 2. The Omega Multiplier (`Ω`)
The Omega value is an external risk multiplier pushed by the AI Watcher Network.
- **Base Value**: `1.0` (Perfect Safety).
- **Dilution Event**: Drops to `0.2` if the project's multi-sig initiates a massive supply expansion.
- **Liquidity Drain**: Drops proportionally if the `CurrentLiquidity < 1.5 \times TotalOutstandingDebt`.

## 3. Privacy Model (Stealth Flow)
The `LoanManager` supports an opt-in privacy flow satisfying `ERC-5564`.
- **Relayer Role**: Computes `P = H(r \cdot A) \cdot G + B`.
- **Payout**: One-time ephemeral address for the USDC payout.
- **Public Proof**: Relayer emits an `Announcer` event with the ephemeral public key.

## 4. Staged Auction Logic
Triggered at `T-30` (30 days before unlock).
- **Bidding**: Stablecoin commitments against future token claims.
- **Discount Curve**: Starts at 10% discount, decreasing linearly to 2% as the unlock approaches.
- **Waterfall**:
  1. Repay Principal to Lenders.
  2. Repay Interest to Lenders.
  3. Protocol Origination Fees.
  4. Remaining assets returned to Borrower.
