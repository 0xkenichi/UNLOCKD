; ============================================================
; UNLOCKD Protocol — MeTTa Loan Scorer v1.0
; ============================================================
; Synthesizes borrower reputation, token safety, and market
; context into a single LoanVerdict: APPROVE / CAUTION / BLOCK
;
; Also computes recommended loan parameters (interest, max LTV)
; for the origination facet to consume.
; ============================================================

; Import sibling modules (loaded by MeTTa runtime from brain/)
; (import risk_brain)


; ────────────────────────────────────────────────────────────
; SECTION 1: LOAN RISK SCORE
; ────────────────────────────────────────────────────────────

; LoanRiskScore: 0–100, lower is riskier.
; Components (equal weight):
;   - BorrowerComponent: reputation 0–100
;   - TokenComponent: (10000 - VolDiscount) / 100  → 0-100
;   - MarketComponent: sentiment mapped to 0-100
(= (BorrowerComponent $borrower)
   (ReputationScore $borrower))

(= (TokenComponent $token)
   (let $volDiscount (VolatilityDiscountBps $token)
     (/ (- 10000 $volDiscount) 100)))

(= (MarketComponent $token)
   (let $sent (match &self (MarketSentiment $token $s) $s)
     ; Map sentiment -1.0..1.0 → score 0..100
     (round (* (+ $sent 1.0) 50))))

(= (LoanRiskScore $borrower $token)
   (/ (+ (BorrowerComponent $borrower)
         (TokenComponent $token)
         (MarketComponent $token))
      3))


; ────────────────────────────────────────────────────────────
; SECTION 2: LOAN VERDICT
; ────────────────────────────────────────────────────────────

; LoanVerdict: the final pre-approval recommendation
;   BLOCK  — do NOT originate (flash pump, blacklisted, etc.)
;   CAUTION — originate but with tightened LTV
;   APPROVE — standard origination allowed
(= (LoanVerdict $borrower $token)
   (if (== (IsFlashPumped $token) True) BLOCK
     (let* (($score (LoanRiskScore $borrower $token))
            ($tier  (ReputationTier $borrower)))
       (if (or (< $score 30) (== $tier Tier4-HighRisk)) CAUTION
         (if (< $score 15) BLOCK
           APPROVE)))))

; RecommendedMaxLTVBps: after all adjustments, what LTV cap to use?
(= (RecommendedMaxLTVBps $borrower $token $poolRank)
   (let* (($baseLTV   (BaseRankLTVBps $token))
          ($repAdj    (ReputationLTVBoostBps $borrower))
          ($riskAdj   (NetTokenRiskBps $token))
          ($raw       (+ $baseLTV $repAdj $riskAdj)))
     (max 1000 (min 6000 $raw))))  ; hard floor 10%, hard cap 60%


; ────────────────────────────────────────────────────────────
; SECTION 3: DISTRESS SCORING (Existing Loans)
; ────────────────────────────────────────────────────────────
; Used to proactively identify at-risk open loans before they
; breach liquidation — so the agent can flag them in the UI
; or proactively flash messages to borrowers.

; DistressRisk: 0.0 (healthy) → 1.0 (imminent liquidation)
; Inputs from atom store:
;   (OpenLoan <loanId> <borrower> <token> <principal> <currentLTV> <maxLTV>)
(= (DistressRisk $loanId)
   (let* (($currentLTV (match &self (OpenLoan $loanId $b $t $p $currentLTV $maxLTV) $currentLTV))
          ($maxLTV     (match &self (OpenLoan $loanId $b $t $p $cl $maxLTV) $maxLTV))
          ($ratio      (/ $currentLTV $maxLTV)))
     ; Risk score: 0.0 if LTV is fine, 1.0 if at/above max
     (min 1.0 (max 0.0 (/ (- $ratio 0.7) 0.3)))))

; TriageLevel: human-readable alert level for distressed loans
(= (TriageLevel $loanId)
   (let $risk (DistressRisk $loanId)
     (if (>= $risk 0.9) CRITICAL
       (if (>= $risk 0.7) WARNING
         (if (>= $risk 0.5) WATCH
           HEALTHY)))))
