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