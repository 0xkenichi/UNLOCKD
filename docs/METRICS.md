# Metrics and KPI Framework

This document defines the minimum investor-grade measurement framework for UNLOCKD.

## KPI Categories

## 1) Growth

- Unique connected wallets (daily, weekly, monthly)
- Unique borrowers (daily, weekly, monthly)
- Unique lenders (daily, weekly, monthly)
- Returning users (7-day and 30-day retention)

## 2) Liquidity and Credit

- Active TVL in lending pools
- Total originated loan volume
- Average loan size
- Utilization rate by pool

## 3) Risk and Performance

- Default rate (count and notional)
- Liquidation recovery ratio
- Time-to-settlement at unlock
- Delinquency by asset class / unlock horizon

## 4) Product Engagement

- Event funnel conversion:
  - wallet_connect -> valuation_preview -> quote_requested -> loan_created -> loan_repaid
- Drop-off points in borrowing flow
- Identity verification conversion by tier

## 5) Governance and Treasury

- Treasury inflow by source
- Treasury outflow by category
- Governance participation rate
- Proposal pass/fail statistics

## Data Sources

- `/api/analytics` event ingestion
- `/api/activity` on-chain loan events
- `/api/vested-snapshots` risk and collateral snapshots
- Persistence layer (`analytics_events`, `indexer_events`, `snapshots`, `match_events`)

## Event Taxonomy (Minimum)

- `wallet_connect`
- `borrow_start`
- `valuation_preview`
- `quote_requested`
- `quote_accepted`
- `loan_created`
- `loan_repaid`
- `loan_settled`
- `identity_check_started`
- `identity_check_completed`

## Reporting Cadence

- Weekly internal KPI review
- Monthly public performance update
- Quarterly investor/grants metrics memo

## Initial Targets (Pre-mainnet)

- 100+ unique connected wallets
- 25+ quoted borrowing intents
- 10+ successful loan lifecycle completions (create->repay/settle)
- Default rate tracked and explained for every default event

## Governance Requirement

Any material strategy proposal (token, risk, GTM) should include:

- Current KPI baseline
- Expected KPI impact
- Measured KPI outcome after execution window
