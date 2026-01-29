# Security Notes

This MVP is not audit-ready. Use this checklist before any production deployment.

## Threat Model
- Oracle manipulation or outage.
- Liquidation slippage or MEV.
- Incorrect vesting adapter assumptions.
- Pool insolvency due to extreme price shocks.

## Checklist
- Access control review (owner/admin functions).
- Reentrancy protections on token transfers.
- Slippage guards on liquidation swaps.
- Validate decimals for all tokens.
- Emergency pause for adapters and settlements.

## Tools
- Slither (static analysis)
- Coverage thresholds (90%+)
- External audit after MVP validation
