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
