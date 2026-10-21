---
title: The Vestra Whitepaper (v4.1)
---

# The Liquidity Paradox: Unlocking Time-Locked Value in Web3
## A Non-Recourse Credit Primitive for Vesting Positions

**Version:** 4.1 (corrected revision of v4.0)
**Protocol:** Vestra Protocol
**Author:** Olanrewaju Finch Animashaun
**Date:** October 2026 (v4.0: March 2026)

*Copyright © 2026 Vestra Protocol. The text of this whitepaper may be quoted with attribution. The valuation formulas described here are published so that lenders, auditors and integrators can verify them; they are not claimed as proprietary. The smart contract implementations are licensed under the Business Source License 1.1 (BSL 1.1); the Change Date and the Change License will be stated in the repository's LICENSE file at deployment [to be specified].*

*This document describes a protocol design. It is not an offer of securities, an investment solicitation, or financial advice. Parameters quoted are defaults in the v1 design and may be changed through governance within the bounds described.*

---

### Abstract

Token vesting and lockups align long-term incentives, but they leave holders with assets that have a market price and no present utility. Existing over-collateralised lending markets assume collateral can be sold at any moment, so they generally cannot accept a claim that only becomes transferable at a future date.

Vestra is a lending protocol that accepts escrowed vesting positions as collateral. A borrower deposits the vesting-stream NFT that represents their locked tokens into a non-upgradeable adapter contract and borrows USDC from an ERC-4626 lending pool. The collateral is valued with a bounded, conservative discounted present value (dDPV) formula that discounts for time to unlock, volatility, price manipulation and protocol-level risk, and loans are sized at a fraction of that value set by the vesting contract's risk rank.

Loans are **non-recourse against the escrowed vesting position**: if a borrower defaults, the protocol's only remedy is to auction that position. The protocol has no claim on any other asset in the borrower's wallet. Lender losses that the auction does not cover are absorbed first by an insurance vault funded from interest, and then shared pro rata by all lenders. This paper describes the v1 mechanism as designed, states its risks explicitly, and separates clearly labelled roadmap items from what is implemented.

---

## 1. Introduction: The Inert Capital Problem

Programmable vesting is now standard for founders, contributors, early investors and ecosystem grants. The design goal of vesting—preventing immediate selling—is sound. Its side effect is that holders whose wealth is concentrated in locked tokens cannot use that wealth for working capital, taxes or diversification without selling future claims. In practice these claims are often sold over the counter at substantial discounts to spot price, with counterparty and settlement risk on both sides. The aggregate value of tokens scheduled to unlock each year is large [citation needed: annual token unlock volume estimate and source].

Vestra addresses a narrow version of this problem: it lets the holder of a transferable on-chain vesting position borrow stablecoins against that position, without selling it and without the protocol needing any off-chain enforcement. The design deliberately trades capital efficiency for predictability. Loan-to-value ratios are low, the valuation formula is bounded, and every loss path ends in a documented waterfall.

### 1.1 Scope of v1

The v1 core consists of eight contracts:

| Contract | Role |
|---|---|
| `LendingPool` | ERC-4626 USDC vault. Holds all lender funds. Lends to, and is repaid by, `LoanManager` only. |
| `LoanManager` | The single loan lifecycle contract: borrow, accrue, repay, or default, Dutch auction, settle. The auction is built in, and the NFT stays in escrow until a buyer has paid. |
| `VestingAdapter` | Escrows vesting-stream NFTs (Sablier v2 Lockup, Streamflow EVM wrapper, whitelisted ERC-721 claims) and records the real borrower. |
| `ValuationEngine` | Computes the dDPV of locked collateral and returns the per-rank LTV. |
| `VestingRegistry` | Governor-vetted risk rank (1–3) for each supported vesting contract. |
| `InsuranceVault` | Receives the reserve-factor share of interest; can only pay `LendingPool`. |
| `PreTGEOracle` | Synthetic prices for pre-TGE tokens. The governor sets them; a data signer may move them by at most ±20% per update and at most hourly. The valuation adds a mandatory haircut, a staleness bound and a per-loan borrow cap. |

### 1.2 Custody model

Vestra is not custody-free, and v4.1 states this plainly. During a loan, the borrower's vesting NFT is held in escrow by the `VestingAdapter` contract. The adapter is non-upgradeable, and its link to `LoanManager` can be set only once; no governance role can redirect an escrowed NFT. No person or company holds the NFT or any key that can move it outside the loan lifecycle. Lender USDC is held by the `LendingPool` contract itself, not by an operator. Contract-level custody of this kind removes discretionary human custody; it does not remove smart-contract risk (Section 9). Audit status: independent audit of the v1 core is required before mainnet deployment [audit report reference to be added].

---

## 2. Valuation of Time-Locked Collateral

### 2.1 Price input

For a live, trading token the price used for valuation is the most conservative of three readings:

`P = min(P_spot, P_TWAP, P_EWMA)`

- `P_spot` is the Chainlink feed price.
- `P_TWAP` is a time-weighted average price over a configured window (default one hour).
- `P_EWMA` is an exponentially weighted moving average of observed prices.

Taking the minimum means a short-lived upward manipulation of any one source does not raise the collateral value. A stale or invalid reading causes the valuation call to revert, so no loan can be originated on a stale price. Taking the minimum does not protect against a sustained, genuine price decline, nor against a manipulation that moves all three sources together over the full averaging window; those cases are handled by liquidation (Section 4) and by the loss waterfall (Section 5).

### 2.2 The dDPV formula

With `Q` the quantity of locked tokens read from the vesting stream (never from the caller), the contracts compute:

```
base      = Q · P                                            (USDC, 6 decimals)
pv        = base · e^(−r_rank · T) · (1 − σ/2) · Ω · (1 − drawdown)
ltv       = rankBaseLtv, capped by an optional per-token hard cap
maxBorrow = pv · ltv
```

Each factor is bounded:

- **Time discount `e^(−r_rank · T)`.** `T` is the time to unlock in years and `r_rank` is a discount rate fixed per risk rank: 2% for rank 1, 5% for rank 2 and 10% for rank 3. Continuous discounting means the value of a claim rises smoothly towards `base` as unlock approaches. For a one-year unlock the factor is 0.980, 0.951 and 0.905 for ranks 1, 2 and 3. This term is a time-value and rank-risk discount; it is not a model of price risk, which is handled by the volatility factor and the LTV.
- **Volatility factor `(1 − σ/2)`.** `σ` is a governor-set annualised volatility for the token, clamped to [0, 1] (0–100%). The factor therefore lies in [0.5, 1]. v4.0 wrote this term as `(1 − V_historical)`, which is unbounded and becomes zero or negative for volatile tokens; v4.1 documents the bounded form the contracts implement. Because `σ` is set by governance rather than computed on-chain, its accuracy depends on governance updating it.
- **Protocol risk multiplier `Ω`.** `Ω ∈ [0, 1]`, set by the guardian role (Section 7). Unset means 1. `Ω = 0` means no new credit for that token.
- **Drawdown penalty.** A bounded penalty applied when the current price is below the token's recorded high, capped at a governor-set maximum. It reduces new borrowing capacity for tokens in a sharp decline.

The formula is a conservative underwriting heuristic, not a probabilistic guarantee. v4.0 claimed that loans were capped "below the worst-case 5th percentile outcomes"; no derivation supported that claim and v4.1 withdraws it. Section 2.4 instead gives a worked example so that readers can see what the formula actually produces.

### 2.3 Rank-based LTV and liquidation thresholds

Each supported vesting contract is assigned a risk rank by governance in `VestingRegistry`. The rank reflects the vesting contract's properties (for example whether the stream can be cancelled by its sender) and the token's liquidity profile.

| Rank | Discount rate `r` | Max LTV (of pv) | Liquidation threshold |
|---|---|---|---|
| 1 | 2% | 50% | 65% |
| 2 | 5% | 35% | 50% |
| 3 | 10% | 20% | 35% |

An unranked vesting contract cannot be used as collateral. Governance may set a per-token hard cap below the rank LTV.

### 2.4 Worked example

A borrower holds 100,000 tokens in a rank 2 Sablier stream that unlocks in one year. The token trades at $1.00 on all three price sources. Governance has set `σ = 60%`, `Ω = 1`, and the token is at its recorded high (drawdown penalty 0).

```
base      = 100,000 × $1.00                    = $100,000.00
time      = e^(−0.05 × 1)                      = 0.951229
vol       = 1 − 0.60 / 2                       = 0.70
pv        = 100,000 × 0.951229 × 0.70 × 1 × 1  = $66,586.06
maxBorrow = 66,586.06 × 35%                    = $23,305.12
fee       = 23,305.12 × 0.5%                   = $116.53
received  = 23,305.12 − 116.53                 = $23,188.59
```

The borrower can therefore borrow at most about 23.3% of the spot value of the position. At origination, the loan becomes liquidatable on health grounds when debt exceeds 50% of the liquidation value, that is when the liquidation value falls below 23,305.12 / 0.50 = $46,610.24. Holding `σ`, `T` and the drawdown term constant, that corresponds to a fall of about 30% in the price input. In practice the margin is somewhat smaller, because accrued interest increases debt and the drawdown penalty grows as the price falls, and somewhat larger over time, because the time discount shrinks as unlock approaches.

### 2.5 Pre-TGE collateral

Tokens that have not launched have no market price. For these, `PreTGEOracle` supplies a governor-set synthetic price, and the valuation uses:

`P_preTGE = P_synthetic · (1 − D_uncertainty)`

`D_uncertainty` is a mandatory haircut with a default of 90%, so by default only 10% of the synthetic price is recognised. Each synthetic price carries a timestamp, and a price older than the configured staleness bound cannot be used for origination. Every pre-TGE token must also have a per-loan borrow cap before it can be borrowed against. After governance sets a price, a designated data signer may adjust it by at most 20% per update and at most once an hour, so a compromised signer key cannot move a price sharply.

This is underwriting, not oracle-derived truth. The synthetic price is a governance judgement informed by sources such as recent funding-round valuations, OTC indications and sector comparables; it is not a market price, cannot be verified on-chain, and can be wrong by more than the haircut. Pre-TGE loans should be read as small, discretionary credit lines whose risk rests on the quality of governance's underwriting.

---

## 3. Risk Controls

### 3.1 Origination controls

- The borrower approves the NFT to `VestingAdapter` and calls `LoanManager.borrow(nftContract, streamId, protocol, amount, maturity)`. Quantity, token and unlock time are read from the stream.
- The requested amount must not exceed `maxBorrow`.
- Maturity is chosen by the borrower and may not be later than the stream's unlock time.
- The guardian can freeze origination for a token or set `Ω` below 1 (Section 7).
- The pool can be paused by the guardian.

### 3.2 Interest and fees

- The rate floats with the pool's utilisation curve (a kink model: rates rise gently below a target utilisation and steeply above it). Interest accrues per second on a global borrow index that is brought up to date before every change in utilisation, so no single transaction (for example a flash deposit) can choose the rate for time that has already passed.
- A 0.5% origination fee is paid to the treasury.
- 10% of interest (the reserve factor) is paid to `InsuranceVault`; the remainder accrues to lenders.

### 3.3 Separation of origination and liquidation

Freezes and `Ω` apply to origination only. Liquidation health is computed with `liquidationValue()`, which ignores freezes and `Ω`. This prevents a guardian action from making existing loans liquidatable and also ensures that a frozen token can still be liquidated if its loans become unhealthy.

---

## 4. Liquidation

### 4.1 Triggers

Liquidation is permissionless. Anyone may trigger it when either:

1. `block.timestamp > maturity + gracePeriod` (default grace period: 3 days); or
2. `debt > liquidationValue · liqThreshold[rank]` (65% / 50% / 35% for ranks 1 / 2 / 3).

### 4.2 Dutch auction of the escrowed stream

On liquidation, `LoanManager` opens a linear Dutch auction of the escrowed vesting NFT. Anyone may open the auction once a loan is liquidatable. The price starts at 120% of the greater of the collateral's spot value and the debt, and falls linearly over the auction duration (default 3 days) to a floor of 10% of the start price. If a round ends without a bid, anyone can start a new round from that floor; the price falls across rounds but never jumps to zero. Interest stops accruing when the auction opens. A buyer pays the current price at the time of their transaction, subject to a maximum-price guard they supply, and receives the stream NFT, including the right to the remaining unlocks, together with any vested tokens already withdrawn into escrow. Until a bid lands, the borrower (or anyone) can repay the full debt and cancel the auction. When the auction opens, the loan is immediately carried in the pool at the lower of the lenders' claim and its liquidation value, so lenders who withdraw during the auction bear their share of the expected loss rather than exiting at par.

The protocol does not sell the underlying tokens on the open market. The buyer acquires the future claim and bears its timing and price risk. This avoids a protocol-driven sell-off, but it means recovery depends on there being buyers willing to price a locked claim, which may be scarce for small or illiquid tokens.

### 4.3 Settlement

Auction proceeds are applied in this order:

1. **Debt**: principal and accrued interest are repaid to `LendingPool` (less the reserve share to `InsuranceVault`).
2. **Surplus**: any remaining proceeds are paid to the borrower.
3. **Shortfall**: if proceeds are below the debt, `InsuranceVault` covers the shortfall up to its available balance; any remainder is a loss that lowers the share price for all lenders equally.

### 4.4 Non-recourse

Loans are non-recourse against the escrowed vesting position. After settlement the borrower owes nothing further, and the protocol has no ability or claim to take any other asset from the borrower's wallet. v4.0 described "Strategic Recourse", including seizure of native gas tokens and stablecoins from the borrower's wallet; that contradicted the abstract's non-recourse framing, is not implemented, and has been moved to the roadmap as a research item (Section 10.2).

---

## 5. Lender Protection

### 5.1 The pool

Lenders deposit USDC into `LendingPool` and receive ERC-4626 shares. Interest raises the share price as it accrues (not only when it is paid), and expected losses lower it as soon as a liquidation starts. All lenders in the pool share gains and losses pro rata to their shares. Withdrawals can only be met from USDC that is not currently lent out, so at high utilisation lenders may have to wait for repayments or liquidations before they can withdraw.

### 5.2 Insurance vault

`InsuranceVault` is funded by the 10% reserve factor on interest. It has a single outflow: paying `LendingPool` to cover a liquidation shortfall. It has no governor withdrawal function.

Its limits should be stated clearly:

- It is funded only from interest actually paid, so its balance grows slowly and is smallest early in the protocol's life.
- It is shared across all loans; a single large shortfall, or correlated shortfalls across several loans (for example, a sector-wide crash), can exhaust it.
- It does not hedge collateral price. v4.0 described an "auto-hedge" that diverted loan principal into yield strategies to cover micro-cap crashes; no such mechanism exists, and the insurance vault should not be assumed to cover a severe crash in any collateral token.

### 5.3 Loss waterfall

For any defaulted loan, losses are absorbed in this order: (1) auction proceeds; (2) `InsuranceVault` balance; (3) all lenders pro rata via the share price. Lenders can lose principal.

### 5.4 Measurable design targets

Rather than asserting safety, the protocol commits to publishing the following metrics so that lenders can evaluate performance directly:

- **Origination buffer**: the price decline, at origination, that would make a loan liquidatable (about 30% in the Section 2.4 example), reported per rank.
- **Insurance coverage ratio**: `InsuranceVault` balance divided by outstanding principal.
- **Auction recovery**: clearing price as a percentage of collateral spot value, and time to clear.
- **Realised loss rate**: cumulative written-off losses divided by cumulative principal lent.
- **Utilisation**: share of pool USDC currently lent, which governs withdrawal availability.

---

## 6. Collateral Eligibility

Only vesting contracts in `VestingRegistry` with a rank of 1–3 are accepted. Supported formats in v1 are Sablier v2 Lockup streams, the Streamflow EVM wrapper, and whitelisted generic ERC-721 claims. Ranking is a governance decision and should consider, at minimum: whether the stream sender can cancel or claw back unvested tokens; whether the token issuer can mint, pause or blacklist; on-chain liquidity depth; and oracle availability. A position whose stream can be cancelled by its sender carries the risk that the collateral disappears; such streams should receive the most conservative rank or be excluded.

---

## 7. Governance and Ω

### 7.1 Roles

- **`GOVERNOR_ROLE`** sets risk parameters (ranks, `σ`, per-token caps, pre-TGE prices and haircuts, staleness bounds). In production it is intended to sit behind an OpenZeppelin `TimelockController` controlled by a multisig, so parameter changes are delayed and publicly visible before they take effect.
- **`GUARDIAN_ROLE`** can pause, freeze origination for a token, and set `Ω`.

### 7.2 Hard limits on administrative power

- `LendingPool.loanManager` and `VestingAdapter.loanManager` can each be set once. No role can redirect lender funds or escrowed NFTs.
- `InsuranceVault` has no governor withdrawal.
- `Ω` and freezes affect new origination only; they cannot change an existing loan's liquidation value.

### 7.3 Ω in v1

In v1, `Ω` is a guardian-set, bounded multiplier in [0, 1] per token. It is a manual circuit breaker: if the guardian becomes aware of a risk such as a pending large mint, a liquidity withdrawal, an exploit at the token issuer, or oracle instability, it can reduce or stop new credit for that token. Because `Ω` cannot affect liquidation value, it cannot be used to force liquidations, and it cannot protect loans that are already open.

v4.0 described `Ω` as an "Adaptive Neural Risk Engine" run by AI watcher agents on zero-knowledge coprocessors. That system is not implemented. It is described in Section 10.1 as a research direction.

### 7.4 Residual trust

Users trust that the governor sets `σ`, ranks and pre-TGE prices responsibly, and that the guardian responds to events. A compromised or careless governor could, after the timelock delay, set parameters that permit over-lending against weak collateral. The timelock is the main mitigation: it gives lenders time to withdraw idle funds before a harmful change takes effect.

---

## 8. Tokenomics (Proposal — Not Launched)

**No Vestra token has been launched, and nothing in this section is implemented.** The v1 protocol operates without a native token; origination fees go to a treasury address and the reserve factor goes to `InsuranceVault`.

A future proposal under consideration is a `$CRDT` token with a vote-escrow model (`veCRDT`), in which locked holders would govern risk parameters and direct liquidity between collateral pools, and some share of protocol revenue might be used to acquire and distribute `$CRDT` to `veCRDT` holders. The final design, including whether any revenue-sharing feature is included at all, is subject to legal review in the relevant jurisdictions and may change materially or be abandoned. No return, yield or distribution is promised to any holder or prospective holder.

---

## 9. Risks

This section is not exhaustive.

**Smart-contract risk.** The contracts may contain bugs that allow loss or freezing of lender funds or escrowed NFTs. Non-upgradeability limits administrative abuse but also means bugs cannot be patched in place; a fix requires migration to new contracts. Integrations with Sablier, Streamflow and Chainlink import their risks.

**Oracle risk.** Feeds may become stale (blocking origination), report incorrect prices, or be manipulated. The `min(spot, TWAP, EWMA)` construction limits short upward manipulation but does not prevent losses from a sustained true decline, a downward manipulation that triggers liquidation, or a feed outage during a crash.

**Liquidity at unlock and in auctions.** Locked claims are thin markets. Auction buyers may be few or absent, especially for small tokens, and large unlocks often coincide with price pressure. Recovery may be well below the collateral's notional value, and repeated auction rounds can take the price far below fair value if no bid arrives.

**Token-specific risks.** Vesting streams may be cancellable by their sender; token issuers may mint, dilute, pause, blacklist or upgrade the token; projects may fail entirely. Any of these can reduce collateral value to near zero faster than liquidation can act.

**Parameter and model risk.** `σ`, ranks and pre-TGE prices are set by governance and may be stale or wrong. The dDPV formula is a heuristic and has no proven loss bound.

**Governance and key risk.** Compromise of governor or guardian keys, or of the multisig behind the timelock, could lead to harmful parameter changes, inappropriate pauses, or loss of the guardian's ability to respond.

**Correlation and pool risk.** Losses are socialised across all lenders in the pool. Correlated defaults can exhaust the insurance vault and reduce share price materially. High utilisation can delay withdrawals.

**Regulatory risk.** Lending, stablecoins, and tokenised claims are regulated differently across jurisdictions and the rules are changing. Access to the protocol, or to its interface, may be restricted for some users, and future token or revenue-sharing designs may not be permissible in some jurisdictions.

---

## 10. Roadmap (Not Yet Implemented)

Everything in this section is a future direction. None of it is part of the v1 contracts, and none of it should be relied on when evaluating v1 risk.

### 10.1 Automated Ω (research direction)

We are investigating whether off-chain monitoring agents could propose `Ω` adjustments based on signals such as governance proposals to mint supply, concentration and movement of DEX liquidity, and issuer contract changes, with results verified on-chain (for example through a zero-knowledge coprocessor). Open questions include false-positive rates, manipulation of the inputs, latency, and the cost and maturity of verification. Any such system would retain the v1 constraint that `Ω` affects origination only, and would be introduced behind the guardian role rather than replacing it. Borrower behavioural profiling for pricing, also mentioned in v4.0, is a separate research question with significant fairness and privacy considerations and is not currently planned.

### 10.2 Consented recourse for large loans (research item)

For large loans, a borrower might opt in at origination to give the protocol a limited, pre-agreed claim on specified additional assets, increasing available credit. Implementing this safely requires a smart-account (account-abstraction) module that enforces the consented scope, and legal review of enforceability and consumer-protection implications. Until delivered, all Vestra loans are non-recourse beyond the escrowed position.

### 10.3 Staged pre-unlock auctions

Auctioning the escrowed claim in tranches ahead of unlock (for example from T−30 days) so that lender capital is settled before unlock-day volatility.

### 10.4 Time-released liquidation

Selling unlocked collateral gradually with stop-loss limits, as an alternative to auctioning the whole stream, where market depth makes this preferable.

### 10.5 Other items

Community-curated or isolated lending pools; staking; and the token proposal in Section 8, subject to legal review.

---

## 11. Conclusion

Vestra v1 is a deliberately narrow credit primitive: escrow a vesting position in a non-upgradeable contract, value it with a bounded and published formula, lend a conservative fraction of that value from an ERC-4626 pool, and, on default, auction the position with a documented loss waterfall. Its protections are concrete and limited—low LTVs, conservative price inputs, a guardian circuit breaker that cannot touch open loans, an insurance vault that can only pay lenders, and administrative roles that cannot redirect funds. Its risks are real and are stated in Section 9. We expect the protocol to earn trust through audited code, published metrics and observed loss performance rather than through claims, and we will revise this paper as the roadmap items are either delivered or set aside.

---

## Changes from v4.0

1. **Recourse**: v4.0's abstract promised non-recourse optionality while §4.2 described full recourse and wallet seizure. v4.1 is consistently non-recourse against the escrowed position; consented recourse moved to the roadmap as a research item requiring a smart-account module and legal review.
2. **Custody**: replaced "No custody" with an accurate description—NFT escrowed in a non-upgradeable adapter contract, USDC held by the ERC-4626 pool contract, no person or company holding either.
3. **Absolute claims removed**: "unbreakable", "better-than-perfect", "guarantees absolute mathematical safety", "mathematically unexploitable", "no exploits" and similar wording replaced with measurable design targets (§5.4) and an explicit Risks section (§9).
4. **Valuation formula**: `(1 − V_historical)` replaced with the bounded `(1 − σ/2)`, `σ ∈ [0,1]`; per-rank discount rates (2/5/10%), `P = min(spot, TWAP, EWMA)`, the drawdown penalty, `Ω ∈ [0,1]`, rank LTVs (50/35/20%) and liquidation thresholds (65/50/35%) documented; unsupported "5th percentile" claim withdrawn and replaced with a worked example.
5. **Ω**: now described as a guardian-set, bounded, origination-only multiplier; AI watcher network and ZK coprocessor moved to the roadmap as a research direction.
6. **Pre-TGE**: described as governor-set synthetic pricing with a mandatory haircut (default 90%) and staleness bound, explicitly labelled as underwriting rather than oracle truth.
7. **Liquidation**: documents the implemented Dutch auction of the escrowed NFT and settlement waterfall; T−30 staged tranche auctions and time-released liquidation with stop-losses moved to the roadmap.
8. **Lender protection**: "auto-hedge" claim replaced with the real 10% reserve-factor insurance vault, with its limits stated.
9. **Tokenomics**: `$CRDT`/`veCRDT` reduced to a clearly labelled, not-launched proposal subject to legal review; no yield promises.
10. **Market sizing**: unsourced "trillions of dollars" removed; a [citation needed] marker left in its place.
11. **Licensing**: BSL 1.1 with Change Date and Change License to be specified; "proprietary IP" language about the published formulas removed.
