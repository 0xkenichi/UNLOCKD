# Incident Response Runbook

Official procedure for protocol emergencies.

## Severity Levels
- **P0 (Critical)**: Active exploit, loss of funds, or oracle desync.
- **P1 (High)**: Major UI failure, relayer downtime, or LTV calculation errors.
- **P2 (Medium)**: Cosmetic bugs or minor performance delays.

## P0 Response Protocol
1.  **Immediate Action**: Risk Committee triggers `emergencyPause()` on `LoanManager`.
2.  **War Room Initialization**: Private communication channel opened within 15 minutes.
3.  **Forensics**: Analyze the exploit block. Identify if it was a price oracle or logic failure.
4.  **Remediation**: Develop and test the patch locally.
5.  **Recovery**: Deploy the fix via Multi-sig and resume protocol functions.

> [!WARNING]
> During a P0 event, the only official source of information is the Vestra Status Dashboard and the Private Command Center alerts.
