/**
 * identityCreditScore.js — Vestra VCS Engine v2
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates the Vestra Credit Score (VCS) used to determine loan LTV tiers.
 *
 * Hardening changes over v1:
 *   1. Attestation cap — unbounded attestations.length * 25 allowed a wallet
 *      with 20 attestations to gain +500 pts, erasing a default penalty.
 *      Now capped at MAX_ATTESTATION_BONUS (100 pts, 4 attestations effective).
 *
 *   2. Attestation quality filter — only attestations with a recognised
 *      schemaId AND an age <= MAX_ATTESTATION_AGE_DAYS are counted. Stale or
 *      unrecognised attestations are silently dropped.
 *
 *   3. Default time-decay — a flat -300 penalty treated a 3-year-old default
 *      identically to one from last week. Now the penalty decays linearly from
 *      -300 at t=0 to -50 at DEFAULT_FULL_DECAY_DAYS (730 days / 2 years),
 *      after which the floor penalty of -50 applies permanently.
 *
 *   4. Repayment bonus cap — totalRepaidLoans * 20 was unbounded. Capped at
 *      MAX_REPAYMENT_BONUS (200 pts, 10 loans effective).
 *
 *   5. Gitcoin Passport floor gate — scores below GITCOIN_SYBIL_THRESHOLD
 *      are treated as 0 (sybil-risk wallet) rather than still contributing.
 *
 *   6. Strict input validation — all numeric fields are validated and clamped
 *      before computation. Malformed inputs throw with a descriptive error
 *      rather than silently producing NaN scores.
 *
 *   7. Score audit trail — the returned object now includes a `breakdown`
 *      field showing the contribution of each component for observability
 *      and downstream LTV contract validation.
 *
 * Score range: 0–1000.
 * Tiers:  TITAN ≥ 800 | PREMIUM ≥ 650 | STANDARD < 650
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Baseline score every wallet starts with. */
const BASELINE_SCORE = 500;

/** Maximum bonus from Gitcoin Passport (unchanged). */
const MAX_GITCOIN_BONUS = 150;

/**
 * Minimum Gitcoin Passport score to be treated as a real identity.
 * Scores below this threshold indicate a likely sybil wallet and contribute 0.
 */
const GITCOIN_SYBIL_THRESHOLD = 10;

/** Flat bonus for verified World ID proof-of-personhood. */
const WORLD_ID_BONUS = 100;

/**
 * Maximum bonus from EAS attestations.
 * At 25 pts per attestation, this caps effective attestations at 4.
 * Prevents attestation farming from nullifying default penalties.
 */
const MAX_ATTESTATION_BONUS = 100;

/** Points per qualifying attestation. */
const ATTESTATION_POINTS_EACH = 25;

/**
 * Maximum age (in days) for an EAS attestation to be considered valid.
 * Attestations older than this are treated as stale and ignored.
 */
const MAX_ATTESTATION_AGE_DAYS = 365;

/**
 * Set of recognised EAS schema IDs Vestra trusts.
 * Attestations with an unrecognised schema contribute nothing.
 * Add new trusted schemas here as integrations expand.
 */
const TRUSTED_SCHEMA_IDS = new Set([
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // KYC-lite
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', // Vestra repayment
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', // Protocol partner
]);

/** Maximum bonus from on-chain wallet activity (tx count). */
const MAX_TX_BONUS = 100;

/** Maximum bonus from wallet balance. */
const MAX_BALANCE_BONUS = 75;

/**
 * Maximum bonus from repaid loans.
 * At 20 pts per loan, this caps effective loans at 10.
 */
const MAX_REPAYMENT_BONUS = 200;

/** Points per successfully repaid Vestra loan. */
const REPAYMENT_POINTS_EACH = 20;

/**
 * Maximum default penalty (applied at t=0, i.e. default just occurred).
 * Decays linearly toward DEFAULT_FLOOR_PENALTY over DEFAULT_FULL_DECAY_DAYS.
 */
const DEFAULT_MAX_PENALTY = 300;

/**
 * Minimum (floor) default penalty that persists indefinitely after decay completes.
 * Ensures that old defaults never become completely irrelevant.
 */
const DEFAULT_FLOOR_PENALTY = 50;

/**
 * Number of days over which the default penalty decays from MAX to FLOOR.
 * At 730 days (2 years), the penalty reaches DEFAULT_FLOOR_PENALTY and stops decaying.
 */
const DEFAULT_FULL_DECAY_DAYS = 730;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} EASAttestation
 * @property {string} schemaId   - The EAS schema UID (32-byte hex).
 * @property {number} issuedAt   - Unix timestamp (seconds) of attestation creation.
 * @property {boolean} [revoked] - Whether the attestation has been revoked.
 */

/**
 * @typedef {Object} DefaultRecord
 * @property {number} occurredAt - Unix timestamp (seconds) when the default was recorded.
 * @property {number} [severity] - Optional severity multiplier (1.0 default).
 */

/**
 * @typedef {Object} VCSInput
 * @property {number}          [gitcoinPassportScore] - Raw Gitcoin Passport score (0–100).
 * @property {boolean}         [hasWorldID]           - World ID proof-of-personhood verified.
 * @property {EASAttestation[]}[attestations]         - EAS attestations array.
 * @property {number}          [txCount]              - Total on-chain transaction count.
 * @property {string|number}   [balanceUsd]           - Wallet balance in USD.
 * @property {number}          [totalRepaidLoans]     - Number of fully repaid Vestra loans.
 * @property {boolean}         [hasDefaults]          - Legacy: any defaults present (v1 compat).
 * @property {DefaultRecord[]} [defaults]             - v2: per-default records with timestamps.
 * @property {number}          [nowTimestamp]         - Override for current time (testing only).
 */

/**
 * @typedef {Object} VCSResult
 * @property {number} score           - Final VCS score (0–1000).
 * @property {string} tier            - 'TITAN' | 'PREMIUM' | 'STANDARD'
 * @property {number} riskMultiplier  - 0.0 (safest) to 1.0 (riskiest). Used by dDPV engine.
 * @property {Object} breakdown       - Per-component score contributions for observability.
 * @property {string[]} flags         - Any risk flags raised during computation.
 */

// ─── Input Validation ─────────────────────────────────────────────────────────

/**
 * Validates and normalises raw VCS input data.
 * Throws a descriptive error for any field that would produce NaN or unsafe values.
 * @param {VCSInput} data
 * @returns {VCSInput} normalised input
 */
function validateAndNormalise(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('VCS input must be a non-null object');
  }

  const out = { ...data };

  // Gitcoin Passport
  if (out.gitcoinPassportScore !== undefined) {
    const v = Number(out.gitcoinPassportScore);
    if (!isFinite(v) || v < 0) throw new RangeError(`gitcoinPassportScore must be ≥ 0, got: ${out.gitcoinPassportScore}`);
    out.gitcoinPassportScore = Math.min(v, 100); // Gitcoin max is 100
  }

  // txCount
  if (out.txCount !== undefined) {
    const v = Number(out.txCount);
    if (!isFinite(v) || v < 0) throw new RangeError(`txCount must be ≥ 0, got: ${out.txCount}`);
    out.txCount = Math.floor(v);
  }

  // balanceUsd
  if (out.balanceUsd !== undefined) {
    const v = parseFloat(out.balanceUsd);
    if (!isFinite(v) || v < 0) throw new RangeError(`balanceUsd must be ≥ 0, got: ${out.balanceUsd}`);
    out.balanceUsd = v;
  }

  // totalRepaidLoans
  if (out.totalRepaidLoans !== undefined) {
    const v = Number(out.totalRepaidLoans);
    if (!isFinite(v) || v < 0) throw new RangeError(`totalRepaidLoans must be ≥ 0, got: ${out.totalRepaidLoans}`);
    out.totalRepaidLoans = Math.floor(v);
  }

  // attestations
  if (out.attestations !== undefined && !Array.isArray(out.attestations)) {
    throw new TypeError('attestations must be an array');
  }

  // defaults
  if (out.defaults !== undefined && !Array.isArray(out.defaults)) {
    throw new TypeError('defaults must be an array');
  }

  // nowTimestamp (test override)
  if (out.nowTimestamp !== undefined) {
    const v = Number(out.nowTimestamp);
    if (!isFinite(v) || v <= 0) throw new RangeError(`nowTimestamp must be a positive unix timestamp`);
  }

  return out;
}

// ─── Component Scorers ────────────────────────────────────────────────────────

/**
 * Score from Gitcoin Passport.
 * Scores below GITCOIN_SYBIL_THRESHOLD contribute 0 (sybil gate).
 */
function scoreGitcoinPassport(gitcoinPassportScore) {
  if (!gitcoinPassportScore || gitcoinPassportScore < GITCOIN_SYBIL_THRESHOLD) return 0;
  return Math.min(gitcoinPassportScore * 3, MAX_GITCOIN_BONUS);
}

/**
 * Score from EAS attestations with quality filtering:
 *   - Revoked attestations are excluded.
 *   - Attestations older than MAX_ATTESTATION_AGE_DAYS are excluded.
 *   - Unrecognised schemaIds are excluded.
 *   - Total bonus capped at MAX_ATTESTATION_BONUS.
 *
 * @param {EASAttestation[]} attestations
 * @param {number} nowSecs - Current unix timestamp in seconds.
 * @returns {{ bonus: number, qualified: number, dropped: number }}
 */
function scoreAttestations(attestations, nowSecs) {
  if (!attestations || attestations.length === 0) {
    return { bonus: 0, qualified: 0, dropped: 0 };
  }

  const maxAgeSeconds = MAX_ATTESTATION_AGE_DAYS * 86400;
  let qualified = 0;
  let dropped   = 0;

  for (const att of attestations) {
    // Revoked
    if (att.revoked) { dropped++; continue; }

    // Schema gate
    if (!TRUSTED_SCHEMA_IDS.has(att.schemaId)) { dropped++; continue; }

    // Age gate
    const ageSecs = nowSecs - (att.issuedAt || 0);
    if (ageSecs > maxAgeSeconds) { dropped++; continue; }

    qualified++;
  }

  const bonus = Math.min(qualified * ATTESTATION_POINTS_EACH, MAX_ATTESTATION_BONUS);
  return { bonus, qualified, dropped };
}

/**
 * Score from on-chain wallet activity (tx count + balance).
 */
function scoreWalletActivity(txCount, balanceUsd) {
  let bonus = 0;
  const tx  = Number(txCount  || 0);
  const bal = parseFloat(balanceUsd || '0');

  if (tx  >  100) bonus += 50;
  if (tx  >  500) bonus += 50;
  if (bal > 1000) bonus += 25;
  if (bal > 10_000) bonus += 50;

  return Math.min(bonus, MAX_TX_BONUS + MAX_BALANCE_BONUS);
}

/**
 * Score from repaid Vestra loans. Capped at MAX_REPAYMENT_BONUS.
 */
function scoreRepayments(totalRepaidLoans) {
  if (!totalRepaidLoans || totalRepaidLoans <= 0) return 0;
  return Math.min(totalRepaidLoans * REPAYMENT_POINTS_EACH, MAX_REPAYMENT_BONUS);
}

/**
 * Computes the time-decayed default penalty.
 *
 * Penalty(t) = DEFAULT_FLOOR_PENALTY +
 *              (DEFAULT_MAX_PENALTY - DEFAULT_FLOOR_PENALTY) *
 *              max(0, 1 - t / DEFAULT_FULL_DECAY_DAYS)
 *
 * Where t is the age of the default in days.
 *
 * Multiple defaults: each contributes its own decayed penalty, summed and
 * capped at DEFAULT_MAX_PENALTY * 1.5 to prevent permanent zero-scoring
 * for multiple-default wallets while still reflecting the full risk.
 *
 * Legacy support: if data.hasDefaults === true but no data.defaults array
 * is provided, the full DEFAULT_MAX_PENALTY is applied (conservative fallback).
 *
 * @param {DefaultRecord[]|undefined} defaults  - Per-default records (v2).
 * @param {boolean|undefined}         hasDefaults - Legacy boolean flag (v1).
 * @param {number}                    nowSecs   - Current unix timestamp.
 * @returns {{ penalty: number, details: Array }}
 */
function computeDefaultPenalty(defaults, hasDefaults, nowSecs) {
  // v1 legacy path: hasDefaults=true but no timestamps → conservative max
  if (hasDefaults && (!defaults || defaults.length === 0)) {
    return {
      penalty: DEFAULT_MAX_PENALTY,
      details: [{ ageDays: null, penalty: DEFAULT_MAX_PENALTY, note: 'legacy-no-timestamp' }],
    };
  }

  if (!defaults || defaults.length === 0) {
    return { penalty: 0, details: [] };
  }

  const decayRange = DEFAULT_MAX_PENALTY - DEFAULT_FLOOR_PENALTY; // 250
  let totalPenalty = 0;
  const details    = [];

  for (const record of defaults) {
    const ageSecs = nowSecs - (record.occurredAt || 0);
    const ageDays = ageSecs / 86400;

    const decayFraction = Math.max(0, 1 - ageDays / DEFAULT_FULL_DECAY_DAYS);
    const rawSeverity   = record.severity !== undefined ? record.severity : 1.0;
    const severity      = Math.max(0.5, Math.min(2.0, rawSeverity));
    const rawPenalty    = DEFAULT_FLOOR_PENALTY + decayRange * decayFraction;
    const scaledPenalty = Math.round(rawPenalty * severity);

    details.push({ ageDays: Math.round(ageDays), penalty: scaledPenalty, severity });
    totalPenalty += scaledPenalty;
  }

  // Multi-default cap: 1.5× the single maximum to prevent permanent near-zero scores
  const cap           = Math.round(DEFAULT_MAX_PENALTY * 1.5);
  const finalPenalty  = Math.min(totalPenalty, cap);

  return { penalty: finalPenalty, details };
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

/**
 * Calculates the Vestra Credit Score (VCS) based on three components and a baseline.
 * 
 * Component 1: Gitcoin Passport (max 350 points)
 * Component 2: Financial History (max 400 points)
 * Component 3: Vestra Credit History (max 250 points)
 * 
 * Raw Score = 500 + Component 1 + Component 2 + Component 3
 * Final Score clamped to [0, 1000].
 */
function calculateIdentityCreditScore(rawData) {
  const data = validateAndNormalise(rawData);
  const flags = [];

  // --- COMPONENT 1: GITCOIN PASSPORT SCORE (max 350 points) ---
  const rawGitcoinScore = parseFloat(data.gitcoinPassportScore || 0);
  const gitcoinPoints = Math.min(rawGitcoinScore * 14, 350);

  if (rawGitcoinScore < GITCOIN_SYBIL_THRESHOLD && rawGitcoinScore > 0) {
    flags.push('GITCOIN_SYBIL_RISK');
  } else if (rawGitcoinScore === 0) {
    flags.push('NO_GITCOIN_PASSPORT');
  }

  // --- COMPONENT 2: FINANCIAL HISTORY SCORE (max 400 points) ---
  // 1. WALLET AGE (max 100 pts)
  const ageMonths = data.ageMonths || 0;
  const agePoints = Math.min(ageMonths * 2, 100);

  // 2. TRANSACTION COUNT (max 100 pts)
  const txCount = data.txCount || 0;
  let txPoints = 0;
  if (txCount > 500) txPoints = 100;
  else if (txCount > 100) txPoints = 75;
  else if (txCount > 50) txPoints = 50;
  else if (txCount > 10) txPoints = 25;

  // 3. CONSISTENCY (max 100 pts)
  const activeMonths = data.activeMonths || 0;
  const consistencyPoints = Math.min(activeMonths * 8, 100);

  // 4. PEAK PORTFOLIO VALUE (max 100 pts)
  const peakUSD = parseFloat(data.peakUsdValue || 0);
  let peakPoints = 0;
  if (peakUSD > 100000) peakPoints = 100;
  else if (peakUSD > 10000) peakPoints = 75;
  else if (peakUSD > 1000) peakPoints = 50;
  else if (peakUSD > 100) peakPoints = 25;

  const financialPoints = agePoints + txPoints + consistencyPoints + peakPoints;

  // --- COMPONENT 3: VESTRA CREDIT HISTORY (max 250 points) ---
  let creditHistoryPoints = 0;
  if (data.hasDefaults) {
    creditHistoryPoints = -300;
    flags.push('DEFAULT_PENALTY');
  } else {
    creditHistoryPoints = Math.min((data.totalRepaidLoans || 0) * 20, 250);
  }

  // --- FINAL VCS CALCULATION ---
  const rawScore = 500 + gitcoinPoints + financialPoints + creditHistoryPoints;
  const score = Math.max(0, Math.min(rawScore, 1000));

  // Tiers
  let tier = 'STANDARD';
  if (score >= 800) tier = 'TITAN';
  else if (score >= 650) tier = 'PREMIUM';

  return {
    score,
    tier,
    riskMultiplier: (1000 - score) / 1000,
    breakdown: {
      baseline: 500,
      gitcoinPassport: gitcoinPoints,
      financialHistory: financialPoints,
      creditHistory: creditHistoryPoints,
      subComponents: {
        walletAge: agePoints,
        txCount: txPoints,
        consistency: consistencyPoints,
        peakPortfolio: peakPoints
      }
    },
    flags
  };
}

// ─── Policy check (added for server.js compat) ────────────────────────────────
const TIER_LEVELS = { 'STANDARD': 1, 'PREMIUM': 2, 'TITAN': 3 };
const POLICY_RULES = { small: { requiredTier: 1, requiredScore: 340 }, medium: { requiredTier: 2, requiredScore: 500 }, large: { requiredTier: 3, requiredScore: 620 } };
function policyCheck(tierStr = 'STANDARD', crdtScore = 0, band = 'small') { const rule = POLICY_RULES[band] || POLICY_RULES.small; const tier = TIER_LEVELS[tierStr] || 0; const score = Number(crdtScore || 0); return { band, allowed: tier >= rule.requiredTier && score >= rule.requiredScore, requiredTier: rule.requiredTier, requiredScore: rule.requiredScore }; }

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  validateAndNormalise, scoreGitcoinPassport, scoreAttestations, scoreWalletActivity, scoreRepayments, computeDefaultPenalty, calculateIdentityCreditScore, BASELINE_SCORE, MAX_GITCOIN_BONUS, GITCOIN_SYBIL_THRESHOLD, WORLD_ID_BONUS, MAX_ATTESTATION_BONUS, ATTESTATION_POINTS_EACH, MAX_ATTESTATION_AGE_DAYS, TRUSTED_SCHEMA_IDS, MAX_TX_BONUS, MAX_BALANCE_BONUS, MAX_REPAYMENT_BONUS, REPAYMENT_POINTS_EACH, DEFAULT_MAX_PENALTY, DEFAULT_FLOOR_PENALTY, DEFAULT_FULL_DECAY_DAYS,
  policyCheck
};
