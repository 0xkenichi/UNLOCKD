# FAQ: Internal Support

## Q: Is the collateral ever moved out of the vesting contract?
**A**: No. Ownership of the claim is transferred cryptographically, but the assets remain in the original smart contract until the unlock date.

## Q: What happens if the collateral token drops to zero?
**A**: The protocol utilizes the **Auto-Hedge Tranche** (yield buffer) to cover lenders. The borrower's other consented assets (Strategic Recourse) may also be seized to cover the principal.

## Q: Can a borrower repay early?
**A**: Yes. Repayment is available at any time. Settle early to stop interest accumulation and reclaim full ownership of the claim.

## Q: How is Omega calculated?
**A**: Omega is an off-chain multivariate result pushed on-chain by the Relayer network. It considers liquidity depth, supply concentration, and on-chain behavioral markers.
