# Audit Vendor RFP Template

Last updated: 2026-02-13
Owner: Founder office

Use this template when requesting smart contract audit proposals.

## Project Summary

- Project: UNLOCKD (Vestra Protocol)
- Objective: external review of core credit protocol contracts and critical assumptions
- Current stage: pre-mainnet controlled rollout planning

## Scope

Primary contracts:
- `contracts/LoanManager.sol`
- `contracts/LendingPool.sol`
- `contracts/VestingAdapter.sol`
- `contracts/ValuationEngine.sol`

Secondary scope (optional tranche):
- auction contracts
- governance contracts
- selected backend critical paths

## Deliverables Requested

- Findings report with severity labels and exploitability notes
- Remediation guidance
- Re-test and closure confirmation
- Final public summary (if available)

## Proposal Questions

- Team credentials and relevant DeFi audit history
- Methodology and tooling used
- Estimated timeline and team allocation
- Re-test process and cost model
- Known exclusions and assumptions

## Selection Criteria

- Depth and quality of protocol-specific reasoning
- Track record in lending protocol audits
- Timeline fit with rollout milestones
- Cost and re-test policy clarity

## Submission Package Provided by UNLOCKD

- Architecture and technical docs
- Current test coverage and CI setup
- Known risk register and previous hardening notes
- Deployment and environment assumptions
