/**
 * Vestra Identity & Credit Score Logic
 * Calculates VCS (Vestra Credit Score) based on:
 * 1. Identity Verification (World ID, Gitcoin Passport)
 * 2. Attestations (EAS)
 * 3. Wallet Activity (Tx count, balance)
 * 4. Credit History (Prior loans)
 */

export function calculateIdentityCreditScore(data) {
  let score = 500; // Baseline Score (0-1000 range)
  
  // 1. Identity Providers
  if (data.gitcoinPassportScore) {
    // Gitcoin Passport weight: max +150
    score += Math.min(data.gitcoinPassportScore * 3, 150);
  }
  
  if (data.hasWorldID) {
    score += 100;
  }

  // 2. Attestations (EAS)
  if (data.attestations && data.attestations.length > 0) {
    score += data.attestations.length * 25;
  }

  // 3. Wallet Activity
  if (data.txCount > 100) score += 50;
  if (data.txCount > 500) score += 50;
  
  const balanceUsd = parseFloat(data.balanceUsd || '0');
  if (balanceUsd > 1000) score += 25;
  if (balanceUsd > 10000) score += 50;

  // 4. Credit History (Internal Vestra Data)
  if (data.totalRepaidLoans > 0) {
    score += data.totalRepaidLoans * 20;
  }
  
  if (data.hasDefaults) {
    score -= 300;
  }

  // Cap the score
  score = Math.max(0, Math.min(score, 1000));

  // Determine Tier
  let tier = 'STANDARD';
  if (score >= 800) tier = 'TITAN';
  else if (score >= 650) tier = 'PREMIUM';

  return {
    score,
    tier,
    riskMultiplier: (1000 - score) / 1000 // 0.0 (safest) to 1.0 (riskiest)
  };
}
