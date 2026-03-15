/**
 * Vestra Credit Score (VCS) Algorithm Logic
 * This utility calculates the institutional creditworthiness of a borrower.
 */

export interface VCSInputs {
  gitcoinScore: number;
  gitcoinStamps: number;
  walletAgeDays: number;
  txCount: number;
  repaymentCount: number;
  isCexFunded: boolean;
  unlockRiskMultiplier?: number; // Phase 5 Intelligence
}

export interface VCSResult {
  score: number;
  tier: 'Premium' | 'Standard' | 'At Risk';
  breakdown: {
    identity: number;
    history: number;
    behavior: number;
  };
  unlockRiskMultiplier: number;
}

export function calculateVCS(inputs: VCSInputs): VCSResult {
  const { gitcoinScore, walletAgeDays, txCount, repaymentCount, isCexFunded, unlockRiskMultiplier = 1.0 } = inputs;

  // 1. Identity Component (40%) - Max 400
  const identityScore = Math.min(400, (gitcoinScore / 100) * 400);

  // 2. History Component (30%) - Max 300
  const repaymentBonus = Math.min(200, repaymentCount * 50);
  const ageScore = Math.min(100, (walletAgeDays / 365) * 100);
  const historyScore = repaymentBonus + ageScore;

  // 3. Behavior Component (30%) - Max 300
  const txScore = Math.min(300, (txCount / 100) * 200);
  const behavioralDrift = isCexFunded ? -100 : 100;
  const behaviorScore = Math.max(0, txScore + behavioralDrift);

  // Apply Unlock Risk Multiplier
  const baseScore = identityScore + historyScore + behaviorScore;
  const totalScore = Math.round(baseScore * unlockRiskMultiplier);

  let tier: VCSResult['tier'] = 'Standard';
  if (totalScore >= 750) tier = 'Premium';
  else if (totalScore < 400) tier = 'At Risk';

  return {
    score: totalScore,
    tier,
    breakdown: {
      identity: Math.round(identityScore * unlockRiskMultiplier),
      history: Math.round(historyScore * unlockRiskMultiplier),
      behavior: Math.round(behaviorScore * unlockRiskMultiplier)
    },
    unlockRiskMultiplier
  };
}
