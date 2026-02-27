# Loan Terms and Risk Disclosure — Outline (for counsel and implementation)

**Status:** Outline only. Do not use as final legal document. Have qualified counsel draft and approve the actual Loan Terms before mainnet.

**Purpose:** This outline supports (1) counsel drafting the real Loan Terms and (2) product/UX so the borrow flow can link to one document and use one “read and accept” trigger. See `LEGAL_ADVISORY_MEMO.md` §2.

---

## 1. Document name and scope

- **Title:** Loan Terms and Risk Disclosure (or similar as counsel advises).
- **Scope:** Governs use of Vestra Protocol (UNLOCKD) to **borrow** against escrowed vesting/claim rights. Optionally a separate short doc for **lenders / LPs** (Lender Terms).

---

## 2. Suggested sections (for counsel to turn into legal text)

1. **Definitions**  
   Borrower, collateral, claim rights, DPV, LTV, unlock, settlement, protocol, smart contracts, pool.

2. **What you are doing**  
   You are escrowing your claim rights (vesting/locked tokens) and borrowing stablecoins (e.g. USDC) against the discounted present value (DPV), subject to LTV caps. Repayment and settlement are governed by the **on-chain smart contracts** deployed at [chain and contract addresses]. The protocol is **non-custodial**: it does not take custody of your unlocked tokens before unlock; at unlock, settlement runs automatically (full repay → release; partial/default → seize/liquidate per contract).

3. **Key terms (summary)**  
   - Principal and interest (rate from pool at creation).  
   - Collateral: pledged claim rights; quantity and unlock time.  
   - Repayment: you may repay early (partial or full); at unlock, contract settles.  
   - Default / liquidation: if you do not repay in full by settlement, collateral may be seized and liquidated (e.g. via DEX); you may lose remaining collateral.  
   - Fees: origination and protocol fees as set by governance.  
   - No guarantee of liquidity, price, or recovery.

4. **Optional permissions (voluntary) and how they affect your loan**  
   The protocol may offer multiple “repayment modes” that are **voluntary**:
   - **Maximum permissions (best terms):** You optionally opt into automated repayment and grant the smart contracts the ability to pull from your wallet (limited to whitelisted tokens and limited to what is owed) if needed.  
   - **Minimal permissions (worse terms):** You do not opt in and/or do not grant all requested approvals/delegations; the protocol may still offer a loan, but with **smaller size / lower LTV and/or higher interest/fees** because recovery is less certain.

   Counsel should ensure the terms clearly disclose:
   - Exactly which permissions are requested (e.g. token approvals / delegations).
   - That permissions are optional and revocable (where technically possible).
   - That opting out may reduce eligibility, reduce max borrow, and increase pricing.
   - That opting in may increase max borrow and/or reduce pricing (interest/fees).
   - That the protocol is only authorized to collect **up to the outstanding debt** (principal + interest + fees) and should not seize more than owed.

5. **Risks (plain language)**  
   - **Smart contract risk:** Bugs, exploits, or upgrades could cause loss.  
   - **Oracle risk:** Prices and parameters come from oracles and governance; they can be wrong or changed.  
   - **Liquidation and default:** You can lose collateral if you don’t repay; liquidation may occur at unfavorable prices.  
   - **Protocol pause or upgrade:** Governance may pause or upgrade; your position may be affected.  
   - **Third-party dependencies:** Wrappers, vesting contracts, oracles, and LPs are third-party; their failure can affect you.  
   - **No recourse:** The protocol is code; there is no central party obligated to make you whole.

6. **Eligibility and compliance**  
   You must not use the protocol if you are in a sanctioned jurisdiction or otherwise ineligible under the protocol’s or pool’s policy. You are responsible for your own compliance with local laws.

7. **Disclaimers**  
   - Not legal, tax, or financial advice.  
   - No warranty; protocol provided “as is.”  
   - Use at your own risk; you may lose some or all of your collateral or borrowed funds.  
   - No guarantee of results, liquidity, or accuracy of oracles or parameters.

8. **Limitation of liability**  
   To the maximum extent permitted by law, the protocol, deployers, governors, and affiliates are not liable for any loss (including indirect, consequential, or punitive) arising from your use of the protocol. Cap liability at [amount or “fees paid in the 12 months preceding the claim” or as counsel advises].

9. **Governing law and dispute resolution**  
   [e.g. “Governed by the laws of [Jurisdiction]. Any dispute shall be resolved by binding arbitration in [Seat] under [Rules].” — Counsel to choose.]

10. **Changes to terms**  
   Protocol or front-end operator may update these terms; continued use after notice constitutes acceptance (or: material changes require renewed acceptance — counsel to advise).

11. **Contact / notices**  
    How to receive notices (e.g. via app, docs site, or email). Link to protocol docs and contract addresses.

12. **Contract addresses and “how loans work”**  
    Reference to a canonical page (e.g. docs or app) that lists current chain(s) and contract addresses and a short “How loans work” so the terms tie to the actual code.

---

## 3. Where to host and link

- **Host:** Stable URL, e.g. `https://docs.unlockd.fi/loan-terms` or `https://app.unlockd.fi/terms/loan`.
- **UI:** In the borrow flow, before “Create Loan”:  
  - Short line: “By creating a loan you agree to the Loan Terms and Risk Disclosure.”  
  - Link: “Read the full terms (opens in new tab).”  
  - Checkbox: “I have read and accept the Loan Terms and Risk Disclosure.”  
  - Checkbox must be checked to enable “Create Loan” (and ideally only enabled after user has had a chance to open the link — e.g. “I have read the terms at [link] and accept them”).

---

## 4. References

- `docs/LEGAL_ADVISORY_MEMO.md` — §2 (Loan contract and terms), §3 (bringing out contracts).  
- `docs/LEGAL_IMPLICATIONS.md` — Full legal implications.  
- `docs/CANONICAL_POSITIONING.md` — Protocol name and non-custodial messaging.  
- `docs/WHITEPAPER.md` — Loan lifecycle and enforcement (§8).  
- `docs/integrations/CLAIM_RIGHTS_WRAPPERS.md` — Wrapper and operator (e.g. Sablier) risks to mention in Risk section.
