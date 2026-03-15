
; FLAT SPACE RUNNER (MeTTaclaw)
; ────────────────────────────────────────────────────────────
; SECTION 0: MATH UTILITIES
; ────────────────────────────────────────────────────────────

(= (max $a $b) (if (> $a $b) $a $b))
(= (min $a $b) (if (< $a $b) $a $b))
(= (abs $x) (if (< $x 0) (- 0 $x) $x))

; Use raw values for now as truncate/round are missing
(= (round $x) $x)

; ────────────────────────────────────────────────────────────


; ────────────────────────────────────────────────────────────
; SECTION 1: BORROWER REPUTATION ENGINE
; ────────────────────────────────────────────────────────────

(= (GetBorrowerStat $borrower $stat $default)
   (let $res (collapse (match &self ($stat $borrower $v) $v))
     (case $res (
       (() $default)
       (($v) $v)
       ($any (superpose $any))
     ))))

(= (ReputationScore $borrower)
   (let* (($repaid   (GetBorrowerStat $borrower BorrowerRepaid 0))
          ($defaulted (GetBorrowerStat $borrower BorrowerDefaulted 0))
          ($total    (+ $repaid $defaulted)))
     (if (== $total 0) 50 (/ (* $repaid 100) $total))))

(= (ReputationTier $borrower)
   (let $score (ReputationScore $borrower)
     (if (>= $score 90) Tier1-Elite
       (if (>= $score 70) Tier2-Trusted
         (if (>= $score 50) Tier3-Standard
           Tier4-HighRisk)))))

; ────────────────────────────────────────────────────────────
; SECTION 2: TOKEN RISK CLASSIFICATION
; ────────────────────────────────────────────────────────────

(= (GetTokenParam $token $stat $default)
   (let $res (collapse (match &self ($stat $token $v) $v))
     (case $res (
       (() $default)
       (($v) $v)
       ($any (superpose $any))
     ))))

; Base LTV per collateral rank (bps)
(= (BaseRankLTVBps $token)
   (let $rank (GetTokenParam $token CollateralRank 3)
     (if (== $rank 1) 5000
       (if (== $rank 2) 3500
         2000))))

; Volatility discount in bps
(= (VolatilityDiscountBps $token)
   (let $vol (GetTokenParam $token TokenVolatility 0)
     (min (* $vol 20) 3000)))

; Sentiment adjustment
(= (SentimentAdjBps $token)
   (let $sent (GetTokenParam $token MarketSentiment 0.0)
     (if (< $sent -0.5) -500
       (if (< $sent -0.2) -200
         (if (< $sent 0.2) 0
           (if (< $sent 0.5) 100
             200))))))

; Flash pump guard
(= (IsFlashPumped $token)
   (GetTokenParam $token FlashPumpDetected False))

; NetTokenRiskBps
(= (NetTokenRiskBps $token)
   (- (SentimentAdjBps $token)
      (VolatilityDiscountBps $token)))


; ────────────────────────────────────────────────────────────
; SECTION 3: DYNAMIC OMEGA MULTIPLIER
; ────────────────────────────────────────────────────────────

(= (RecommendedOmegaBps $token)
   (if (== (IsFlashPumped $token) True)
     0
     (let* (($base      10000)
            ($riskAdj   (NetTokenRiskBps $token))
            ($liqRate   (GetTokenParam $token LiquidationRate 0.0))
            ($liqPenalty (if (> $liqRate 0.1)
                           (round (* $liqRate 5000))
                           0))
            ($rawOmega  (- (+ $base $riskAdj) $liqPenalty)))
       (max 3000 (min 10000 $rawOmega)))))

; ────────────────────────────────────────────────────────────
; SECTION 4: DYNAMIC INTEREST RATE ENGINE
; ────────────────────────────────────────────────────────────

(= (BaseRate) 200)
(= (KinkUtil) 8000)
(= (RateAtKink) 1000)
(= (MaxRate) 5000)

(= (GetPoolUtil $rank) (GetTokenParam $rank PoolUtilization 0))

; Calculate the base interest rate based on utilization
(= (BasePoolRateBps $poolRank)
   (let $util (GetPoolUtil $poolRank)
     (if (< $util (KinkUtil))
       (+ (BaseRate) (/ (* (- (RateAtKink) (BaseRate)) $util) (KinkUtil)))
       (+ (RateAtKink) (/ (* (- (MaxRate) (RateAtKink)) (- $util (KinkUtil))) (- 10000 (KinkUtil)))))))

; Chaos/Volatility Multiplied Rate
(= (ChaosAdjustedRate $baseRate)
    (let $event (collapse (match &self (MarketEvent $ts BLACK_SWAN $delta $price) $delta))
      (case $event (
        (() $baseRate)
        (($deltaVal) (if (< $deltaVal -0.15) 1500 $baseRate))
        ($any $baseRate)
      ))))

; Main Borrow Rate Query
(= (BorrowRateBps $poolId)
    (let $base (BasePoolRateBps $poolId)
        (ChaosAdjustedRate $base)))

; Personalized rate for UX/Specific Borrower logic
(= (PersonalizedBorrowRateBps $borrower $poolRank)
   (let* (($poolRate   (BorrowRateBps $poolRank))
          ($repScore   (ReputationScore $borrower))
          ($repAdj     (if (>= $repScore 90) -100
                         (if (>= $repScore 70) -50
                           (if (< $repScore 40) 200
                             0)))))
     (max 100 (+ $poolRate $repAdj))))
; ============================================================
; UNLOCKD Protocol — MeTTa Self-Improvement Engine v1.0
; ============================================================
; This file defines the META-LEARNING layer. After each
; epoch (every ~1000 blocks), the agent evaluates its own
; performance and rewrites parameters in risk_brain.metta.
;
; Atom Store additions used here:
;   (EpochLiquidationRate <epoch-id> <rate>)   ; observed liq rate
;   (EpochDefaultRate     <epoch-id> <rate>)   ; observed default rate
;   (EpochUtilizationAvg  <epoch-id> <util>)   ; avg pool util
;   (EpochOmegaAvg        <token> <epoch> <omegaBps>) ; what we set
;   (EpochRevenueUSDC     <epoch-id> <usdc>)   ; interest earned
;   (LearningRate) — how aggressively to adapt (0.05–0.3)
; ============================================================


; ────────────────────────────────────────────────────────────
; LEARNING KNOBS (the agent can modify these)
; ────────────────────────────────────────────────────────────

(= (LearningRate) 0.1)          ; 10% adjustment per epoch
(= (TargetLiqRate) 0.05)        ; desired max liquidation rate = 5%
(= (TargetDefaultRate) 0.02)    ; desired max default rate = 2%
(= (VolPenaltyWeight) 20)       ; bps penalty per vol unit (in risk_brain)
(= (LiqRatePenaltyMultiplier) 5000) ; bps per 100% liq rate


; ────────────────────────────────────────────────────────────
; SECTION 1: EPOCH PERFORMANCE EVALUATION
; ────────────────────────────────────────────────────────────

; Is the current config too loose? (too many liquidations)
(= (IsTooLoose $epochId)
   (let $res (collapse (match &self (EpochLiquidationRate $epochId $r) $r))
     (if (== $res ()) False
       (> (superpose $res) (TargetLiqRate)))))

; Is the current config too tight? (not enough activity / near-zero revenue)
(= (IsTooTight $epochId)
   (let* (($liqRes (collapse (match &self (EpochLiquidationRate $epochId $r) $r)))
          ($liqRate (if (== $liqRes ()) 0 (superpose $liqRes)))
          ($revRes (collapse (match &self (EpochRevenueUSDC $epochId $rev) $rev)))
          ($revenue (if (== $revRes ()) 0 (superpose $revRes))))
     (and (< $liqRate 0.01) (< $revenue 1000))))

; OverallHealthSignal: +1 = healthy, 0 = loose (tighten), -1 = tight (loosen)
(= (OverallHealthSignal $epochId)
   (if (IsTooLoose $epochId) 0
     (if (IsTooTight $epochId) -1
       1)))


; ────────────────────────────────────────────────────────────
; SECTION 2: PARAMETER ADAPTATION RULES  
; ────────────────────────────────────────────────────────────

; Adapt the VolPenaltyWeight:
;   - Too many liquidations → INCREASE penalty (discriminate more on vol)
;   - Too tight → DECREASE penalty (be more permissive)
(= (NewVolPenaltyWeight $epochId)
   (let* (($current (VolPenaltyWeight))
          ($signal  (OverallHealthSignal $epochId))
          ($change  (round (* $current (LearningRate)))))
     (if (== $signal 0)
       (min 50 (+ $current $change))   ; cap at 50 bps per vol unit
       (if (== $signal -1)
         (max 5 (- $current $change))  ; floor at 5 bps per vol unit
         $current))))                   ; healthy: leave unchanged

; Adapt the KinkUtil in the interest rate curve:
;   - High liq rate: lower the kink (borrow costs rise sooner)
;   - Low activity: raise the kink (encourage more borrowing)
(= (NewKinkUtil $epochId)
   (let* (($current (KinkUtil))
          ($signal  (OverallHealthSignal $epochId)))
     (if (== $signal 0)
       (max 5000 (- $current 500))     ; tighten kink: min 50% util
       (if (== $signal -1)
         (min 9000 (+ $current 300))   ; loosen kink: max 90% util
         $current))))

; Adapt the MaxRate — crisis rate ceiling:
;   - Very high default rate → aggressive rate hike
(= (NewMaxRate $epochId)
   (let* (($defRes (collapse (match &self (EpochDefaultRate $epochId $d) $d)))
          ($defaultRate (if (== $defRes ()) 0 (superpose $defRes)))
          ($current (MaxRate)))
     (if (> $defaultRate (TargetDefaultRate))
       (min 8000 (+ $current 500))   ; hike max rate up (cap 80% APR)
       (if (< $defaultRate 0.005)
         (max 3000 (- $current 200)) ; comfortable: ease max rate (floor 30%)
         $current))))


; ────────────────────────────────────────────────────────────
; SECTION 3: SELF-MODIFICATION TRIGGER
; ────────────────────────────────────────────────────────────
;
; RunEpochAdaptation: the main function called by mettaclaw.js
; at the end of each epoch. Returns a summary of what changed.

(= (RunEpochAdaptation $epochId)
   (let* (($newVolPenalty (NewVolPenaltyWeight $epochId))
          ($newKink       (NewKinkUtil $epochId))
          ($newMaxRate    (NewMaxRate $epochId))
          ($signal        (OverallHealthSignal $epochId)))
     ; Return a struct that mettaclaw.js reads and applies
     (EpochResult
       epochId:    $epochId
       signal:     $signal
       volPenalty: $newVolPenalty
       kinkUtil:   $newKink
       maxRate:    $newMaxRate)))

; ────────────────────────────────────────────────────────────
; SECTION 4: OBSERVATION LOGGING
; ────────────────────────────────────────────────────────────

; LogObservation: called by mettaclaw.js after every on-chain event.
; Adds the event to the atom store for future reasoning.
(= (LogLoanCreated $loanId $borrower $token $principal $timestamp)
   (add-atom &self (LoanEvent created $loanId $borrower $token $principal $timestamp)))

(= (LogLoanRepaid $loanId $borrower $timestamp)
   (add-atom &self (LoanEvent repaid $loanId $borrower $timestamp))
   (add-atom &self (BorrowerRepaid $borrower 1)))   ; increment counter

(= (LogLoanDefaulted $loanId $borrower $deficit $timestamp)
   (add-atom &self (LoanEvent defaulted $loanId $borrower $deficit $timestamp))
   (add-atom &self (BorrowerDefaulted $borrower 1))) ; increment counter

(= (LogLiquidation $loanId $token $timestamp)
   (add-atom &self (LoanEvent liquidated $loanId $token $timestamp)))

(CollateralRank 3 3)
(TokenVolatility any 0)
(MarketSentiment any 0.0)
(FlashPumpDetected any False)
(LiquidationRate any 0.0)
(PoolUtilization any 0)
(BorrowerRepaid any 0)
(BorrowerDefaulted any 0)
(CollateralRank "0xTOKEN" 1)
(LiquidationRate "0xTOKEN" 0.02)
(MarketEvent 1772857070141 BLACK_SWAN -0.90 0.1)
(TokenVolatility 0xTOKEN 99)
(BorrowerDefaulted "bad_borrower_0" 1)
(BorrowerDefaulted "bad_borrower_1" 1)
(BorrowerDefaulted "bad_borrower_2" 1)
(BorrowerDefaulted "bad_borrower_3" 1)
(BorrowerDefaulted "bad_borrower_4" 1)
(BorrowerDefaulted "bad_borrower_5" 1)
(BorrowerDefaulted "bad_borrower_6" 1)
(BorrowerDefaulted "bad_borrower_7" 1)
(BorrowerDefaulted "bad_borrower_8" 1)
(BorrowerDefaulted "bad_borrower_9" 1)
(BorrowerDefaulted "bad_borrower_10" 1)
(BorrowerDefaulted "bad_borrower_11" 1)
(BorrowerDefaulted "bad_borrower_12" 1)
(BorrowerDefaulted "bad_borrower_13" 1)
(BorrowerDefaulted "bad_borrower_14" 1)
(BorrowerDefaulted "bad_borrower_15" 1)
(BorrowerDefaulted "bad_borrower_16" 1)
(BorrowerDefaulted "bad_borrower_17" 1)
(BorrowerDefaulted "bad_borrower_18" 1)
(BorrowerDefaulted "bad_borrower_19" 1)
(BorrowerDefaulted "bad_borrower_20" 1)
(BorrowerDefaulted "bad_borrower_21" 1)
(BorrowerDefaulted "bad_borrower_22" 1)
(BorrowerDefaulted "bad_borrower_23" 1)
(BorrowerDefaulted "bad_borrower_24" 1)
(BorrowerDefaulted "bad_borrower_25" 1)
(BorrowerDefaulted "bad_borrower_26" 1)
(BorrowerDefaulted "bad_borrower_27" 1)
(BorrowerDefaulted "bad_borrower_28" 1)
(BorrowerDefaulted "bad_borrower_29" 1)
(BorrowerDefaulted "bad_borrower_30" 1)
(BorrowerDefaulted "bad_borrower_31" 1)
(BorrowerDefaulted "bad_borrower_32" 1)
(BorrowerDefaulted "bad_borrower_33" 1)
(BorrowerDefaulted "bad_borrower_34" 1)
(BorrowerDefaulted "bad_borrower_35" 1)
(BorrowerDefaulted "bad_borrower_36" 1)
(BorrowerDefaulted "bad_borrower_37" 1)
(BorrowerDefaulted "bad_borrower_38" 1)
(BorrowerDefaulted "bad_borrower_39" 1)
(BorrowerDefaulted "bad_borrower_40" 1)
(BorrowerDefaulted "bad_borrower_41" 1)
(BorrowerDefaulted "bad_borrower_42" 1)
(BorrowerDefaulted "bad_borrower_43" 1)
(BorrowerDefaulted "bad_borrower_44" 1)
(BorrowerDefaulted "bad_borrower_45" 1)
(BorrowerDefaulted "bad_borrower_46" 1)
(BorrowerDefaulted "bad_borrower_47" 1)
(BorrowerDefaulted "bad_borrower_48" 1)
(BorrowerDefaulted "bad_borrower_49" 1)
(FlashPumpDetected 0xTOKEN True)
(EpochLiquidationRate 999 0.45)
(EpochRevenueUSDC 999 50)

!(RunEpochAdaptation 999)
        