/**
 * identityCreditScore.js — Vestra VCS Engine v2.1 (Backend Sync)
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates the Vestra Credit Score (VCS) used to determine loan LTV tiers.
 * Synchronized with the 1600-point model including Vesting & Streaming.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const BASELINE_SCORE = 100;

const MAX_GITCOIN_BONUS = 500;
const GITCOIN_SYBIL_THRESHOLD = 10;
const GITCOIN_MULTIPLIER = 5;

const MAX_VESTING_BONUS = 300;
const VESTING_LOCKED_MAX = 100;
const VESTING_INFLOW_MAX = 200;

const MAX_FINANCIAL_BONUS = 500;
const MAX_CREDIT_BONUS = 200;

const MAX_ATTESTATION_BONUS = 100;
const ATTESTATION_POINTS_EACH = 25;
const MAX_ATTESTATION_AGE_DAYS = 365;

const REPAYMENT_POINTS_EACH = 20;
const DEFAULT_PENALTY = 300;

// ─── Input Validation ─────────────────────────────────────────────────────────

function validateAndNormalise(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('VCS input must be a non-null object');
  }

  const out = { ...data };

  // Gitcoin Passport
  if (out.gitcoinPassportScore !== undefined) {
    const v = Number(out.gitcoinPassportScore);
    out.gitcoinPassportScore = isFinite(v) ? Math.min(Math.max(v, 0), 100) : 0;
  }

  // txCount
  if (out.txCount !== undefined) {
    const v = Number(out.txCount);
    out.txCount = isFinite(v) ? Math.max(v, 0) : 0;
  }

  // balanceUsd
  if (out.balanceUsd !== undefined) {
    const v = parseFloat(out.balanceUsd);
    out.balanceUsd = isFinite(v) ? Math.max(v, 0) : 0;
  }

  // Vesting
  if (out.activeVestingUsd !== undefined) {
    const v = parseFloat(out.activeVestingUsd);
    out.activeVestingUsd = isFinite(v) ? Math.max(v, 0) : 0;
  }
  if (out.vestingMonthlyInflowUsd !== undefined) {
    const v = parseFloat(out.vestingMonthlyInflowUsd);
    out.vestingMonthlyInflowUsd = isFinite(v) ? Math.max(v, 0) : 0;
  }

  return out;
}

// ─── Component Scorers ────────────────────────────────────────────────────────

function scoreGitcoinPassport(score) {
  if (!score || score < GITCOIN_SYBIL_THRESHOLD) return 0;
  return Math.min(score * GITCOIN_MULTIPLIER, MAX_GITCOIN_BONUS);
}

function scoreFinancialHistory(data) {
  // 1. Wallet Age (max 100 pts)
  const ageMonths = data.ageMonths || 0;
  const agePoints = Math.min(ageMonths * 2, 100);

  // 2. Transaction Count (max 100 pts)
  const txCount = data.txCount || 0;
  let txPoints = 0;
  if (txCount > 2000) txPoints = 100;
  else if (txCount > 500) txPoints = 75;
  else if (txCount > 100) txPoints = 50;
  else if (txCount > 10) txPoints = 25;

  // 3. Consistency/Diversity (max 100 pts)
  const activityDiversity = data.activeMonths || data.protocolCount || 0;
  const diversityPoints = Math.min(activityDiversity * 10, 100);

  // 4. Peak Portfolio Value (max 200 pts)
  const peakUsd = data.peakUsdValue || 0;
  let peakPoints = 0;
  if (peakUsd > 1000000) peakPoints = 200;
  else if (peakUsd > 100000) peakPoints = 150;
  else if (peakUsd > 10000) peakPoints = 100;
  else if (peakUsd > 1000) peakPoints = 50;

  return Math.min(agePoints + txPoints + diversityPoints + peakPoints, MAX_FINANCIAL_BONUS);
}

function scoreVesting(activeVestingUsd, monthlyInflowUsd) {
  let lockedPoints = 0;
  if (activeVestingUsd > 100000) lockedPoints = 100;
  else if (activeVestingUsd > 50000) lockedPoints = 75;
  else if (activeVestingUsd > 10000) lockedPoints = 50;
  else if (activeVestingUsd > 1000) lockedPoints = 25;

  let inflowPoints = 0;
  if (monthlyInflowUsd > 5000) inflowPoints = 200;
  else if (monthlyInflowUsd > 2000) inflowPoints = 150;
  else if (monthlyInflowUsd > 500) inflowPoints = 100;
  else if (monthlyInflowUsd > 100) inflowPoints = 50;

  return { 
    total: Math.min(lockedPoints + inflowPoints, MAX_VESTING_BONUS),
    locked: lockedPoints,
    inflow: inflowPoints
  };
}

function scoreCreditHistory(data) {
  if (data.hasActiveDefaults) return -500; // Major penalty

  let bonus = Math.min((data.totalRepaidLoans || 0) * REPAYMENT_POINTS_EACH, MAX_CREDIT_BONUS);
  
  if (data.lateRepaymentCount > 0) {
    bonus -= (data.lateRepaymentCount * 50);
  }

  return Math.max(-500, bonus);
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

function calculateIdentityCreditScore(rawData) {
  const data = validateAndNormalise(rawData);
  const flags = [];

  const identityPoints = scoreGitcoinPassport(data.gitcoinPassportScore);
  const financialPoints = scoreFinancialHistory(data);
  const vesting = scoreVesting(data.activeVestingUsd, data.vestingMonthlyInflowUsd);
  const creditPoints = scoreCreditHistory(data);

  if (data.gitcoinPassportScore < GITCOIN_SYBIL_THRESHOLD && data.gitcoinPassportScore > 0) {
    flags.push('SYBIL_RISK');
  }
  if (data.hasActiveDefaults) {
    flags.push('ACTIVE_DEFAULT');
  }

  const rawScore = BASELINE_SCORE + identityPoints + financialPoints + vesting.total + creditPoints;
  const score = Math.max(100, Math.min(rawScore, 1600));

  // Tiers: TITAN=1400, SAPPHIRE=1250, DIAMOND=1100, GOLD=900, SILVER=700, BRONZE=500
  let tier = 'SCOUT';
  if (score >= 1400) tier = 'TITAN';
  else if (score >= 1250) tier = 'SAPPHIRE';
  else if (score >= 1100) tier = 'DIAMOND';
  else if (score >= 900) tier = 'GOLD';
  else if (score >= 700) tier = 'SILVER';
  else if (score >= 500) tier = 'BRONZE';

  const tierNames = {
    TITAN:    'Titan Rank',
    SAPPHIRE: 'Sapphire Rank',
    DIAMOND:  'Diamond Rank',
    GOLD:     'Gold Rank',
    SILVER:   'Silver Rank',
    BRONZE:   'Bronze Rank',
    SCOUT:    'Scout'
  };

  return {
    score,
    tier,
    tierName: tierNames[tier],
    riskMultiplier: parseFloat(((1700 - score) / 1700).toFixed(4)),
    breakdown: {
      baseline: BASELINE_SCORE,
      identity: identityPoints,
      financial: financialPoints,
      vesting: vesting.total,
      credit: creditPoints,
      details: {
        vestingLocked: vesting.locked,
        vestingInflow: vesting.inflow
      }
    },
    flags
  };
}

const TIER_LEVELS = { 'SCOUT': 0, 'BRONZE': 1, 'SILVER': 2, 'GOLD': 3, 'DIAMOND': 4, 'SAPPHIRE': 5, 'TITAN': 6 };
const POLICY_RULES = { 
  small: { requiredTier: 1, requiredScore: 500 },     // Bronze
  medium: { requiredTier: 3, requiredScore: 900 },    // Gold
  large: { requiredTier: 6, requiredScore: 1400 }    // Titan/HNWI
};

function policyCheck(tierStr = 'BRONZE', crdtScore = 0, band = 'small') {
  const rule = POLICY_RULES[band] || POLICY_RULES.small;
  const tier = TIER_LEVELS[tierStr] || 0;
  const score = Number(crdtScore || 0);
  return { 
    band, 
    allowed: tier >= rule.requiredTier && score >= rule.requiredScore,
    requiredTier: rule.requiredTier,
    requiredScore: rule.requiredScore 
  };
}

module.exports = {
  calculateIdentityCreditScore,
  policyCheck,
  BASELINE_SCORE
};
