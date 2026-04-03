/**
 * Vestra Credit Score (VCS) Engine v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Computes a 0–1000 score from five weighted provider categories.
 * Tier thresholds: TITAN ≥ 800 | PREMIUM ≥ 650 | STANDARD < 650
 *
 * Score feeds directly into the dDPV formula as an LTV modifier and
 * rate-discount multiplier — see vcsImpactOnDDPV() below.
 *
 * @license BSL-1.1  Copyright © 2026 Vestra Protocol
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type VcsTier = "TITAN" | "PREMIUM" | "STANDARD";

/** Raw inputs from on-chain + off-chain data sources */
export interface VcsInput {
  // Identity providers
  gitcoinPassportScore: number;   // 0–100 raw Passport score
  hasWorldID: boolean;
  easAttestations: EasAttestation[];

  // On-chain activity
  txCount: number;
  walletAgedays: number;
  uniqueProtocolsUsed: number;    // distinct protocol contracts interacted with
  balanceUsd: number;

  // Vestra-internal credit history
  totalRepaidLoans: number;
  totalRepaidUsd: number;
  hasActiveDefaults: boolean;
  lateRepaymentCount: number;

  // Optional: VestraCRDT participation
  veCrdtBalance?: number;         // staked veCRDT amount
  gaugeVotesCount?: number;       // governance participation
}

export interface EasAttestation {
  schema: string;   // EAS schema UID
  attester: string; // attesting address
  revoked: boolean;
}

/** Detailed per-category breakdown returned alongside the final score */
export interface VcsBreakdown {
  identity: CategoryScore;
  activity: CategoryScore;
  creditHistory: CategoryScore;
  governance: CategoryScore;
  penalties: CategoryScore;
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
  score: number;              // 0–1000
  tier: VcsTier;
  riskMultiplier: number;     // 0.0 (safest) → 1.0 (riskiest)
  breakdown: VcsBreakdown;
  ltvBoostBps: number;        // basis points added to base LTV
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

const BASELINE = 500;

const TIER_THRESHOLDS: Record<VcsTier, number> = {
  TITAN:    800,
  PREMIUM:  650,
  STANDARD: 0,
};

// LTV boost in bps per tier above STANDARD
const LTV_BOOST_BPS: Record<VcsTier, number> = {
  TITAN:    1000, // +10%
  PREMIUM:  500,  // +5%
  STANDARD: 0,
};

// Rate adjustment in bps (negative = discount)
const RATE_ADJUSTMENT_BPS: Record<VcsTier, number> = {
  TITAN:    -400, // −4%
  PREMIUM:  -200, // −2%
  STANDARD: 0,
};

// Max borrow cap in USDC by tier
const MAX_BORROW_CAP: Record<VcsTier, number> = {
  TITAN:    2_000_000,
  PREMIUM:    500_000,
  STANDARD:   100_000,
};

// Omega floor — minimum Ω the protocol will accept for this borrower
const OMEGA_FLOOR: Record<VcsTier, number> = {
  TITAN:    0.7,
  PREMIUM:  0.5,
  STANDARD: 0.3,
};

// ─── Core scoring functions ────────────────────────────────────────────────────

function scoreIdentity(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  // Gitcoin Passport (max 150 pts)
  const gitcoinPts = Math.min(Math.floor(input.gitcoinPassportScore * 3), 150);
  factors.push({
    label: "Gitcoin Passport",
    earned: gitcoinPts,
    max: 150,
    note: `Raw score ${input.gitcoinPassportScore.toFixed(1)} × 3`,
  });

  // World ID (flat 100 pts)
  const worldIdPts = input.hasWorldID ? 100 : 0;
  factors.push({ label: "World ID", earned: worldIdPts, max: 100 });

  // EAS attestations (25 pts each, trusted schemas only, max 150)
  let easPts = 0;
  const trustedAttestations = input.easAttestations.filter(
    (a) => !a.revoked && TRUSTED_SCHEMAS[a.schema]
  );
  for (const att of trustedAttestations) {
    easPts += TRUSTED_SCHEMAS[att.schema]?.points ?? 25;
  }
  easPts = Math.min(easPts, 150);
  factors.push({
    label: "EAS attestations",
    earned: easPts,
    max: 150,
    note: `${trustedAttestations.length} trusted attestation(s)`,
  });

  const earned = gitcoinPts + worldIdPts + easPts;
  return { label: "Identity & Reputation", earned, max: 400, factors };
}

function scoreActivity(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  // Tx count (max 100)
  let txPts = 0;
  if (input.txCount > 50)  txPts += 25;
  if (input.txCount > 100) txPts += 25;
  if (input.txCount > 500) txPts += 25;
  if (input.txCount > 2000) txPts += 25;
  factors.push({ label: "Transaction count", earned: txPts, max: 100 });

  // Wallet age (max 60)
  let agePts = 0;
  if (input.walletAgedays > 90)  agePts += 20;
  if (input.walletAgedays > 365) agePts += 20;
  if (input.walletAgedays > 730) agePts += 20;
  factors.push({ label: "Wallet age", earned: agePts, max: 60, note: `${input.walletAgedays}d` });

  // Protocol diversity (max 60)
  let diversityPts = Math.min(input.uniqueProtocolsUsed * 10, 60);
  factors.push({ label: "Protocol diversity", earned: diversityPts, max: 60 });

  // Balance (max 80)
  let balPts = 0;
  if (input.balanceUsd > 500)    balPts += 20;
  if (input.balanceUsd > 5_000)  balPts += 20;
  if (input.balanceUsd > 50_000) balPts += 20;
  if (input.balanceUsd > 500_000) balPts += 20;
  factors.push({ label: "Portfolio balance", earned: balPts, max: 80 });

  const earned = txPts + agePts + diversityPts + balPts;
  return { label: "On-chain Activity", earned, max: 300, factors };
}

function scoreCreditHistory(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  // Repaid loans (20 pts each, max 100)
  const repaidPts = Math.min(input.totalRepaidLoans * 20, 100);
  factors.push({
    label: "Loans repaid",
    earned: repaidPts,
    max: 100,
    note: `${input.totalRepaidLoans} loans`,
  });

  // Volume repaid (max 100)
  let volumePts = 0;
  if (input.totalRepaidUsd > 1_000)  volumePts += 25;
  if (input.totalRepaidUsd > 10_000) volumePts += 25;
  if (input.totalRepaidUsd > 100_000) volumePts += 25;
  if (input.totalRepaidUsd > 1_000_000) volumePts += 25;
  factors.push({ label: "Repaid volume", earned: volumePts, max: 100 });

  const earned = repaidPts + volumePts;
  return { label: "Vestra Credit History", earned, max: 200, factors };
}

function scoreGovernance(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  const veCrdtBal = input.veCrdtBalance ?? 0;
  let stakePts = 0;
  if (veCrdtBal > 100)    stakePts += 25;
  if (veCrdtBal > 1_000)  stakePts += 25;
  if (veCrdtBal > 10_000) stakePts += 25;
  factors.push({ label: "veCRDT staked", earned: stakePts, max: 75 });

  const gaugeVotes = input.gaugeVotesCount ?? 0;
  const votePts = Math.min(gaugeVotes * 5, 25);
  factors.push({ label: "Gauge votes cast", earned: votePts, max: 25 });

  const earned = stakePts + votePts;
  return { label: "Governance Participation", earned, max: 100, factors };
}

function scorePenalties(input: VcsInput): CategoryScore {
  const factors: FactorScore[] = [];

  const defaultPenalty = input.hasActiveDefaults ? 300 : 0;
  factors.push({ label: "Active default", earned: defaultPenalty, max: 300 });

  const latePenalty = Math.min(input.lateRepaymentCount * 30, 150);
  factors.push({ label: "Late repayments", earned: latePenalty, max: 150, note: `${input.lateRepaymentCount}×` });

  const earned = defaultPenalty + latePenalty;
  return { label: "Penalties", earned, max: 450, factors };
}

// ─── Upgrade hints ────────────────────────────────────────────────────────────

function buildUpgradeHints(input: VcsInput, result: VcsResult): UpgradeHint[] {
  const hints: UpgradeHint[] = [];
  const gap = result.nextTierDelta ?? 0;
  if (!gap) return hints;

  if (!input.hasWorldID)
    hints.push({ action: "Verify World ID identity proof", pointsGain: 100, effort: "LOW" });

  if (input.gitcoinPassportScore < 30)
    hints.push({ action: "Complete Gitcoin Passport stamps", pointsGain: Math.min(150 - Math.floor(input.gitcoinPassportScore * 3), 90), effort: "LOW" });

  if (input.easAttestations.filter((a) => !a.revoked).length === 0)
    hints.push({ action: "Obtain EAS Builder credential", pointsGain: 30, effort: "MEDIUM" });

  if (input.totalRepaidLoans < 3)
    hints.push({ action: "Repay 3 Vestra loans on time", pointsGain: (3 - input.totalRepaidLoans) * 20, effort: "MEDIUM" });

  if ((input.veCrdtBalance ?? 0) < 1000)
    hints.push({ action: "Stake 1,000+ veCRDT tokens", pointsGain: 50, effort: "MEDIUM" });

  if (input.uniqueProtocolsUsed < 5)
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
  const governance   = scoreGovernance(input);
  const penalties    = scorePenalties(input);

  const rawScore =
    BASELINE +
    identity.earned +
    activity.earned +
    creditHistory.earned +
    governance.earned -
    penalties.earned;

  const score = Math.max(0, Math.min(Math.round(rawScore), 1000));

  let tier: VcsTier = "STANDARD";
  if (score >= TIER_THRESHOLDS.TITAN)   tier = "TITAN";
  else if (score >= TIER_THRESHOLDS.PREMIUM) tier = "PREMIUM";

  const riskMultiplier = parseFloat(((1000 - score) / 1000).toFixed(4));

  const nextTier: VcsTier | null =
    tier === "TITAN" ? null : tier === "PREMIUM" ? "TITAN" : "PREMIUM";
  const nextTierDelta = nextTier
    ? Math.max(0, TIER_THRESHOLDS[nextTier] - score)
    : null;

  const result: VcsResult = {
    score,
    tier,
    riskMultiplier,
    breakdown: { identity, activity, creditHistory, governance, penalties },
    ltvBoostBps:                LTV_BOOST_BPS[tier],
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

// ─── Demo ─────────────────────────────────────────────────────────────────────
// npx ts-node vcsEngine.ts

if (require.main === module) {
  const demo: VcsInput = {
    gitcoinPassportScore: 38,
    hasWorldID: true,
    easAttestations: [
      { schema: "0x7a4b2c9d1e6f3a8b5c2d9e4f1a6b3c8d5e2f7a1", attester: "0xVestra", revoked: false },
    ],
    txCount: 340,
    walletAgedays: 480,
    uniqueProtocolsUsed: 6,
    balanceUsd: 12_500,
    totalRepaidLoans: 2,
    totalRepaidUsd: 18_000,
    hasActiveDefaults: false,
    lateRepaymentCount: 0,
    veCrdtBalance: 750,
    gaugeVotesCount: 3,
  };

  const result = computeVcs(demo);
  console.log("Score:", result.score, "| Tier:", result.tier);
  console.log("Risk multiplier:", result.riskMultiplier);
  console.log("LTV boost:", result.ltvBoostBps / 100 + "%");
  console.log("Rate discount:", result.rateSurchargeOrDiscountBps / 100 + "%");
  console.log("Points to next tier:", result.nextTierDelta);
  console.log("\nUpgrade hints:");
  result.upgradeHints.forEach((h) =>
    console.log(`  [${h.effort}] +${h.pointsGain}pts — ${h.action}`)
  );

  const impact = vcsImpactOnDdpv(result, 3000, 1200); // 30% LTV, 12% APR base
  console.log("\ndDPV impact:");
  console.log(`  LTV: ${impact.baseLtvBps/100}% → ${impact.effectiveLtvBps/100}%`);
  console.log(`  APR: ${impact.baseRateBps/100}% → ${impact.effectiveRateBps/100}%`);
  console.log(`  Ω floor: ${impact.omegaFloor}`);
}
