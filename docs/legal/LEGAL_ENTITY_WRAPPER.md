# Legal Entity Wrapper — Vestra Protocol

**Version:** V5.0  
**Status:** Strategy Document (Pre-Legal Counsel Review)  
**Audience:** Founder, Operations, Legal Advisors

> [!CAUTION]
> This document is an internal strategic blueprint and not a substitute for qualified legal counsel. All entity formation, contract drafting, and regulatory filings must be reviewed and executed by licensed attorneys in the relevant jurisdictions.

---

## Overview

To ensure that the Vestra Protocol can legally enforce debt obligations on defaulting institutional borrowers, the protocol requires a real-world legal entity structure that serves as the **plaintiff** and **legal counterparty** for off-chain enforcement actions.

---

## Proposed Structure

### Primary Entity: Cayman Islands Foundation Company
- **Purpose:** Hold the protocol's IP, act as the legal face of the protocol, issue governance documents, and serve as the plaintiff in enforcement proceedings.
- **Why Cayman:** The Cayman Islands Foundation Company structure is purpose-built for DAOs — it has no shareholders, can be governed by a council, and limits personal liability. Widely used by Uniswap, Aave, and Compound.
- **Governance:** A small Foundation Council (initially the Founder + 2 independent directors) with major decisions subject to on-chain `veCRDT` holder ratification.

### Secondary Entity (Optional): BVI Special Purpose Vehicle (SPV)
- **Purpose:** Specifically for high-value Tier 3 loan origination and enforcement. The SPV enters into a binding legal framework with Tier 3 borrowers, including jurisdiction clauses and arbitration agreements.
- **Why BVI:** Low overhead, flexible structure, widely recognized for international commercial transactions.

---

## The NFT Debt Ticket System

When a Tier 3 borrower defaults and exhausts all Smart Wallet secondary assets and the grace period expires without response to escalating "Pings", the following process activates:

```
Default Confirmed by Omega Agent
        │
        ▼
Smart Contract mints an "NFT Debt Ticket"
 - Encodes: borrower address, principal owed, interest accrued, timestamp
        │
        ▼
Cayman Foundation (or BVI SPV) purchases the Debt Ticket
 - At a nominal fee (e.g. 1 USDC) to establish legal assignment of debt
        │
        ▼
Foundation serves formal legal notice via the debtor's verified communication channel
 - Email (established during Tier 3 KYC)
 - Physical address (if provided)
        │
        ▼
Foundation litigates or arbitrates in the agreed jurisdiction
```

### NFT Debt Ticket — Contract Spec (Conceptual)
```solidity
struct DebtTicket {
    address borrower;
    uint256 principalOwed;   // in 1e6 USDC
    uint256 interestOwed;    // in 1e6 USDC
    uint256 issuedAt;        // block.timestamp
    bool    legallyAssigned; // true after Foundation purchases
}
```

---

## Regulatory Buffers

To avoid classification as an unregulated shadow bank under MiCA, SEC, or other financial regulations:

| Measure | Implementation |
|---------|----------------|
| Geoblocking | Frontend geo-IP blocks restricted jurisdictions (US retail, UK retail, OFAC sanctioned) |
| Tier 1 / 2 framing | Standard loans are explicitly defined as "peer-to-peer software infrastructure interactions" — the code is the terms |
| Tier 3 compliance portal | Tier 3 Institutional loans are routed through a fully KYC'd portal managed by the Cayman Foundation / BVI SPV |
| No custody narrative | Vestra never holds or custodies user assets — VestingAdapters hold claim rights via the borrower's own authorization |
| Loan Terms v2 | All users accept updated Loan Terms that clearly define the NFT Debt Ticket mechanism and the Foundation's legal rights |

---

## Jurisdiction and Enforcement Policy

| Default Severity | Action | Timeframe |
|-------------------|--------|-----------|
| Minor (< 30 days) | Automated Pings (private), protocol freeze | Days 7-30 |
| Moderate (30-90 days) | Public Pings, veCRDT slash (if any), Debt Ticket minted | Days 30-90 |
| Severe (90-180 days, unresponsive) | Debt Ticket assigned to Foundation, formal legal notice | Days 90-180 |
| Extreme (180+ days, institutional) | International arbitration / litigation | Day 180+ |

**Negotiation Track:** At any point from Day 7 onwards, if the borrower is responsive, Vestra's ops council can engage in a negotiated repayment plan — especially for cases where the underlying vested token has collapsed in value and the borrower has no realistic means of repayment.

---

## Next Steps

1. **Engage Cayman counsel** to form the Foundation Company (cost estimate: $8k–$15k USD, 4–8 weeks).
2. **Draft the NFT Debt Ticket smart contract module** as a separate, upgradeable module on top of `LoanManager`.
3. **Revise Loan Terms and Risk Disclosure** to reference the Foundation's enforcement rights and the NFT Debt Ticket mechanic.
4. **Integrate Tier 3 KYC portal** using Sumsub or Jumio for Proof-of-Life verification.
5. **Geoblocking middleware** to be implemented at the CDN/frontend level (Cloudflare Workers).
