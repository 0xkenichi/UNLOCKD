# Incident Response Runbook

This runbook defines how Vestra responds to production incidents and security events.

## Severity Levels

- Sev 0: active exploit or critical fund risk
- Sev 1: major outage or high-risk protocol malfunction
- Sev 2: degraded service with limited protocol impact
- Sev 3: minor issue with workaround

## Incident Command

Initial roles (can be same person in early stage):

- Incident Commander: coordinates response
- Technical Lead: investigates and mitigates
- Communications Lead: updates users/partners
- Scribe: timeline and action log

## Response Timeline

0-15 minutes:

- Confirm incident scope
- Freeze high-risk actions (pause if needed)
- Open incident channel and assign commander

15-60 minutes:

- Identify affected modules and blast radius
- Apply immediate mitigation (pause adapter/pool, block endpoint, tighten limits)
- Publish first status update

60+ minutes:

- Verify mitigation effectiveness
- Prepare patch or rollback
- Publish ongoing updates until stable

## Emergency Controls

- Contract pause where available
- Disable risky endpoints at API layer
- Temporarily restrict high-risk collateral/pools
- Raise safety thresholds and reduce exposure

## Communication Standard

Status updates must include:

- What happened (known facts only)
- Affected users/systems
- Current mitigation
- Next update ETA

## Recovery and Postmortem

Within 72 hours of resolution:

- Publish postmortem summary
- Include root cause, impact, and timeline
- List remediation actions with owners and due dates
- Track completion in backlog until closed
