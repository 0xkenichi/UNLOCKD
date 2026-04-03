/**
 * Vestra Credit Score (VCS) Engine v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes a 0–1600 score from five weighted provider categories.
 * Tier thresholds: TITAN ≥ 1600 | PREMIUM ≥ 1050 | STANDARD < 1050
 *
 * Score feeds directly into the dDPV formula as an LTV modifier and
 * rate-discount multiplier — see vcsImpactOnDDPV() below.
 *
 * @license BSL-1.1  Copyright © 2026 Vestra Protocol
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

export interface EasAttestation {
  schema: string;   // EAS schema UID
  attester: string; // attesting address
  revoked: boolean;
}

/** Detailed per-category breakdown returned alongside the final score */
export interface VcsTotalBreakdown {
  identity: CategoryScore;
  activity: CategoryScore;
  creditHistory: CategoryScore;
  vesting: CategoryScore;
}

export interface CategoryScore {
  label: string;
  earned: number;
  max: number;
  factors: FactorScore[];
}

export interface FactorScore {
  label: string;
  earned: number;
  max: number;
  note?: string;
}

export interface VcsResult {
  score: number;              // 0–1600
  tier: VcsTier;              // Technical ID (BRONZE, GOLD, etc.)
  tierName: string;           // Display Label (Bronze Rank, Gold Rank, etc.)
  realTier: VcsTier | "SCOUT"; // The actual risk class
  riskMultiplier: number;     // 0.0 (safest) → 1.0 (riskiest)
  breakdown: VcsTotalBreakdown;
  ltvBoostBps: number;        // The maximum LTV cap in bps
  rateSurchargeOrDiscountBps: number; // negative = discount
  maxBorrowCapUsdc: number;
  nextTierDelta: number | null; // points needed to reach next tier (null if TITAN)
  upgradeHints: UpgradeHint[];
}

export interface UpgradeHint {
  action: string;
  pointsGain: number;
  effort: "LOW" | "MEDIUM" | "HIGH";
}

/** How VCS modifies the dDPV lending parameters */
export interface DdpvImpact {
  baseLtvBps: number;           // protocol-default LTV in bps
  effectiveLtvBps: number;      // after VCS boost
  baseRateBps: number;          // base APR in bps (e.g. 1000 = 10%)
  effectiveRateBps: number;     // after VCS discount/surcharge
  omegaFloor: number;           // minimum Ω multiplier allowed for this borrower
}

// ─── Known trusted EAS schema UIDs ───────────────────────────────────────────

const TRUSTED_SCHEMAS: Record<string, { label: string; points: number }> = {
  "0x1e7a29d7b8e5a3c4f2d6b0e9c3a7f1d5e8b2a4c6": { label: "KYC verified",      points: 50 },
  "0x3c8f2a1d7b4e6c9f0a2d5b8e1c4f7a0d3b6e9c2": { label: "Accredited investor", points: 40 },
  "0x7a4b2c9d1e6f3a8b5c2d9e4f1a6b3c8d5e2f7a1": { label: "Builder credential",  points: 30 },
  "0x2d8f5a3c7b1e4d9f6a2c5b8e3d1f4a7c2b5e8d3": { label: "Protocol contributor", points: 25 },
};

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

// LTV boost in bps per tier above SCOUT (Total LTV Cap)
const LTV_CAP_BPS: Record<VcsTier, number> = {
  TITAN:    6000, // 60%
  SAPPHIRE: 5000, // 50%
  DIAMOND:  4000, // 40%
  GOLD:     3000, // 30%
  SILVER:    2000, // 20%
  BRONZE:    1000, // 10%
  SCOUT:    0,
};

// Rate adjustment in bps (negative = discount)
const RATE_ADJUSTMENT_BPS: Record<VcsTier, number> = {
  TITAN:    -600, // −6%
  SAPPHIRE: -500, // −5%
  DIAMOND:  -400, // −4%
  GOLD:     -300, // −3%
  SILVER:    -200, // −2%
  BRONZE:    -100, // −1%
  SCOUT:    0,
};

// Max borrow cap in USDC by tier
const MAX_BORROW_CAP: Record<VcsTier, number> = {
  TITAN:    2_500_000,
  SAPPHIRE: 1_000_000,
  DIAMOND:    500_000,
  GOLD:       250_000,
  SILVER:      100_000,
  BRONZE:       50_000,
  SCOUT:      0,
};

// Omega floor — minimum Ω the protocol will accept for this borrower
const OMEGA_FLOOR: Record<VcsTier, number> = {
  TITAN:    0.2,
  SAPPHIRE: 0.4,
  DIAMOND:  0.5,
  GOLD:     0.6,
  SILVER:    0.7,
  BRONZE:    0.8,
  SCOUT:    0.9,
};

// ─── Core scoring functions ────────────────────────────────────────────────────

function scoreIdentity(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  // Gitcoin Passport (max 500 pts)
  const gitcoinPts = Math.min(Math.floor(input.gitcoinPassportScore * 5), 500);
  factors.push({
    label: "Gitcoin Passport",
    earned: gitcoinPts,
    max: 500,
    note: `Raw score ${input.gitcoinPassportScore.toFixed(1)} × 5`,
  });

  const earned = gitcoinPts;
  return { label: "Identity (Gitcoin)", earned, max: 500, factors };
}

function scoreActivity(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  // Wallet age (max 100)
  let agePts = 0;
  if (input.walletAgedays > 7)   agePts += 25;
  if (input.walletAgedays > 30)  agePts += 25;
  if (input.walletAgedays > 90)  agePts += 25;
  if (input.walletAgedays > 365) agePts += 25;
  factors.push({ label: "Wallet age", earned: agePts, max: 100, note: `${input.walletAgedays}d` });

  // Protocol diversity (max 100)
  let diversityPts = Math.min((input.uniqueProtocolsUsed || 0) * 10, 100);
  factors.push({ label: "Protocol diversity", earned: diversityPts, max: 100 });

  // Wallet liquidity (max 75)
  let balancePts = 0;
  if (input.balanceUsd > 10)   balancePts += 25;
  if (input.balanceUsd > 100)  balancePts += 25;
  if (input.balanceUsd > 1000) balancePts += 25;
  factors.push({ label: "Wallet liquidity", earned: balancePts, max: 75, note: `$${input.balanceUsd.toLocaleString()}` });

  const earned = agePts + diversityPts + balancePts;
  return { label: "On-Chain Behavior", earned, max: 275, factors };
}

function scoreCreditHistory(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  // Transaction count & frequency (max 100)
  let txPts = 0;
  if (input.txCount > 5)   txPts += 25;
  if (input.txCount > 50)  txPts += 25;
  if (input.txCount > 250) txPts += 25;
  
  const months = Math.max(1, input.walletAgedays / 30);
  if ((input.txCount / months) > 5) txPts += 25; 
  factors.push({ label: "Tx count & frequency", earned: txPts, max: 100, note: `${input.txCount} txs` });

  // Wallet volume traded (max 150)
  let volPts = 0;
  const totalVol = (input.volumeTraded || 0) + (input.totalRepaidUsd || 0);
  if (totalVol > 1_000)  volPts += 30;
  if (totalVol > 10_000) volPts += 40;
  if (totalVol > 100_000) volPts += 40;
  if (totalVol > 1_000_000) volPts += 40;
  factors.push({ label: "Volume traded", earned: volPts, max: 150 });

  // Largest transaction (max 100)
  let largestPts = 0;
  const maxVal = input.largestTx || 0;
  if (maxVal > 500) largestPts += 25;
  if (maxVal > 5000) largestPts += 25;
  if (maxVal > 50000) largestPts += 25;
  if (maxVal > 250000) largestPts += 25;
  factors.push({ label: "Largest transaction", earned: largestPts, max: 100 });

  // Recent activity / Liquidity (max 150)
  let recentPts = 0;
  let daysSinceActive = -1;
  if (input.latestTxTimestamp > 0) {
     daysSinceActive = Math.floor((Date.now() / 1000 - input.latestTxTimestamp) / 86400);
     if (daysSinceActive <= 7) recentPts = 150;
     else if (daysSinceActive <= 30) recentPts = 100;
     else if (daysSinceActive <= 90) recentPts = 50;
  }
  factors.push({ label: "Recent activity", earned: recentPts, max: 150, note: daysSinceActive >= 0 ? `${daysSinceActive}d ago` : 'Never' });

  const earned = Math.min(txPts + volPts + largestPts + recentPts, 500);
  return { label: "Financial History", earned, max: 500, factors };
}

function scoreVesting(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  // Metric A: Active Vesting Value (Locked USD) - Max 100 pts
  let lockedPts = 0;
  if (input.activeVestingUsd >= 1000)   lockedPts = 25;
  if (input.activeVestingUsd >= 10000)  lockedPts = 50;
  if (input.activeVestingUsd >= 50000)  lockedPts = 75;
  if (input.activeVestingUsd >= 100000) lockedPts = 100;
  factors.push({ 
    label: "Locked vesting value", 
    earned: lockedPts, 
    max: 100, 
    note: `$${Math.round(input.activeVestingUsd || 0).toLocaleString()} locked` 
  });

  // Metric B: Monthly Stream Inflow (Cash Flow USD) - Max 200 pts
  let inflowPts = 0;
  if (input.vestingMonthlyInflowUsd >= 250)  inflowPts = 50;
  if (input.vestingMonthlyInflowUsd >= 1000) inflowPts = 100;
  if (input.vestingMonthlyInflowUsd >= 2500) inflowPts = 150;
  if (input.vestingMonthlyInflowUsd >= 5000) inflowPts = 200;
  factors.push({ 
    label: "Monthly stream inflow", 
    earned: inflowPts, 
    max: 200, 
    note: `$${Math.round(input.vestingMonthlyInflowUsd || 0).toLocaleString()}/mo` 
  });

  const earned = lockedPts + inflowPts;
  return { label: "Vesting & Streaming", earned, max: 300, factors };
}

function scoreGovernance(input: VcsInput): CategoryScore {
  return { label: "Governance Participation", earned: 0, max: 0, factors: [] };
}

function scorePenalties(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];
  let penalty = 0;

  if (input.hasActiveDefaults) {
    penalty += 300;
    factors.push({ label: "Active defaults", earned: 300, max: 300, note: "CRITICAL" });
  }

  if (input.lateRepaymentCount > 0) {
    const latePts = Math.min(input.lateRepaymentCount * 50, 200);
    penalty += latePts;
    factors.push({ label: "Late repayments", earned: latePts, max: 200, note: `${input.lateRepaymentCount} events` });
  }

  return { label: "Penalties", earned: penalty, max: 500, factors };
}

// ─── Upgrade hints ────────────────────────────────────────────────────────────

function buildUpgradeHints(input: VcsInput, result: VcsResult): UpgradeHint[] {
  const hints: UpgradeHint[] = [];
  const gap = result.nextTierDelta ?? 0;
  if (!gap) return hints;

  if (input.gitcoinPassportScore < 60)
    hints.push({ action: "Increase Gitcoin Passport score", pointsGain: Math.min(500 - Math.floor(input.gitcoinPassportScore * 5), 150), effort: "LOW" });

  if (input.totalRepaidLoans < 3)
    hints.push({ action: "Repay 3 Vestra loans on time", pointsGain: (3 - input.totalRepaidLoans) * 20, effort: "MEDIUM" });

  if ((input.veCrdtBalance ?? 0) < 1000)
    hints.push({ action: "Stake 1,000+ veCRDT tokens", pointsGain: 50, effort: "MEDIUM" });

  if ((input.uniqueProtocolsUsed || 0) < 5)
    hints.push({ action: "Interact with 5+ DeFi protocols", pointsGain: 50, effort: "HIGH" });

  // Sort by best points-per-effort
  const effortWeight = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  hints.sort((a, b) => b.pointsGain / effortWeight[b.effort] - a.pointsGain / effortWeight[a.effort]);

  return hints.slice(0, 4);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function computeVcs(input: VcsInput): VcsResult {
  const identity     = scoreIdentity(input);
  const activity     = scoreActivity(input);
  const creditHistory = scoreCreditHistory(input);
  const vesting      = scoreVesting(input);
  const governance   = scoreGovernance(input);
  const penalties    = scorePenalties(input);

  const rawScore =
    BASELINE +
    identity.earned +
    activity.earned +
    creditHistory.earned +
    vesting.earned -
    penalties.earned;

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
  const nextTierDelta = nextTier
    ? Math.max(0, TIER_THRESHOLDS[nextTier] - score)
    : null;

  const riskMultiplier = parseFloat(((1700 - score) / 1700).toFixed(4));

  const tierNames: Record<VcsTier, string> = {
    TITAN:    "Titan Rank",
    SAPPHIRE: "Sapphire Rank",
    DIAMOND:  "Diamond Rank",
    GOLD:     "Gold Rank",
    SILVER:   "Silver Rank",
    BRONZE:   "Bronze Rank",
    SCOUT:    "Scout"
  };
  const tierName = tierNames[tier];

  const result: VcsResult = {
    score,
    tier,
    tierName,
    realTier: tier,
    riskMultiplier,
    breakdown: { identity, activity, creditHistory, vesting },
    ltvBoostBps:                LTV_CAP_BPS[tier],
    rateSurchargeOrDiscountBps: RATE_ADJUSTMENT_BPS[tier],
    maxBorrowCapUsdc:           MAX_BORROW_CAP[tier],
    nextTierDelta,
    upgradeHints: [],
  };

  result.upgradeHints = buildUpgradeHints(input, result);
  return result;
}

/** Computes the net dDPV lending parameters after applying VCS */
export function vcsImpactOnDdpv(
  vcs: VcsResult,
  baseLtvBps: number,
  baseRateBps: number
): DdpvImpact {
  return {
    baseLtvBps,
    effectiveLtvBps:  Math.min(baseLtvBps + vcs.ltvBoostBps, 6000), // hard cap 60%
    baseRateBps,
    effectiveRateBps: Math.max(baseRateBps + vcs.rateSurchargeOrDiscountBps, 0),
    omegaFloor:       OMEGA_FLOOR[vcs.tier],
  };
}
