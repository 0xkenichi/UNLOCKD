---
name: vestra_hil_gate
description: Intercepts and requires administrator approval for OpenClawLighthouse votes where the proposed Omega score (omegaBps) is below a specific safety threshold (e.g., < 50% LTV cut).
metadata:
  openclaw:
    requires:
      bins: ["node"]
---

# Vestra HIL Voting Gate Skill

This skill acts as a safety barrier for autonomous risk voting. It intercepts proposed `submitVote` actions and checks the `omegaBps` value.

## Rule
- If `omegaBps >= 5000` (50%+ LTV multiplier allowed): **APPROVED** autonomously.
- If `omegaBps < 5000` (Significant LTV cut): **PENDING** - Sends a WhatsApp approval request to the administrator.

## Usage
- Command: `node index.js <token_address> <omega_bps>`
- Returns: `APPROVED` or `PENDING_APPROVAL` with the reasoning.
