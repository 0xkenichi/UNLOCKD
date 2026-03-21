// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const MODEL_VERSION = 'v1.0.0';

const TIER_NAMES = {
  0: 'Scout',
  1: 'Initiate',
  2: 'Sovereign',
  3: 'Vanguard',
  4: 'Archon',
  5: 'Sovereign Archon'
};

const PROVIDER_WEIGHTS = {
  gitcoin_passport: 90,
  worldid: 120,
  civic: 80,
  polygon_id: 80,
  internal: 45
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeProvider = (value) => String(value || '').trim().toLowerCase();

const isFutureDate = (value) => {
  if (!value) return false;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) && ts > Date.now();
};

const computeIAS = ({ identity, attestations }) => {
  let score = 35;
  const reasonCodes = [];

  if (identity?.linkedAt) {
    score += 40;
    reasonCodes.push('identity_linked');
  }

  if (identity?.identityProofHash) {
    score += 45;
    reasonCodes.push('identity_proof_hash_present');
  }

  if (identity?.sanctionsPass === true) {
    score += 35;
    reasonCodes.push('sanctions_passed');
  } else if (identity?.sanctionsPass === false) {
    score -= 120;
    reasonCodes.push('sanctions_failed');
  }

  const providerSeen = new Set();
  let activeAttestations = 0;
  for (const att of attestations || []) {
    const provider = normalizeProvider(att?.provider);
    if (!provider) continue;
    if (att?.expiresAt && !isFutureDate(att.expiresAt)) {
      reasonCodes.push(`attestation_expired:${provider}`);
      continue;
    }
    activeAttestations += 1;
    if (providerSeen.has(provider)) continue;
    providerSeen.add(provider);
    score += PROVIDER_WEIGHTS[provider] ?? 30;
  }

  if (activeAttestations > 0) {
    reasonCodes.push(`attestations_active:${activeAttestations}`);
    score += Math.min(60, activeAttestations * 10);
  } else {
    reasonCodes.push('attestations_missing');
  }

  if (providerSeen.has('worldid') && providerSeen.has('gitcoin_passport')) {
    score += 35;
    reasonCodes.push('strong_attestation_combo');
  }

  return { ias: clamp(Math.round(score), 0, 500), reasonCodes };
};

const computeActivityScore = (metrics = {}) => {
  let score = 0;
  const reasonCodes = [];

  // Wallet Age: +10 pts per month (max 100)
  const agePts = Math.min(100, (metrics.ageMonths || 0) * 10);
  score += agePts;
  if (agePts > 0) reasonCodes.push(`wallet_age_pts:${agePts}`);

  // Tx Count: +2 pts per tx (max 100)
  const txPts = Math.min(100, (metrics.txCount || 0) * 2);
  score += txPts;
  if (txPts > 0) reasonCodes.push(`tx_count_pts:${txPts}`);

  // Total Volume: +1 pt per $1000 USD (max 100)
  const volPts = Math.min(100, Math.floor((metrics.totalVolume || 0) / 1000));
  score += volPts;
  if (volPts > 0) reasonCodes.push(`volume_pts:${volPts}`);

  // Current Balance: +1 pt per $500 USD (max 150)
  const balPts = Math.min(150, Math.floor((metrics.currentBalance || 0) / 500));
  score += balPts;
  if (balPts > 0) reasonCodes.push(`balance_pts:${balPts}`);

  // ATH Balance: +1 pt per $500 USD (max 50)
  const athPts = Math.min(50, Math.floor((metrics.athBalance || 0) / 500));
  score += athPts;
  if (athPts > 0) reasonCodes.push(`ath_pts:${athPts}`);

  return { score: Math.round(score), reasonCodes };
};

const computeFBS = ({ creditHistory, activityMetrics }) => {
  const repaidCount = Number(creditHistory?.repaidCount || 0);
  const defaultedCount = Number(creditHistory?.defaultedCount || 0);
  
  const { score: activityScore, reasonCodes: activityReasons } = computeActivityScore(activityMetrics);
  
  let score = 150 + activityScore; // Base lowered to 150 because activity adds up to 500
  const reasonCodes = [...activityReasons];

  if (repaidCount > 0) {
    const repayBoost = Math.min(220, repaidCount * 35);
    score += repayBoost;
    reasonCodes.push(`repay_history:${repaidCount}`);
  } else {
    reasonCodes.push('repay_history:none');
  }

  if (defaultedCount > 0) {
    const defaultPenalty = Math.min(320, defaultedCount * 140);
    score -= defaultPenalty;
    reasonCodes.push(`defaults:${defaultedCount}`);
  } else {
    reasonCodes.push('defaults:none');
  }

  if (repaidCount >= 3 && defaultedCount === 0) {
    score += 80;
    reasonCodes.push('consistent_repayment_bonus');
  }

  if (repaidCount === 0 && defaultedCount === 0) {
    score -= 40;
    reasonCodes.push('no_credit_history_penalty');
  }

  return { fbs: clamp(Math.round(score), 0, 500), reasonCodes };
};

const scoreToTier = ({ ias, fbs, crdtScore }) => {
  if (crdtScore >= 800) return 5; // Sovereign Archon
  if (crdtScore >= 600) return 4; // Archon
  if (crdtScore >= 450) return 3; // Vanguard
  if (crdtScore >= 300) return 2; // Sovereign
  if (crdtScore >= 150) return 1; // Initiate
  return 0; // Scout
};

const getUnlockRiskMultiplier = (unlockData) => {
  if (!unlockData) return 1.0;
  // If a major unlock > 10% of supply is coming in < 7 days, reduce score
  const upcomingLargeUnlock = (unlockData.nextUnlocks || []).some(
    u => u.percentageOfSupply > 10 && u.daysToUnlock < 7
  );
  return upcomingLargeUnlock ? 0.85 : 1.0;
};

const computeScore = (input = {}) => {
  const { ias, reasonCodes: iasReasons } = computeIAS({
    identity: input.identity || null,
    attestations: input.attestations || []
  });
  
  // Wallet Age Base Score (requested by user)
  // > 6 months = 200, > 3 months = 100, else 0
  let walletAgeBaseScore = 0;
  const walletAgeMonths = Number(input.identity?.walletAgeMonths || 0);
  if (walletAgeMonths >= 6) {
    walletAgeBaseScore = 200;
  } else if (walletAgeMonths >= 3) {
    walletAgeBaseScore = 100;
  }
  
  const { fbs, reasonCodes: fbsReasons } = computeFBS({
    creditHistory: input.creditHistory || null,
    activityMetrics: input.activityMetrics || {}
  });

  const crdtScoreRaw = ias + fbs + walletAgeBaseScore;
  
  // Apply Unlock Risk Multiplier (Phase 5 Intelligence)
  const multiplier = getUnlockRiskMultiplier(input.marketData?.unlocks);
  
  const crdtScore = clamp(Math.round(crdtScoreRaw * multiplier), 0, 1000);
  
  const crdtTier = scoreToTier({ ias, fbs, crdtScore });
  const reasonCodes = [...iasReasons, ...fbsReasons];
  if (walletAgeBaseScore > 0) {
    reasonCodes.push(`wallet_age_bonus:${walletAgeMonths}mo`);
  }
  if (multiplier < 1.0) reasonCodes.push('upcoming_unlock_risk_adjustment');

  return {
    crdtTier,
    crdtScore,
    compositeScore: crdtScore, // Frontend compatibility
    score: crdtScore,         // Generic fallback
    ias,
    fbs,
    walletAgeBaseScore,
    reasonCodes,
    multiplier,
    modelVersion: MODEL_VERSION
  };
};

const POLICY_RULES = {
  small: { requiredTier: 1, requiredScore: 340 },
  medium: { requiredTier: 2, requiredScore: 500 },
  large: { requiredTier: 3, requiredScore: 620 }
};

const policyCheck = (crdtTier = 0, crdtScore = 0, band = 'small') => {
  const rule = POLICY_RULES[band] || POLICY_RULES.small;
  const tier = Number(crdtTier || 0);
  const score = Number(crdtScore || 0);
  return {
    band,
    allowed: tier >= rule.requiredTier && score >= rule.requiredScore,
    requiredTier: rule.requiredTier,
    requiredScore: rule.requiredScore
  };
};

module.exports = {
  MODEL_VERSION,
  TIER_NAMES,
  computeScore,
  policyCheck
};
