# Security Notes

This MVP is not audit-ready. Use this checklist before any production deployment.

See also:
- `SECURITY_ROADMAP.md` for readiness milestones.
- `INCIDENT_RESPONSE_RUNBOOK.md` for operational response flow.

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

## Timelock Activation Runbook

Enable admin timelocks immediately after deployment and before opening public flows.

### Recommended Delays
- Testnet: 5-15 minutes (fast iteration with real queue/execute semantics).
- Staging: 1-6 hours.
- Mainnet: minimum 24 hours (prefer 48 hours with multisig governance).

### Contracts Covered
- `LoanManager`:
  - `setTreasuries`, `setLiquidationConfig` become queue/execute when timelock is enabled.
- `ValuationEngine`:
  - `setPriceFeed`, `setTokenPriceFeed` become queue/execute when timelock is enabled.
- `LendingPool`:
  - `setLoanManager`, `setTreasuries`, `setRateModel` become queue/execute when timelock is enabled.
- `VestingAdapter`:
  - `setLoanManager`, `setAuthorizedCaller`, `setUseWhitelist`, `setAllowedVestingContract` become queue/execute when timelock is enabled.

### Post-Deploy Sequence
1. Confirm ownership is the governance multisig (not an EOA hot wallet).
2. Enable timelocks:
   - `LoanManager.setAdminTimelockConfig(true, <delaySeconds>)`
   - `ValuationEngine.setAdminTimelockConfig(true, <delaySeconds>)`
   - `LendingPool.setAdminTimelockConfig(true, <delaySeconds>)`
   - `VestingAdapter.setAdminTimelockConfig(true, <delaySeconds>)`
3. Queue one non-critical config change as a smoke test in each contract.
4. Wait the full delay; execute queued changes; verify events and state.
5. Disable direct owner operational access; enforce multisig + monitoring only.

### Monitoring and Alerts
- Alert on any `...Queued` event in the four contracts above.
- Alert on any admin timelock delay reduction.
- Alert if queued actions execute immediately (should be impossible with timelock enabled).

### Break-Glass Policy
- Keep emergency pause rights in multisig.
- Do not bypass timelock for routine parameter updates.
- If exploit conditions emerge, prioritize pause + incident runbook execution (`INCIDENT_RESPONSE_RUNBOOK.md`).
