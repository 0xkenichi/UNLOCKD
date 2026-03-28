# Admin Operations: Command Center Controls

Vestra implements a "Guardrail" model for admin operations.

## Admin Roles
- **System Admin**: Responsible for contract upgrades and deployment. (7-day Time-lock).
- **Risk Committee**: Can pause the protocol and adjust Omega/LTV parameters instantly.
- **Relayer Admin**: Responsible for managing the Omega AI Watcher infrastructure.

## Critical Operations
### 1. Emergency Pause
- **Enforcer**: `LoanManager.pause()`
- **Effect**: Stops all `createLoan` and `triggerAuction` calls.

### 2. Manual Omega Override
- **Enforcer**: `ValuationEngine.setOmega(address collateral, uint256 newValue)`
- **Effect**: Instantly reduces borrowing capacity if an off-chain risk is detected.

### 3. Revenue Claiming
- **Enforcer**: `VestraVault.collectFees()`
- **Effect**: Sweeps protocol fees to the `$CRDT` distribution contract.
