/**
 * Vestra Credit Score (VCS) Engine v3.0 (Relayer Sync)
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes a 0–1600 score from five weighted provider categories.
 * 6-Tier Hierarchy: Bronze, Silver, Gold, Diamond, Sapphire, Titan (HNWI).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type VcsTier = "TITAN" | "SAPPHIRE" | "DIAMOND" | "GOLD" | "SILVER" | "BRONZE" | "SCOUT";

/** Raw inputs from on-chain + off-chain data sources */
export interface VcsInput {
  // Identity providers
  gitcoinPassportScore: number;   // 0–100 raw Passport score
  hasWorldID?: boolean;
  easAttestations?: any[];

  // On-chain activity & Financial metrics
  txCount: number;
  walletAgedays: number;
  uniqueProtocolsUsed: number;
  balanceUsd: number;
  latestTxTimestamp: number;
  volumeTraded: number;
  largestTx: number;

  // Vestra-internal credit history
  totalRepaidLoans: number;
  totalRepaidUsd: number;
  hasActiveDefaults: boolean;
  lateRepaymentCount: number;

  // Optional: VestraCRDT participation
  veCrdtBalance?: number;         // staked veCRDT amount
  gaugeVotesCount?: number;       // governance participation

  // Vesting & Streaming (New Category)
  activeVestingUsd: number;      // Current value of active vesting streams
  vestingMonthlyInflowUsd: number; // Monthly incoming USD from streams
}

export interface FactorScore {
  label: string;
  earned: number;
  max: number;
  note?: string;
}

export interface CategoryScore {
  label: string;
  earned: number;
  max: number;
  factors: FactorScore[];
}

export interface VcsTotalBreakdown {
  identity: CategoryScore;
  activity: CategoryScore;
  creditHistory: CategoryScore;
  vesting: CategoryScore;
}

export interface VcsResult {
  score: number;              // 0–1600
  tier: VcsTier;              // UI tier (Bronze-Titan)
  realTier: VcsTier;          // The actual risk class
  riskMultiplier: number;
  breakdown: VcsTotalBreakdown;
  ltvBoostBps: number;
  rateSurchargeOrDiscountBps: number;
  maxBorrowCapUsdc: number;
  nextTierDelta: number | null;
}

// ─── Scoring constants ────────────────────────────────────────────────────────

const BASELINE = 100;

const TIER_THRESHOLDS: Record<VcsTier, number> = {
  TITAN:    1400, // HNWI / Rare
  SAPPHIRE: 1250,
  DIAMOND:  1100,
  GOLD:     900,
  SILVER:    700,
  BRONZE:    500,
  SCOUT:    0,
};

const LTV_CAP_BPS: Record<VcsTier, number> = {
  TITAN:    6000, // 60%
  SAPPHIRE: 5000, // 50%
  DIAMOND:  4000, // 40%
  GOLD:     3000, // 30%
  SILVER:    2000, // 20%
  BRONZE:    1000, // 10%
  SCOUT:    0,
};

const RATE_ADJUSTMENT_BPS: Record<VcsTier, number> = {
  TITAN:    -600, // −6%
  SAPPHIRE: -500, // −5%
  DIAMOND:  -400, // −4%
  GOLD:     -300, // −3%
  SILVER:    -200, // −2%
  BRONZE:    -100, // −1%
  SCOUT:    0,
};

const MAX_BORROW_CAP: Record<VcsTier, number> = {
  TITAN:    2_500_000,
  SAPPHIRE: 1_000_000,
  DIAMOND:    500_000,
  GOLD:       250_000,
  SILVER:      100_000,
  BRONZE:       50_000,
  SCOUT:      0,
};

// ─── Core scoring functions ───────────────────────────────────────────────────

function scoreIdentity(input: VcsInput): CategoryScore {
  const gitcoinPts = Math.min(Math.floor(input.gitcoinPassportScore * 5), 500);
  return { 
    label: "Identity (Gitcoin)", 
    earned: gitcoinPts, 
    max: 500, 
    factors: [{ label: "Gitcoin Passport", earned: gitcoinPts, max: 500 }] 
  };
}

function scoreActivity(input: VcsInput): CategoryScore {
  let agePts = 0;
  if (input.walletAgedays > 7)   agePts += 25;
  if (input.walletAgedays > 30)  agePts += 25;
  if (input.walletAgedays > 90)  agePts += 25;
  if (input.walletAgedays > 365) agePts += 25;

  let diversityPts = Math.min((input.uniqueProtocolsUsed || 0) * 10, 100);
  let balancePts = 0;
  if (input.balanceUsd > 10)   balancePts += 25;
  if (input.balanceUsd > 100)  balancePts += 25;
  if (input.balanceUsd > 1000) balancePts += 25;

  const earned = agePts + diversityPts + balancePts;
  return { label: "On-Chain Behavior", earned, max: 275, factors: [] };
}

function scoreCreditHistory(input: VcsInput): CategoryScore {
  let txPts = 0;
  if (input.txCount > 5)   txPts += 25;
  if (input.txCount > 50)  txPts += 25;
  if (input.txCount > 250) txPts += 25;
  const months = Math.max(1, input.walletAgedays / 30);
  if ((input.txCount / months) > 5) txPts += 25; 

  const totalVol = (input.volumeTraded || 0) + (input.totalRepaidUsd || 0);
  let volPts = 0;
  if (totalVol > 1_000)  volPts += 30;
  if (totalVol > 10_000) volPts += 40;
  if (totalVol > 100_000) volPts += 40;
  if (totalVol > 1_000_000) volPts += 40;

  let largestPts = 0;
  if (input.largestTx > 500) largestPts += 25;
  if (input.largestTx > 5000) largestPts += 25;
  if (input.largestTx > 50000) largestPts += 25;
  if (input.largestTx > 250000) largestPts += 25;

  let recentPts = 0;
  if (input.latestTxTimestamp > 0) {
     const days = Math.floor((Date.now() / 1000 - input.latestTxTimestamp) / 86400);
     if (days <= 7) recentPts = 150;
     else if (days <= 30) recentPts = 100;
     else if (days <= 90) recentPts = 50;
  }

  const earned = Math.min(txPts + volPts + largestPts + recentPts, 500);
  return { label: "Financial History", earned, max: 500, factors: [] };
}

function scoreVesting(input: VcsInput): CategoryScore {
  let lockedPts = 0;
  if (input.activeVestingUsd >= 1000)   lockedPts = 25;
  if (input.activeVestingUsd >= 10000)  lockedPts = 50;
  if (input.activeVestingUsd >= 50000)  lockedPts = 75;
  if (input.activeVestingUsd >= 100000) lockedPts = 100;

  let inflowPts = 0;
  if (input.vestingMonthlyInflowUsd >= 250)  inflowPts = 50;
  if (input.vestingMonthlyInflowUsd >= 1000) inflowPts = 100;
  if (input.vestingMonthlyInflowUsd >= 2500) inflowPts = 150;
  if (input.vestingMonthlyInflowUsd >= 5000) inflowPts = 200;

  return { label: "Vesting & Streaming", earned: lockedPts + inflowPts, max: 300, factors: [] };
}

function scorePenalties(input: VcsInput): number {
  let p = 0;
  if (input.hasActiveDefaults) p += 300;
  if (input.lateRepaymentCount > 0) p += Math.min(input.lateRepaymentCount * 50, 200);
  return p;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeVcs(input: VcsInput): VcsResult {
  const identity     = scoreIdentity(input);
  const activity     = scoreActivity(input);
  const creditHistory = scoreCreditHistory(input);
  const vesting      = scoreVesting(input);
  const penaltyPts   = scorePenalties(input);

  const rawScore = BASELINE + identity.earned + activity.earned + creditHistory.earned + vesting.earned - penaltyPts;
  const score = Math.max(0, Math.min(Math.round(rawScore), 1600));

  let tier: VcsTier = "SCOUT";
  if (score >= TIER_THRESHOLDS.TITAN)        tier = "TITAN";
  else if (score >= TIER_THRESHOLDS.SAPPHIRE) tier = "SAPPHIRE";
  else if (score >= TIER_THRESHOLDS.DIAMOND)  tier = "DIAMOND";
  else if (score >= TIER_THRESHOLDS.GOLD)     tier = "GOLD";
  else if (score >= TIER_THRESHOLDS.SILVER)   tier = "SILVER";
  else if (score >= TIER_THRESHOLDS.BRONZE)   tier = "BRONZE";

  const nextTier: VcsTier | null =
    tier === "TITAN" ? null :
    tier === "SAPPHIRE" ? "TITAN" :
    tier === "DIAMOND" ? "SAPPHIRE" :
    tier === "GOLD" ? "DIAMOND" :
    tier === "SILVER" ? "GOLD" :
    tier === "BRONZE" ? "SILVER" : "BRONZE";

  return {
    score,
    tier,
    realTier: tier,
    riskMultiplier: parseFloat(((1700 - score) / 1700).toFixed(4)),
    breakdown: { identity, activity, creditHistory, vesting },
    ltvBoostBps: LTV_CAP_BPS[tier],
    rateSurchargeOrDiscountBps: RATE_ADJUSTMENT_BPS[tier],
    maxBorrowCapUsdc: MAX_BORROW_CAP[tier],
    nextTierDelta: nextTier ? Math.max(0, TIER_THRESHOLDS[nextTier] - score) : null
  };
}
