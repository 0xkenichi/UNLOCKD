# Frontend Notes

This document outlines the minimal frontend requirements to demo the MVP.

## Core Views
- Borrow simulator (PV + LTV).
- Create loan (escrow + borrow).
- Repay loan (partial/full).
- Settlement status (active/settled/default).

## Wallet Integrations
- RainbowKit for connect/disconnect.
- Wagmi hooks for read/write.

## Suggested Reads/Writes
- Read: `computeDPV`, `loans`, `identityLinked`.
- Write: `createLoan`, `repayLoan`, `settleAtUnlock`.

## UX Hints
- Display borrow limit and worst-case PV.
- Show unlock time countdown.
- Surface repayment progress and remaining debt.
