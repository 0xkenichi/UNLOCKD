# Slither Triage (Baseline)

Date: 2026-02-13  
Command:

`slither . --exclude-low --exclude-informational --filter-paths "node_modules|frontend|backend|docs|scripts|deployments"`

## Summary

- Analyzer: Slither `0.11.4`
- Contracts analyzed: 56
- Findings reported: 88
- Context: includes mocks and wrapper helper contracts used in MVP/testnet workflows

## Priority Findings (Actionable First)

## P1 - Reentrancy review required (core protocol paths)

- `LoanManager`: `repayLoan`, `repayWithSwap`, `repayWithSwapBatch`, `settleAtUnlock`
- `BaseAuction`: `claim`

Action:

1. Add explicit Checks-Effects-Interactions notes per function.
2. Confirm nonReentrant coverage is present on externally callable paths.
3. Add tests that exercise callback-capable token/router behavior.

## P2 - Strict equality in auction path

- `DutchAuction.bid`: `amount == currentPrice`

Action:

1. Keep strict equality only if intentional protocol design.
2. Document rationale in contract comments + docs.
3. Consider tolerance or quote-lock mechanism if UX friction is observed.

## P2 - Unchecked/unused return patterns

Observed in wrappers and mocks using direct `IERC20.transfer` / `approve`.

Action:

1. Migrate production-path contracts to `SafeERC20` consistently.
2. Keep mocks simple but annotate non-production usage.
3. Add a follow-up lint rule for unsafe transfer patterns in non-mock contracts.

## P3 - Cache array length optimization

- `LoanManager` batch loop on dynamic arrays.

Action:

1. Cache `length` in local variable for gas/readability consistency.

## P3 - Immutable opportunities

Many state vars can be marked `immutable` (including mocks and wrappers).

Action:

1. Prioritize immutable conversion in core contracts first.
2. Defer mock-only improvements unless needed for gas/readability benchmarking.

## Notable Noise / Scope Notes

- Several findings are from mock contracts and test harnesses.
- These are useful for cleanup but lower priority than core protocol safety paths.

## Next Milestone Checklist

- [ ] Reentrancy threat model note per flagged core function
- [ ] SafeERC20 pass across core + wrappers
- [ ] Dutch auction strict-equality design decision documented
- [ ] Slither rerun with reduced findings and tracked changelog
