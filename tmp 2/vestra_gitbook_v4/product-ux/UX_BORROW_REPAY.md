# UX: Borrow & Repay Flow

The primary interaction engine for the Vestra Protocol.

## The "Perfect Borrow" Flow
1.  **Scan**: Wallet connects and automatically identifies eligible vesting streams (Sablier/Streamflow).
2.  **Analyze**: Real-time `dDPV` displays the max borrowing capacity.
3.  **Select**: User chooses to borrow $USDC.
4.  **Privacy**: User toggles the Stealth Payout.
5.  **Commit**: One transaction confirms the claim assignment and releases the loan funds.

## The Repayment Strategy
- **Partial Repayment**: Users can return partial principal to reduce the LTV and avoid Omega slashes.
- **Auto-Repay from Yield**: Opt-in toggle to use the **Auto-Hedge Tranche** yield to slowly chip away at the interest.
- **Grace Period**: Defaulting on interest alone does *not* trigger liquidation; only failure to repay principal at unlock time activates the Auction.
