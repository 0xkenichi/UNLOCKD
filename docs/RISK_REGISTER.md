# Vestra v2 risk register

Every risk we know of, where it is handled, how that is verified, and what is left. "Verified" names the
test or document; "Residual" is what a reader should still worry about. Items marked **open** are not
handled yet. Updated 23 October 2026.

Legend for the "Verified" column:
- `proofs` = `packages/risk/test/proofs.test.js` and `docs/RISK_PROOFS.md`
- `stress` = `packages/risk/bin/stress.js`, results in `packages/risk/data/STRESS.md` (two seeds)
- `mirror` = `packages/risk/test/onchainV2.test.js` (contract formula vs proven model)
- `unit` = `packages/contracts/test/VestraV2.t.sol`
- `invariant` = `packages/contracts/test/VestraV2Invariants.t.sol` (stateful fuzzing)

## 1. Model risk: the mathematics

| # | Risk | Handled by | Verified | Residual |
|---|---|---|---|---|
| M1 | Lending more than the collateral is worth with high confidence | CV_α at α_o = 2% (standard) / 0.5% (opt-in); limit also capped by the liquidation line on every day of the term | proofs T1, T7, T8; mirror; unit `testFuzz_T7` | The model is lognormal with a fixed σ. Fat tails are covered by the stress grid, not by the formula. |
| M2 | Interest alone pushing a healthy loan into liquidation (a v1 flaw) | The drift cap: min over 4 intervals of CV_αℓ(g)/(1 + r(g′−t₀)) | proofs T7, T11; mirror (day-by-day); invariant `NoLiquidationWithoutAPriceFall` | None at a fixed price. With an unlock calendar the JS model checks daily; the contract uses one posted drag factor so monotonicity holds. |
| M3 | Credit value falling as tranches vest (found by the proofs; square-root impact is superadditive) | Liquidity cost charged once on the whole position | proofs T5; mirror T5 daily | T5 for the weekly-discretised JS schedule is a numerical check on 5,000 draws, not a closed-form proof. The contract formula is continuous, so T5 holds analytically there. |
| M4 | Contract formula lending more than the proven model | Two Gauss–Legendre panels; 0.25% origination buffer | mirror: never above v2.js on 3,000 draws, 4 seeds | Quadrature error up to −0.4% (conservative side). |
| M5 | Volatility estimate too low for a young or regime-shifting token | σ = max(30-day, 90-day, EWMA) off-chain; per-token σ floor on-chain (≥ 10%, set at listing); volatility-burst and regime-switch families in the grid | stress families `volBurst`, `regime`, `chaos` | σ is frozen per loan at origination by design, so a burst after origination does not tighten health. Priced by the stress results, not by the loan. |
| M6 | Unlock pressure from the whole token's calendar | Drift term in the JS model from documented calendars (27 tokens); one posted `drag` factor on-chain | stress §"Unlock calendars" (lowers LTV ~5%, lowers losses) | The on-chain drag is one number for the term; the risk poster must post the worst 30-day window within the maximum term. Tokens without a documented calendar get no drift. **Policy, not code.** |
| M7 | Overnight gaps of 80–95% | Cannot be prevented by any limit. Sized for by the backstop (opt-in 16%), insurance (2% of pool), junior class (15%), per-token cap (10%) | stress "timing" and "chaos" tables; every-token-at-once pool test ≤ 8.3% after backstop | The junior class and insurance sizing are protocol-level parameters not yet enforced on-chain (see C9). |
| M8 | Correlated crashes across tokens | Historical cohorts by month, ≥ 5 tokens; worst month 1.8% (standard), 1.5% after backstop (opt-in) | stress "Worst month" | 31 tokens, 2019–2026. A future crash can be worse than any in the sample. |
| M9 | Calibration overfit to one random draw | Same verdicts on two independent seeds; acceptance criteria fixed before results were read and revisions recorded in the script | stress `REVISIONS` | Three criteria were revised after the first run (reasons recorded). A fresh seed rerun is cheap: `STRESS_SEED=n node bin/stress.js`. |
| M10 | Borrowers behave worse than modelled | Adversarial borrowers (never cure, walk away) are the baseline; rational borrowers only for the opt-in borrower test | stress factor `borrower` | Borrowers who game timing (borrow just before a known dump) are not modelled; the exposure cap and the drag term are the controls. |

## 2. Contract risk: the code

| # | Risk | Handled by | Verified | Residual |
|---|---|---|---|---|
| C1 | A risk signal, Ω cut or pause making an open loan liquidatable | σ, volume and drag frozen per loan; health reads only the TWAP price; Ω scales new credit only | unit `test_Health_RiskSignalsNeverLiquidateAnOpenLoan`; invariant `NoLiquidationWithoutAPriceFall` under random risk posts and Ω | None known. |
| C2 | Lenders' ERC-4626 shares mispriced (interest captured just in time, or losses hidden) | `lenderClaim()` accrues continuously from Σ P·r·t aggregates; loans marked down to min(claim, CV_αℓ) when liquidation starts | invariant `LenderClaimMatchesTheLoans` (±1 wei per loan); unit interest tests | Between a loan becoming liquidatable and `startLiquidation`, the loss is not yet booked: run a keeper (same as v1). |
| C3 | Loan manager holding stray USDC that someone could extract | It holds only borrowers' unclaimed surpluses; everything else is forwarded in the same transaction | invariant `ManagerHoldsOnlySurpluses` | None known. |
| C4 | Backstop drained or partner withdrawing committed funds | `lock` on opt-in origination; `withdraw` limited to `free`; `draw` only by the set-once loan manager, lock first then free | unit `test_Backstop_PartnerCannotPullLockedFunds`; invariant `BackstopAccounting` | A standard loan's shortfall also draws the token's *free* backstop (not its lock). The partner controls this by what they leave free. State this in partner agreements. |
| C5 | Paydown used to dump collateral or to worsen the loan | Only `PAYDOWN_BUYER_ROLE`; only in breach after the cure window; price = TWAP − 3%; rolling-24 h cap of 2% of frozen volume; the sale must narrow the gap between debt and credit value or it reverts | unit `test_Ladder_PaydownFromVestedTokensWithinTheDailyCap`; invariant (random paydowns) | Buyers are vetted off-chain. A buyer could front-run their own paydown on the open market; the 3% discount and the cap bound the gain. |
| C6 | Partner buyback at a stale price during the 72 h right of first refusal | Partner price = max(debt, fair value at start); the borrower can repay in full at any time during the auction and cancel it | unit `test_Ladder_PartnerBuysBack…`, `test_Ladder_RepayingDuringTheAuctionCancelsIt` | If the price rises during the window the borrower's surplus is below market unless they repay. Documented in the white paper's terms; consider a shorter window per partner. |
| C7 | Auction never clearing, or clearing at zero | Floor at CV_αℓ per round; restarts lower the floor by 10%; never zero; interest stops at auction start | unit `test_Ladder_AuctionFloorsAndRestarts`; invariant `AuctionsWellFormed` | Thin markets for locked claims (white paper, Risks). |
| C8 | Breach timing games: a loan flagged, recovered, then dipping again gets no fresh cure window | `clearBreach` is permissionless and `repay` clears automatically when healthy; liquidation always re-checks live health | unit `test_Ladder_CureWindowThen…` | A borrower who recovers but never clears the flag, then dips again days later, can be liquidated without a new 2-day window. Mitigation: the borrower's monitor (or anyone) calls `clearBreach`. **Accepted; document for borrowers.** |
| C9 | Pool structure the stress test assumed (junior 15%, insurance 2%, token cap 10%) not enforced | Token cap: `tokenExposureCapBps` (10%, max 25%). Insurance: 10% of interest, uncapped. Junior class: **open** (one ERC-4626 class) | unit `test_Borrow_RespectsRateLimitExposureCapAndPause` | **Open.** Until notes and classes ship, losses after backstop and insurance fall on all lenders equally. The white paper's lender table describes v2's target, not the deployed pool. |
| C10 | Fixed-rate loans funded from a floating pool (asset–liability mismatch) | Rate = max(rate now, rate after this loan) + tier premium; borrower sets a maximum | unit `test_Interest_SimpleFixedAndReachesLenders` | **Open:** no term notes yet, so a rate spike after origination is borne by Flex lenders. The yellow paper's 7-day average term is also not implemented. |
| C11 | Streams whose shape the adapter cannot read (Sablier Tranched/Dynamic, Streamflow, generic) | Recorded as one cliff at the end: valued as if nothing vests before then | unit (cliff paths); mirror | Conservative, so safe for lenders; borrowers of such streams get less credit than they could. |
| C12 | Oracle: stale, zero, or manipulated prices | Chainlink only; staleness bound; sequencer check; origination = min(spot, TWAP); health = TWAP; paydown price = TWAP | unit `test_Health_StalePriceOnlyMaturityCanLiquidate`; `RiskInputs_AreBounded` | Chainlink itself. Stale price → only maturity can liquidate (by design), which also means a frozen feed delays a needed liquidation; the stress "chaos" family includes 2–10 day freezes. |
| C13 | Risk poster key compromise | Bounds: σ ∈ [floor, 500%], drag ≥ 5%, volume > 0; inputs expire after 2 days; frozen per loan; Ω is a separate (guardian) key and rises ≤ 5 points per 24 h | unit `test_Omega_CutsAtOnceRisesSlowly`, `RiskInputs_AreBounded` | A compromised poster can inflate volume (lower liquidity cost) and post the σ floor for new loans only. **Open:** the yellow paper's 2-of-3 median quorum is not implemented; use a multisig for the role until it is. |
| C14 | Governor key compromise | Every setter is bounded (fees ≤ 3%, backstop ≥ 16%, exposure ≤ 25%, windows bounded); set-once wiring for pool, adapter, insurance, backstop; no governor withdrawal from insurance or backstop | code review | Governor can list a bad token or whitelist a bad vesting contract. Deploy behind a timelock and multisig (ARCHITECTURE.md). |
| C15 | Reentrancy via token or NFT callbacks | `nonReentrant` on every state-changing entry point; whitelisting policy requires plain ERC-20s; USDC pulled before state used | unit; invariant | A malicious whitelisted token is a governance failure, not a code path. |
| C16 | Arithmetic: ABDK 64.64 overflow, division by zero, rounding | `sqrt`/`exp` inputs bounded by σ ≤ 500%, τ ≤ 4 years + latency; `divu` guarded in `_liquidityCost`; `vestedAt` never divides when `start == end`; rounding on the loan's side (backstop lock rounds up, limit rounds down) | unit vectors (0.01%); fuzz T1/T3/T6/T7 | None known. |
| C17 | Smart-contract risk in general | — | 64 unit tests + 6 stateful invariants here; v1's 35 unchanged; one internal adversarial review (below) | **Open:** no independent audit yet. Required before mainnet (white paper, Risks). |
| C18 | Tokens withdrawn before escrow counted as collateral (found by the internal review, High). For streams recorded as one cliff at the end, the engine valued the whole deposited total | Consumption is now taken from the earliest-vesting tokens first (vested, then the cliff lump, then the start of the linear remainder); only `total − consumed` is ever valued. Same fix in the JS mirror | mirror (2,000 draws: value ≤ spot of what is left; cliff-at-end with 99% withdrawn = 1%); unit `test_Review_WithdrawnBeforeEscrowIsNeverCollateral` | None known. |
| C19 | A breach cleared on a stale price (review, Medium). "No fresh price" was treated as "healthy" by `clearBreach` and the clearing branch of `repay` | `clearBreach` requires a fresh price showing health; `repay` clears only on one and never blocks; a missing price means "not liquidatable", never "healthy" | unit `test_Review_StalePriceCannotClearABreach` | A borrower can still delay their own liquidation only by the feed being stale, which also delays everyone's. |
| C20 | Partner buyback at the debt when no price is available (review, Medium) | No right of first refusal without a price; the auction starts at once from 4× the debt | unit `test_Review_NoPartnerBuybackWithoutAPrice` | None known. |
| C21 | Flash deposit fixing a low 3-year rate and lifting the per-token cap (review, Medium) | Rate = max(rate at 7-day time-weighted utilisation, now, after this loan against current assets, after this loan against time-weighted assets) + premium; cap measured against min(time-weighted assets, assets now). The first version of this fix left the after-loan term unshielded; the regression test caught it. `accrue()` advances both and the pool calls it before every deposit and withdrawal | unit `test_Review_FlashDepositMovesNeitherRateNorCap` | A sustained (days-long) deposit still lowers the rate, which is the rate working as intended. |
| C22 | Paydown blocked because Sablier reverts on a zero withdrawal (review, low) | `collectVested` skips the withdrawal when nothing is withdrawable | unit `test_Review_PaydownWhenNothingNewVested` (the mock now reverts on zero, as Sablier does) | None. |

### Internal adversarial review (23 October 2026)

A separate review pass over the v2 contracts, run before this register was finalised, reported four
findings (one High, three Medium) and one low-confidence observation. All five are fixed above (C18–C22)
with a regression test each. Areas it checked and found sound: lender-claim aggregates, reentrancy
guards and token hooks, set-once wiring and role bounds, ABDK arithmetic ranges, the auction state
machine, oracle fallbacks and the backstop's accounting. It is not a substitute for an independent audit.

## 3. Economic and game-theoretic risk

| # | Risk | Handled by | Residual |
|---|---|---|---|
| E1 | Issuer/partner failing to honour the backstop | Backstop is escrowed USDC locked per loan before the loan opens; not a promise | A partner can stop topping up; new opt-in loans then stop. Standard loans continue. |
| E2 | Partner dumping its own token after holders borrow | Drag term and σ floor set by Vestra at listing; Ω cut by the guardian; exposure cap | Reputational and legal, not code. The purple paper's game theory covers incentives. |
| E3 | Borrowers borrowing before a known dump | Exposure cap per token; the opt-in borrower is disclosed the forced-liquidation rate; the standard tier lends ≤ 19% | A coordinated cohort could still default together; bounded by the cap and absorbed by backstop → insurance → junior. |
| E4 | Lenders exiting ahead of a visible loss | Mark-down at liquidation start; `lenderClaim` continuous | Between liquidatable and `startLiquidation` (C2). |
| E5 | Extorting holders (the founding rule) | Standard tier force-liquidates ≤ 18% of never-curing borrowers on real history; opt-in needs explicit choice and disclosure; surplus always returned; no market dumps | Opt-in borrowers who ignore alerts: about half are liquidated within a year. **Must be disclosed at signing.** |

## 4. Data and operations

| # | Risk | Handled by | Residual |
|---|---|---|---|
| D1 | Unlock calendars wrong or missing | DefiLlama dataset verified against each token's CoinGecko id; keyless Sablier/Hedgey/Streamflow sources identified | Hand-curated for tokens not covered; the risk poster's drag depends on it. |
| D2 | Price history gaps or bad prints | Binance daily closes, full history; suspect reversals flagged, never smoothed | Daily closes stand in for intraday paths in the backtest. |
| D3 | Keeper not running | Anyone can flag, liquidate, restart, bid | Losses booked late (C2). |
| D4 | Testnet-to-mainnet drift | Same tiers in `packages/risk/src/tiers.js` and `CreditEngineV2` constants, checked by `mirror` | Changing any tier number means rerunning the stress test; the constants are hard-coded for that reason. |

## 5. What is not covered anywhere yet

- Independent audit (C17).
- Term and Coupon notes, senior/junior classes, asset–liability matching (C9, C10).
- Quorum for risk posts and Ω (C13).
- The T−30 staged sale before large unlocks.
- Pre-TGE collateral on v2 (stays on v1's `PreTGEOracle`).
- Regulatory review of lending to insiders and of the lender products.
