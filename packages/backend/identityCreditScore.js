// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const MODEL_VERSION = 'v1.0.0';

const TIER_NAMES = {
  0: 'Anonymous',
  1: 'Basic',
  2: 'Standard',
  3: 'Verified',
  4: 'Trusted',
  5: 'Institutional'
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

const computeFBS = ({ creditHistory }) => {
  const repaidCount = Number(creditHistory?.repaidCount || 0);
  const defaultedCount = Number(creditHistory?.defaultedCount || 0);
  let score = 250;
  const reasonCodes = [];

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
  if (crdtScore >= 840 && ias >= 320 && fbs >= 380) return 5;
  if (crdtScore >= 740 && ias >= 270 && fbs >= 320) return 4;
  if (crdtScore >= 620 && ias >= 220 && fbs >= 260) return 3;
  if (crdtScore >= 500 && ias >= 160 && fbs >= 220) return 2;
  if (crdtScore >= 340 && ias >= 110) return 1;
  return 0;
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
    creditHistory: input.creditHistory || null
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
