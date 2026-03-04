; ============================================================
; UNLOCKD Protocol — MeTTa Risk Brain v1.0
; ============================================================
; This file defines the core symbolic reasoning rules for the
; UNLOCKD coprocessor. The MeTTa runtime evaluates these rules
; over the atom store (populated by mettaclaw.js) to produce
; Omega multiplier recommendations pushed back on-chain.
;
; Atom Store Schema (populated by mettaclaw.js):
;   (BorrowerRepaid    <addr> <count>)
;   (BorrowerDefaulted <addr> <count>)
;   (CollateralRank    <token> <rank>)   ; 1=Flagship 2=Premium 3=Standard
;   (TokenVolatility   <token> <vol>)    ; 0-100 integer
;   (MarketSentiment   <token> <score>)  ; -1.0 to 1.0 float
;   (LiquidityDepth    <token> <usd>)    ; max USD borrowable w/ <5% slippage
;   (FlashPumpDetected <token> True/False)
;   (LiquidationRate   <token> <rate>)   ; 0.0-1.0 recent liq rate
;   (PoolUtilization   <pool-rank> <util>) ; 0-10000 bps
; ============================================================


; ────────────────────────────────────────────────────────────
; SECTION 1: BORROWER REPUTATION ENGINE
; ────────────────────────────────────────────────────────────

; ReputationScore: 0–100. Higher = more trustworthy.
; Formula: (repaid / (repaid + defaulted)) * 100
; Edge: if no history, return 50 (neutral baseline).
(= (ReputationScore $borrower)
   (let* (($repaid   (match &self (BorrowerRepaid $borrower $r) $r))
          ($defaulted (match &self (BorrowerDefaulted $borrower $d) $d))
          ($total    (+ $repaid $defaulted)))
     (if (== $total 0)
       50   ; neutral for new borrowers — no history yet
       (/ (* $repaid 100) $total))))

; ReputationTier: classify into tiers for UX display
(= (ReputationTier $borrower)
   (let $score (ReputationScore $borrower)
     (if (>= $score 90) Tier1-Elite
       (if (>= $score 70) Tier2-Trusted
         (if (>= $score 50) Tier3-Standard
           Tier4-HighRisk)))))

; LTV boost in BPS from good reputation (max +1000 = +10%)
; Elite borrowers get full reward; high-risk pay penalty via lower cap.
(= (ReputationLTVBoostBps $borrower)
   (let $score (ReputationScore $borrower)
     (if (>= $score 90) 1000
       (if (>= $score 70) 500
         (if (>= $score 50) 0
           -500)))))   ; negative = LTV reduction for risky borrowers


; ────────────────────────────────────────────────────────────
; SECTION 2: TOKEN RISK CLASSIFICATION
; ────────────────────────────────────────────────────────────

; Base LTV per collateral rank (bps)
(= (BaseRankLTVBps $token)
   (let $rank (match &self (CollateralRank $token $r) $r)
     (if (== $rank 1) 5000   ; Flagship: 50%
       (if (== $rank 2) 3500 ; Premium: 35%
         2000))))             ; Standard: 20%

; Volatility discount in bps: each vol point costs 20 bps LTV
; Capped at 3000 bps (30%) maximum discount
(= (VolatilityDiscountBps $token)
   (let $vol (match &self (TokenVolatility $token $v) $v)
     (min (* $vol 20) 3000)))

; Sentiment adjustment: bad news = tighten, good news = relax
; Sentiment is -1.0 to 1.0; maps to -500 to +200 bps range
(= (SentimentAdjBps $token)
   (let $sent (match &self (MarketSentiment $token $s) $s)
     (if (< $sent -0.5) -500    ; very negative: -5% LTV
       (if (< $sent -0.2) -200  ; negative: -2% LTV
         (if (< $sent 0.2) 0    ; neutral: no change
           (if (< $sent 0.5) 100 ; positive: +1%
             200))))))            ; very positive: +2%

; Liquidity cap check: returns max borrowable USD (0 = no cap set yet)
(= (LiquidityCap $token)
   (match &self (LiquidityDepth $token $usd) $usd))

; Flash pump guard: is this token currently dangerous?
(= (IsFlashPumped $token)
   (match &self (FlashPumpDetected $token $status) $status))

; NetTokenRiskBps: combined risk adjustment before Omega calc
; Positive = safer (higher LTV allowed), Negative = more dangerous
(= (NetTokenRiskBps $token)
   (- (SentimentAdjBps $token)
      (VolatilityDiscountBps $token)))


; ────────────────────────────────────────────────────────────
; SECTION 3: DYNAMIC OMEGA MULTIPLIER
; ────────────────────────────────────────────────────────────
;
; Omega is the final multiplier on LTV sent to ValuationEngine.
; Range: 0–10000 bps (10000 = 1.0x = no restriction)
;
; Logic:
;   1. Start at baseline 10000 (100%)
;   2. Apply sentiment and volatility adjustments
;   3. Hard-clamp to [3000, 10000] — never below 30% or above 100%
;   4. If flash-pumped: clamp to 0 (block all new loans)
;   5. High recent liquidation rate: further tighten

(= (RecommendedOmegaBps $token)
   (if (== (IsFlashPumped $token) True)
     0   ; HARD BLOCK: flash pump detected — no new loans
     (let* (($base      10000)
            ($riskAdj   (NetTokenRiskBps $token))
            ($liqRate   (match &self (LiquidationRate $token $lr) $lr))
            ; Liquidation rate penalty: >10% liquidation history = -1000 bps
            ($liqPenalty (if (> $liqRate 0.1)
                           (round (* $liqRate 5000))   ; 5000 bps per 100% liq rate
                           0))
            ($rawOmega  (- (+ $base $riskAdj) $liqPenalty)))
       ; Clamp to valid range [3000, 10000]
       (max 3000 (min 10000 $rawOmega)))))

; OmegaChanged: only emit an update if the delta is significant (>50 bps)
; This prevents noisy micro-adjustments from spamming the chain.
(= (ShouldUpdateOmega $token $currentOnChainBps)
   (let $recommended (RecommendedOmegaBps $token)
     (> (abs (- $recommended $currentOnChainBps)) 50)))


; ────────────────────────────────────────────────────────────
; SECTION 4: DYNAMIC INTEREST RATE ENGINE
; ────────────────────────────────────────────────────────────
;
; Kinked utilization curve — adapted from Compound/Aave model
; but with MeTTa-adjustable parameters that self-tune over time.
;
; Current learned parameters (updated by self_improve.metta):

(= (BaseRate) 200)       ; 2% floor APR in bps
(= (KinkUtil) 8000)      ; 80% utilization = kink point (bps)
(= (RateAtKink) 1000)    ; 10% APR at kink in bps
(= (MaxRate) 5000)       ; 50% APR max (crisis rate) in bps

; PoolUtilizationBps: read from atom store
(= (GetPoolUtil $rank)
   (match &self (PoolUtilization $rank $util) $util))

; BorrowRateBps: the actual rate a borrower should pay
(= (BorrowRateBps $poolRank)
   (let $util (GetPoolUtil $poolRank)
     (if (< $util (KinkUtil))
       ; Pre-kink: linear interpolation
       (+ (BaseRate)
          (/ (* (- (RateAtKink) (BaseRate)) $util) (KinkUtil)))
       ; Post-kink: steep jump
       (+ (RateAtKink)
          (/ (* (- (MaxRate) (RateAtKink))
                (- $util (KinkUtil)))
             (- 10000 (KinkUtil)))))))

; BorrowerRate: pool rate + reputation adjustment
; Elite borrowers pay up to 100bps less; risky pay up to 200bps more
(= (PersonalizedBorrowRateBps $borrower $poolRank)
   (let* (($poolRate   (BorrowRateBps $poolRank))
          ($repScore   (ReputationScore $borrower))
          ($repAdj     (if (>= $repScore 90) -100
                         (if (>= $repScore 70) -50
                           (if (< $repScore 40) 200
                             0)))))
     (max 100 (+ $poolRate $repAdj))))   ; minimum 1% APR always enforced
