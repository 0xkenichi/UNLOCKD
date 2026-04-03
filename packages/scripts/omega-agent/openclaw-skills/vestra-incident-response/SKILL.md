---
name: vestra_incident_response
description: Executes emergency protocol failsafes and notifies DAO multisig upon detecting critical risk events like Flash Pumps or oracle manipulation in Vestra Protocol.
metadata:
  openclaw:
    requires:
      bins: ["node"]
---

# Vestra Incident Response Skill

This skill is used when the Vestra Protocol detects high-risk market conditions (e.g., Flash Pumps, extreme volatility, or oracle deviations).

## Capabilities
1. **Trigger Failsafe**: Runs the protocol's heartbeat failsafe script to pause risky operations.
2. **Multisig Notification**: Sends an on-chain or off-chain notification to the DAO multisig directors.
3. **WhatsApp Alert**: Sends a critical priority message to the protocol administrator.

## Usage
- Command: `node index.js <event_type> <severity>`
- Parameters:
    - `event_type`: The type of risk detected (e.g., "FLASH_PUMP", "ORACLE_STALE").
    - `severity`: Numeric severity (1-10) or string ("CRITICAL", "HIGH").
