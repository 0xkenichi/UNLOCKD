# Testing Framework & Standards

Every line of code in Vestra is tested for absolute mathematical and logical correctness.

## Unit Testing (Contracts)
- **Tool**: Hardhat & Mocha.
- **Coverage Goal**: 100% on `ValuationEngine` and `LoanManager`.
- **Command**: `npm test --prefix packages/contracts`

## Integration Testing (E2E)
- **Tool**: Playwright (Frontend) & Custom Node.js scripts (Relayer).
- **Checks**: 
  - Sub-second verification of stealth адрес payouts.
  - Multi-block stress tests for `dDPV` drift.
- **Command**: `npm run test:e2e`

## Fuzzing & Static Analysis
- **Slither**: Run on every PR.
- **Echidna**: Used for checking `dDPV` invariants (e.g., "LTV can never exceed 50%").
