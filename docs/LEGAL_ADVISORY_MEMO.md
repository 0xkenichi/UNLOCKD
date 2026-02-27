# Legal Advisory Memo — Vestra Protocol (UNLOCKD)

**To:** Founder / Protocol  
**From:** Legal arm (advisory)  
**Re:** Biggest risks, mainnet readiness, user protection, IP, contracts visibility, and traffic-light areas  
**Date:** 2026-02-14  

**Disclaimer:** This memo is internal advisory only. It is not legal or financial advice and does not create an attorney–client relationship. Engage qualified counsel in each relevant jurisdiction before mainnet launch, token offerings, or material commercial steps.

---

## 1. Single Biggest Risk (Protocol + Users)

**The single biggest risk is: users and LPs suffering loss (bugs, oracle failure, exploit, or misunderstanding of settlement) and then claiming that the protocol, the front-end, or you as founder owed them a duty — and that you breached it.**

Why it’s #1:

- You have a **checkbox** in the Borrow UI: *“I agree to the loan terms and repayment policy”* but **no linked document**. So in practice users are not shown any terms, and there is no clear “contract” they can read or that a court could treat as the agreed terms.
- On-chain, the **LoanManager** and related contracts *are* the mechanical terms (principal, interest, collateral, settlement at unlock). But in many jurisdictions **code alone is not enough** for consumer lending or for a court to say “the user agreed to this.” You need a **readable, accessible set of terms** that the user explicitly accepts (e.g. one clear “I have read and accept” trigger).
- If someone loses money and sues, the first thing they will say is: “I never saw any terms; I just clicked a box.” That exposes the protocol and you to **contract and tort claims** (negligence, misrepresentation, breach of duty).

**So the highest-leverage legal move before mainnet is: introduce a real Loan Terms / Risk Disclosure document and wire it to the borrow flow so that “I agree” means “I have had a chance to read and I accept these terms.”** See §4 and §6 below.

---

## 2. Loan Contract and Terms — What You Should Do

### 2.1 Current state

- **On-chain:** Loan terms exist only inside the smart contracts (principal, interest, collateral, unlock, settlement rules). The user “signs” by sending a transaction; there is no separate legal document.
- **UI:** One checkbox: *“I agree to the loan terms and repayment policy”* with **no link** to any terms. So there is no document to “sign” in a legal sense.

### 2.2 Recommended approach: one document + one trigger

1. **Create a single “Loan Terms and Risk Disclosure” (the “Loan Terms”)** that:
   - States it governs use of the protocol for borrowing (and, if you want, for lending / LP).
   - Summarizes in plain language: what the user is doing (escrowing claim rights, borrowing against DPV, repayment and settlement at unlock), key risks (oracle risk, smart contract risk, liquidation, no guarantee of recovery), and that the protocol is non-custodial and may be paused or upgraded.
   - References the **chain and contract addresses** (or a canonical “contracts” page) so the terms tie to the actual code.
   - Includes **disclaimers**: no advice, no warranty, use at own risk, no guarantee of results.
   - States **governing law and dispute resolution** (e.g. arbitration in a chosen seat).
   - Is **short enough to read** (2–4 pages) or has a one-page “Key terms and risks” summary at the top.

2. **One clear acceptance trigger in the UI:**
   - **Option A (recommended for mainnet):** In the borrow flow, before “Create Loan,” show a block:  
     “By creating a loan you agree to the [Loan Terms and Risk Disclosure]. [Read the full terms (link)].”  
     Require the user to **open the link** (or expand an in-page summary) and then tick: **“I have read and accept the Loan Terms and Risk Disclosure.”**  
     The checkbox should be **disabled until** they have had a chance to read (e.g. “I have read and accept” with link; or “I have read the summary above and the full terms at [link] and accept them”).
   - **Option B (minimal):** At least **link** the existing checkbox to the Loan Terms document so “I agree to the loan terms and repayment policy” points to a URL where the full terms live. Prefer Option A for mainnet.

3. **Keep one “sign” moment:** The single trigger is: **user ticks the box (and, in Option A, has had access to the terms).** The on-chain transaction then becomes the **performance** of that agreement. You do not need a separate e-signature platform for every loan if (a) the terms are clearly offered and (b) acceptance is recorded (e.g. checkbox + timestamp in logs if you want evidence).

4. **Lenders / LPs:** If they deposit into pools via your front-end, they should also accept a short **Lender / LP Terms and Risk Disclosure** (same idea: key terms, risks, disclaimers, one accept trigger). You can do that at first deposit or first use of the app.

**Deliverable:** One canonical **Loan Terms and Risk Disclosure** doc (and optionally Lender Terms), plus UI change so the borrow flow uses the one trigger above. Have counsel in your target jurisdiction(s) review the wording before mainnet.

---

## 3. LOI Explained + “Bringing Out” Contracts So People See What They Sign

### 3.1 What the Pilot LOI is

- **LOI = Letter of Intent.** Your template (`docs/pilot-and-gtm/PILOT_LOI_TEMPLATE.md`) is a **non-binding** letter between UNLOCKD and a **partner** (e.g. a DAO or protocol) that says:
  - We intend to run a **pilot** (scope: network, collateral set, duration, participants).
  - Success criteria (e.g. completion rate, repayment target, no critical incidents).
  - Each side’s responsibilities (partner: cohort, vesting inputs, reviews; UNLOCKD: deployment, KPI snapshots, incident/risk updates).
  - Data/confidentiality: aggregate data unless otherwise agreed; confidential info per bilateral agreement.
  - **Legal notes:** This is **not binding** except as replaced by definitive agreements; **no transfer of ownership or IP**.

So the LOI is **not** a user loan contract. It is a **partner-facing** “we agree to explore a pilot together” document. It is deliberately light so partners don’t need heavy legal review to start; it also **limits your exposure** because it doesn’t commit you to specific SLAs or liability.

### 3.2 “Bringing out” contracts so people see what they’re signing

You asked: *can our contracts be brought out so we can see what people will be signing?*

- **For pilots (partners):** Yes. **Publish the LOI template** (you already have it in the repo). Before a partner signs, send them the **exact** LOI you will use (filled in with their name, scope, dates). So they see the full text. Optionally host a **public** “Pilot LOI template” page (e.g. on the docs site or a dedicated “Legal” or “Pilots” page) so any partner can read it in advance. That way there’s no surprise and you can say “everyone signs the same template.”
- **For users (borrowers/lenders):** The “contracts” they need to see are the **Loan Terms** (and Lender Terms if you add them). So:
  - **Publish** the Loan Terms at a stable URL (e.g. `app.unlockd.fi/terms` or `docs.unlockd.fi/loan-terms`).
  - In the UI, **link** that URL next to the “I agree” trigger and, ideally, show a short summary or “Key terms and risks” so users and you can both point to one place. That way users, you, and counsel can all see exactly what is being accepted.

**Summary:**  
- **LOI** = partner pilot intent; non-binding; no IP transfer. Publish the template and send the filled-in version before signature.  
- **User “contracts”** = Loan Terms (and Lender Terms). Publish them at a fixed URL and wire the borrow (and deposit) flow to that one document with one accept trigger.

---

## 4. Best Next Steps to Become Operational and Move to Mainnet

As the legal arm, the **best next steps** before mainnet are:

| Priority | Step | Owner |
|----------|------|--------|
| 1 | **Draft and publish Loan Terms and Risk Disclosure**; link to borrow UI and use one clear “read and accept” trigger (see §2). | Legal / Founder |
| 2 | **Add Terms of Use (ToS)** for the app/site: access, no warranty, limitation of liability, governing law, dispute resolution. Link in footer and at first use. | Legal / Founder |
| 3 | **Document jurisdiction and eligibility** for any token presale/community sale/airdrop (Presale Execution Checklist); get jurisdiction-specific counsel for offerings. | Legal / Ops |
| 4 | **Harden identity/sanctions:** two-party or logged approval for admin overrides (`sanctionsPass`, verification); publish eligibility and per-wallet caps where relevant. | Ops / Backend |
| 5 | **Publish Pilot LOI** (and any partner-facing terms) so partners see exactly what they sign. | Ops / Legal |
| 6 | **Define governing law and dispute resolution** in Loan Terms and ToS (e.g. arbitration + seat). | Legal |
| 7 | **Keep Risk Committee and governance** tied to rationale + simulation; maintain audit trail for admin and emergency actions. | Risk / Ops |

Mainnet readiness (from your own docs) still depends on: audit closeout, incident runbook tested, and controlled cohort with guardrails — see `CONTROLLED_MAINNET_ROLLOUT.md` and `SECURITY_ROADMAP.md`. The steps above are the **legal** layer that should sit alongside those.

---

## 5. Lawyer View: Threats, Good to Go, Flag Risk, Lawsuits, Protection

### 5.1 Where you could be flagged or sued

| Risk | Why it matters | How to protect |
|------|----------------|----------------|
| **No visible loan terms** | User claims “I never agreed to anything”; consumer or contract claims. | Loan Terms doc + one accept trigger (§2). |
| **Token (CRDT) as investment** | SEC or other regulator treats CRDT as a security; enforcement or private suit. | No investment narrative; utility/governance only; counsel for any sale/airdrop; eligibility + disclaimers. |
| **Lending without licence** | Regulator says you’re doing regulated lending/banking. | Emphasize non-custodial, infrastructure-only; pool-level compliance for regulated jurisdictions. |
| **Sanctions / AML** | User or pool is sanctioned; you’re deemed to have enabled access. | Eligibility and caps; no serving sanctioned jurisdictions; harden admin override of `sanctionsPass`. |
| **Bugs / oracle / exploit** | User or LP loses funds and sues for negligence or breach. | Disclaimers (no warranty, use at own risk); Loan Terms and ToS with limitation of liability; audit trail and runbook. |
| **Identity/admin abuse** | Insider or compromised admin grants “verified” or bypasses sanctions. | Two-party or logged approval; document in RISKS_GAPS and remediation. |
| **Pilot partner dispute** | Partner claims you breached the LOI or a later agreement. | LOI clearly non-binding; definitive agreements with governing law, liability cap, and dispute resolution. |

### 5.2 Where you are in better shape (“good to go” with care)

- **Non-custodial design:** You don’t custody unlocked tokens; settlement is at unlock. Keep saying that everywhere (`CANONICAL_POSITIONING.md`).
- **Risk Committee and governance:** Charter, rationale, transparency, incident notes — good for defensible governance.
- **Pilot LOI:** Non-binding, no IP transfer — limits early partner exposure.
- **Presale checklist and dataroom:** Structure is there; execution (jurisdiction, eligibility, disclosures, recordkeeping) needs to be completed and reviewed by counsel.
- **Technical spec:** You explicitly put “legal agreements, custody, off-chain lending” out of scope; that supports “we are infrastructure, not a bank.”

So: you’re in better shape where you’ve **documented** and **limited** scope; you’re exposed where users or partners **don’t see** clear terms and where **admin/identity** can be abused.

### 5.3 How you protect the protocol and users

- **Protocol:** Strong disclaimers, Loan Terms and ToS with limitation of liability and governing law; no warranty; “use at own risk”; audit trail and governance process; no custody narrative.
- **Users:** Give them **readable terms** and one clear accept moment; explain key risks (oracle, smart contract, liquidation) in the Loan Terms; recommend they only risk what they can afford to lose.
- **Founder:** Same disclaimers; operate through clear governance and documented decisions; avoid personal guarantees or “we will make you whole” language; get D&O or relevant insurance when you scale (counsel can advise).

---

## 6. Tools, Roadmap, and Future Features — Do’s and Don’ts

### 6.1 Current tools and docs

- **Borrow flow:** Add the Loan Terms link and one accept trigger; don’t allow “Create Loan” without acceptance.
- **Identity / KYC:** Optional is fine; if you add **regulated KYC** or pool-level “compliant” mode, document the provider, trust assumptions, and failure modes; don’t promise “we are fully compliant” without counsel.
- **Admin (identity patch, sanctionsPass):** Do not leave single-person override; add two-party or logged approval and review (remediation already says this).
- **Auctions / claim-rights transfer:** When you ship, add a short “Auction / Secondary Market Terms” or fold into Loan Terms (e.g. “selling claim rights”) so users see risks (e.g. no guarantee of execution, price, or liquidity).

### 6.2 Roadmap (Phase 2 / 3, futures, multi-chain)

- **Futures / perps (integration):** Your `FUTURES_AND_STACK_INTEGRATION.md` sensibly keeps futures as **integration** (oracles, backend, optional liquidation path), not you running a derivatives exchange. **Do:** Document in user-facing terms that “hedge your unlock” or similar is informational and links to third-party venues; you don’t operate those venues. **Don’t:** Promise hedging results or imply you’re the counterparty.
- **Multi-chain / new pools:** Each new chain or pool can have different risk (oracles, liquidity). **Do:** Keep risk disclosures and parameter rationale; consider a short “Chain and pool risks” section in Loan Terms or ToS that says parameters and risks can vary by chain/pool.
- **Institutional / compliant pools:** If you add “compliant” interfaces or KYC-gated pools, **do:** Get counsel for those jurisdictions; **don’t** say “fully compliant” without a clear scope (e.g. “compliant for X jurisdiction for Y use case”).

### 6.3 Stay safe in one line

**Do:** One clear Loan Terms + one accept trigger; ToS with disclaimers and liability cap; publish what users and partners sign; harden admin/identity; document rationale for risk and governance.  
**Don’t:** Let users “agree” to terms they can’t read; market CRDT as investment; promise compliance or results; leave single-point control over sanctions/verification.

---

## 7. Smart Contracts and Documentation — Where to Be Careful

- **Contracts:** Your core logic (VestingAdapter, ValuationEngine, LendingPool, LoanManager) is the source of truth for **on-chain** terms. The main legal risk is not the code itself but **users not having a readable, agreed set of terms** that match that behavior. So: document in Loan Terms that the **on-chain contracts** govern mechanics (you can point to contract addresses and a short “How loans work” doc).
- **Wrapper / operator risk (e.g. Sablier):** You already document that the recipient must keep operator approval; if they revoke, settlement can break. **Put that in the Loan Terms or a “Risks” section** so users are told clearly.
- **Oracle and parameter changes:** Timelock and multisig for mainnet are operational musts. From a legal angle, **disclose** in Loan Terms that oracles and parameters can change under governance and that there is no guarantee of accuracy or continuity.
- **No scary “hidden” clauses:** The idea is not to hide anything. Bring the **actual** terms out (Loan Terms, ToS, LOI template) so there are no surprises. That protects you and users.

---

## 8. Intellectual Property — Owning the Primitive and Protecting Vestra

### 8.1 What you want to “own”

- **Product name:** UNLOCKD  
- **Protocol descriptor:** Vestra Protocol  
- **The idea:** Credit / loans against **vested** (and in future **futures**) contracts — i.e. the **primitive** of borrowing against time-locked or claim-based collateral with DPV and settlement at unlock.

### 8.2 How you don’t “own” it (and why that’s normal)

- **Smart contracts:** If they’re open-source (e.g. MIT), anyone can fork and deploy. You **don’t** own the code in the sense of excluding others from using it. You can still **own** branding, patents, and trade secrets (see below).
- **Ideas:** “Loans against vesting” as an abstract idea is generally not copyrightable. You protect the **expression** (code, docs) and the **brand**, and optionally **patents** for specific technical innovations.

### 8.3 How to protect and “own” what you can

| Tool | What it does | Recommendation |
|------|----------------|----------------|
| **Trademark** | Protects UNLOCKD, Vestra (and logos) so others don’t use the same name in a way that confuses users. | Register in key jurisdictions (e.g. US, EU) for “financial services; software; protocol.” Use ® or ™ consistently. |
| **Patent** | Protects specific **inventions** (e.g. DPV curve for vesting, settlement flow, wrapper patterns). | Consider a **patent strategy** with counsel: file on core methods (valuation, settlement, claim-right escrow). That gives you “Vestra owns patents in this space” and leverage for licensing or defence. |
| **Trade secret** | Protects non-public know-how (e.g. risk curves, calibration). | Keep sensitive calibration and internal models confidential; document access and NDAs where relevant. |
| **Copyright** | Protects docs, front-end code (if not all open-source), and other written/visual material. | Use “© [Year] Vestra / UNLOCKD. All rights reserved” (or your entity name) on docs and app. |
| **Licence** | Defines what others may do with your code or brand. | If code is MIT, say so. If you have a **proprietary** front-end or API, use a clear licence (e.g. “use for pilot only” or “no commercial use without licence”). LOI already says no IP transfer. |

### 8.4 “Nobody else builds it” / “We own the idea”

- You **cannot** legally stop someone from building “loans against vesting” as a concept. You **can**:
  - **Brand:** So that “Vestra” and “UNLOCKD” mean you.
  - **Patents:** So that specific technical implementations (your DPV model, your settlement flow, your wrapper design) can’t be copied without licence or risk of infringement.
  - **Speed and execution:** First-mover and community/docs so that “credit against vested tokens” is associated with Vestra.

**Practical next step:** Engage an IP lawyer to (1) file trademarks for UNLOCKD and Vestra in priority jurisdictions, and (2) evaluate patentability of your core valuation/settlement/wrapper innovations and, if appropriate, file. That gives you an “IP licence” in the sense of **having** IP to license (and to enforce against copycats where they infringe).

---

## 9. Grey, White, and Black Areas (Founder and Protocol)

Use this as a quick map: **green = proceed with normal care; amber = proceed with explicit steps (document, counsel, or both); red = do not do until fixed or advised.**

### Green (good to go with normal care)

- Operating as **non-custodial** infrastructure and saying so clearly.
- Using **non-binding LOIs** for pilots and publishing the template.
- **Risk Committee** and governance with rationale and transparency.
- **Testnet** pilots with clear “not production” messaging.
- **Open-source** core contracts with clear licence (e.g. MIT) and your copyright notice.
- **Roadmap** that adds features (futures integration, multi-chain) with **disclosure** (third-party venues, chain/pool risks) and no promise of results.

### Amber (proceed with explicit steps)

- **Mainnet:** Only after Loan Terms + one accept trigger, ToS, and (per your own criteria) audit, runbook, and controlled cohort.
- **Token presale / community sale / airdrop:** Only after jurisdiction and eligibility documented, risk disclosures and disclaimers in place, and counsel review.
- **Identity / KYC:** When you add regulated KYC or “compliant” pools, document provider and trust; get counsel for scope.
- **Partner definitive agreements:** When you move from LOI to a binding deal, include governing law, liability cap, and dispute resolution; counsel to draft or review.
- **Futures / hedging UI:** Link to third-party venues; don’t promise outcomes; add a line in ToS or Loan Terms that hedging is informational and third-party.

### Red (do not do until fixed or advised)

- **Do not** go mainnet with **no** Loan Terms and only a bare “I agree” checkbox with no link.
- **Do not** market CRDT as an investment or with profit expectations without securities counsel.
- **Do not** leave **single-person** admin override on identity/sanctions without two-party or logged process.
- **Do not** promise “fully compliant” or “no risk” anywhere.
- **Do not** allow **sanctioned** jurisdictions or persons in presale or pools without a clear, counsel-approved policy.
- **Do not** sign **binding** partner or investor agreements without governing law, liability cap, and (where appropriate) indemnity and dispute resolution.

---

## 10. Summary for the Founder

- **Biggest risk:** Users (or LPs) losing money and claiming they never agreed to terms or that you owed them more. Fix: **one Loan Terms document + one clear “read and accept” trigger** before Create Loan.
- **LOI:** Partner pilot only; non-binding; no IP transfer. Publish template and send filled-in version so partners see what they sign.
- **User “contracts”:** Publish Loan Terms (and Lender Terms if you add them) at a stable URL; wire the UI so the single trigger is “I have read and accept [link].”
- **Mainnet:** Best next steps = Loan Terms + trigger, ToS, jurisdiction/eligibility for any token event, harden identity/sanctions, define governing law.
- **Protection:** Disclaimers, no warranty, use at own risk, limitation of liability in ToS and Loan Terms; audit trail and governance; no custody narrative.
- **IP:** Own the **brand** (trademarks) and **inventions** (patents) with counsel; you can’t own the abstract “idea” of loans against vesting, but you can own Vestra/UNLOCKD and specific technical implementations.
- **Traffic lights:** Green = non-custodial, LOI, governance, testnet, roadmap with disclosure. Amber = mainnet (after terms + audit), token events (after checklist + counsel), definitive agreements (with law + liability). Red = no mainnet without real terms; no investment narrative for CRDT; no single-point admin on sanctions; no “fully compliant” or “no risk.”

This memo is intended to give you and the protocol a clear legal map: what to do first, what to avoid, and how to keep Vestra and users as safe as the structure allows. Have a qualified lawyer in your operating and target jurisdictions review before you rely on it for mainnet or offerings.
