# Security Roadmap

This roadmap defines the path from MVP security posture to production-grade readiness.

## Security Principles

- Non-custodial by default
- Minimize trusted assumptions
- Defense in depth (contracts, backend, operations)
- Transparent incident handling and remediation

## Phase 0 (Immediate, 0-30 days)

- Enforce CI test gate on PRs
- Add analytics persistence and operational visibility
- Complete internal threat model update for each contract module
- Freeze and document privileged roles
- Add runbook for emergency pause and rollback

Deliverables:

- Updated `docs/SECURITY.md`
- Privileged role matrix
- Incident response runbook

## Phase 1 (Pre-mainnet, 30-60 days)

- Run static analysis (Slither) and triage all findings
- Expand contract tests across core modules (valuation, adapter, loan manager, lending pool, auctions)
- Define coverage threshold policy and enforce in CI
- Execute adversarial scenario tests (oracle failures, slippage spikes, delayed unlock settlement)

Deliverables:

- Static analysis report and resolution tracker
- Coverage report with threshold gates
- Test evidence bundle for reviewers

## Phase 2 (Mainnet readiness, 60-90 days)

- Commission external audit (scope: contracts + critical backend paths)
- Resolve all critical/high issues before production launch
- Publish audit report and remediation log
- Launch responsible disclosure / bug bounty policy

Deliverables:

- Public audit PDF(s)
- Remediation changelog
- Bug bounty policy and disclosure channel

## Operational Security Controls

- Environment and secret rotation policy
- Session/token and rate-limiting verification
- Monitoring and alerting for anomaly detection
- Backup and restore drills for core persistence

## Severity Policy

- Critical: patch or pause protocol before normal operations resume
- High: patch before next release window
- Medium: scheduled remediation within one milestone
- Low: backlog with owner and due date

## Go/No-Go Checklist

The protocol does not proceed to unrestricted mainnet operation unless:

- No unresolved critical vulnerabilities
- All high-severity findings have accepted mitigations
- Emergency controls tested and documented
- Security owners and on-call rotation assigned
