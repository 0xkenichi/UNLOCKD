# Risk Committee Charter

This charter defines the risk governance process for UNLOCKD protocol parameters and emergency actions.

## Scope

The committee governs risk-related protocol settings, including:

- LTV caps and DPV discount parameters
- Per-asset volatility assumptions
- Oracle staleness and deviation thresholds
- Liquidation guardrails and safety buffers
- Pool-level risk policy constraints

## Objectives

- Protect lender solvency and protocol integrity
- Maintain transparent, evidence-based parameter changes
- React quickly to market stress without bypassing governance accountability

## Membership

Phase 1 target composition:

- 2 protocol engineering leads
- 1 quantitative risk lead
- 1 external security/risk advisor
- 1 community-elected delegate (post-governance activation)

Minimum active members: 3.  
Rotation cadence: every 6 months with public rationale.

## Decision Framework

Any risk parameter change must include:

1. Current parameter and proposed change
2. Rationale tied to observed market behavior
3. Simulation or backtest evidence
4. Estimated impact on borrowers, lenders, and defaults
5. Rollback plan and monitoring thresholds

## Voting and Execution

- Internal committee vote threshold: 3/5 approval
- Public protocol governance vote required for non-emergency permanent changes
- Emergency changes use guardian path with hard expiry (max 7 days) and mandatory retrospective governance vote
- All approved changes pass through protocol timelock before execution

## Emergency Protocol

Emergency triggers include:

- Oracle failure or extreme deviation
- Abnormal default cluster
- Exploit attempt or active attack surface
- Liquidity cascade risk

Emergency action options:

- Pause affected adapters or pools
- Tighten LTV and collateral eligibility
- Raise liquidation safety margins
- Disable specific oracle routes until validation

## Transparency and Reporting

- Publish a risk update after every material change
- Maintain a public parameter history with timestamps
- Publish monthly default, liquidation, and utilization metrics
- Keep an open issue tracker for proposed risk upgrades

## Conflicts and Accountability

- Members must disclose conflicts for affected assets/pools
- Conflicted members abstain from related votes
- Any emergency action requires post-event incident note within 72 hours

## Initial KPIs

- Default rate within approved risk budget
- Liquidation recovery above target threshold
- Zero unresolved critical oracle incidents
- Mean time to mitigation under 60 minutes for emergency events
