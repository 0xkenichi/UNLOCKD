# Pilot Operations Playbook

Last updated: 2026-02-13
Owner: Founder office

This playbook defines how to launch and operate a named testnet pilot with weekly reporting.

## Preconditions

- `docs/PILOT_LOI_TEMPLATE.md` adapted and signed (non-binding intent).
- `docs/PILOT_CHECKLIST.md` completed.
- Incident contacts mapped in `docs/INCIDENT_RESPONSE_RUNBOOK.md`.

## Pilot Day 0 Checklist

- Confirm deployment addresses and chain for pilot cohort.
- Confirm one lender wallet and one borrower wallet test path.
- Confirm KPI endpoints:
  - `/api/kpi/dashboard`
  - `/api/analytics`
  - `/api/exports/kpi.csv`
- Create pilot channel and escalation path.

## Weekly Operating Rhythm

Monday:
- Validate dashboard data integrity.
- Review open risk items and assign owners.

Wednesday:
- Mid-week check-in with partner operators.
- Capture funnel drop-offs and user feedback.

Friday:
- Publish KPI report using `docs/WEEKLY_KPI_REPORT_TEMPLATE.md`.
- Publish next-week fixes and owner list.

## Minimum KPI Set

Product:
- Wallet connect to borrow start conversion
- Quote request to loan created conversion
- Median time to funded loan

Risk:
- Average LTV
- Active loans
- Repayment on-time rate
- Default count and severity

Reliability:
- API uptime for pilot-critical endpoints
- Incident count by severity
- Mean time to detect and resolve incidents

## Incident Procedure for Pilot

- Sev 0/1:
  - Trigger incident channel immediately.
  - Apply emergency controls if required.
  - Send partner update within 30 minutes.
- Sev 2/3:
  - Create issue with owner and due date.
  - Include in Friday KPI report.

## Pilot Completion Criteria

- Four consecutive weekly KPI reports published.
- No unresolved critical incidents.
- Partner decision recorded:
  - Expand
  - Hold
  - Stop

## Required Artifacts at Pilot Close

- KPI trend summary (week-over-week)
- Partner feedback summary
- Product fixes completed and deferred
- Recommendation memo for next cohort
