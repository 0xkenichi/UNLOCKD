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
export const BASELINE_SCORE = 500;

/** Maximum bonus from Gitcoin Passport (unchanged). */
export const MAX_GITCOIN_BONUS = 150;

/**
 * Minimum Gitcoin Passport score to be treated as a real identity.
 * Scores below this threshold indicate a likely sybil wallet and contribute 0.
 */
export const GITCOIN_SYBIL_THRESHOLD = 10;

/** Flat bonus for verified World ID proof-of-personhood. */
export const WORLD_ID_BONUS = 100;

/**
 * Maximum bonus from EAS attestations.
 * At 25 pts per attestation, this caps effective attestations at 4.
 * Prevents attestation farming from nullifying default penalties.
 */
export const MAX_ATTESTATION_BONUS = 100;

/** Points per qualifying attestation. */
export const ATTESTATION_POINTS_EACH = 25;

/**
 * Maximum age (in days) for an EAS attestation to be considered valid.
 * Attestations older than this are treated as stale and ignored.
 */
export const MAX_ATTESTATION_AGE_DAYS = 365;

/**
 * Set of recognised EAS schema IDs Vestra trusts.
 * Attestations with an unrecognised schema contribute nothing.
 * Add new trusted schemas here as integrations expand.
 */
export const TRUSTED_SCHEMA_IDS = new Set([
  '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // KYC-lite
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', // Vestra repayment
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', // Protocol partner
]);

/** Maximum bonus from on-chain wallet activity (tx count). */
export const MAX_TX_BONUS = 100;

/** Maximum bonus from wallet balance. */
export const MAX_BALANCE_BONUS = 75;

/**
 * Maximum bonus from repaid loans.
 * At 20 pts per loan, this caps effective loans at 10.
 */
export const MAX_REPAYMENT_BONUS = 200;

/** Points per successfully repaid Vestra loan. */
export const REPAYMENT_POINTS_EACH = 20;

/**
 * Maximum default penalty (applied at t=0, i.e. default just occurred).
 * Decays linearly toward DEFAULT_FLOOR_PENALTY over DEFAULT_FULL_DECAY_DAYS.
 */
export const DEFAULT_MAX_PENALTY = 300;

/**
 * Minimum (floor) default penalty that persists indefinitely after decay completes.
 * Ensures that old defaults never become completely irrelevant.
 */
export const DEFAULT_FLOOR_PENALTY = 50;

/**
 * Number of days over which the default penalty decays from MAX to FLOOR.
 * At 730 days (2 years), the penalty reaches DEFAULT_FLOOR_PENALTY and stops decaying.
 */
export const DEFAULT_FULL_DECAY_DAYS = 730;

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
export function validateAndNormalise(data) {
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
export function scoreGitcoinPassport(gitcoinPassportScore) {
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
export function scoreAttestations(attestations, nowSecs) {
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
export function scoreWalletActivity(txCount, balanceUsd) {
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
export function scoreRepayments(totalRepaidLoans) {
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
export function computeDefaultPenalty(defaults, hasDefaults, nowSecs) {
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
    const severity      = Math.max(0.5, Math.min(2.0, record.severity || 1.0));
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
 * Calculates the Vestra Credit Score (VCS) for a given identity data bundle.
 *
 * @param {VCSInput} rawData
 * @returns {VCSResult}
 */
export function calculateIdentityCreditScore(rawData) {
  const data   = validateAndNormalise(rawData);
  const nowSec = data.nowTimestamp || Math.floor(Date.now() / 1000);
  const flags  = [];

  // ── 1. Identity Providers ────────────────────────────────────────────────

  const gitcoinBonus  = scoreGitcoinPassport(data.gitcoinPassportScore);
  const worldIdBonus  = data.hasWorldID ? WORLD_ID_BONUS : 0;

  if (data.gitcoinPassportScore && data.gitcoinPassportScore < GITCOIN_SYBIL_THRESHOLD) {
    flags.push('GITCOIN_SYBIL_RISK');
  }

  // ── 2. EAS Attestations (quality-filtered + capped) ──────────────────────

  const { bonus: attestationBonus, qualified, dropped } =
    scoreAttestations(data.attestations, nowSec);

  if (dropped > 0) {
    flags.push(`ATTESTATIONS_DROPPED:${dropped}`);
  }

  // ── 3. Wallet Activity ────────────────────────────────────────────────────

  const activityBonus = scoreWalletActivity(data.txCount, data.balanceUsd);

  // ── 4. Credit History ─────────────────────────────────────────────────────

  const repaymentBonus = scoreRepayments(data.totalRepaidLoans);

  const { penalty: defaultPenalty, details: defaultDetails } =
    computeDefaultPenalty(data.defaults, data.hasDefaults, nowSec);

  if (defaultPenalty > 0) {
    flags.push(`DEFAULT_PENALTY:${defaultPenalty}`);
  }

  // ── 5. Assemble score ─────────────────────────────────────────────────────

  const breakdown = {
    baseline:        BASELINE_SCORE,
    gitcoinPassport: gitcoinBonus,
    worldId:         worldIdBonus,
    attestations:    attestationBonus,
    walletActivity:  activityBonus,
    repayments:      repaymentBonus,
    defaultPenalty:  -defaultPenalty,
  };

  let score = BASELINE_SCORE
    + gitcoinBonus
    + worldIdBonus
    + attestationBonus
    + activityBonus
    + repaymentBonus
    - defaultPenalty;

  score = Math.max(0, Math.min(score, 1000));

  // ── 6. Tier ────────────────────────────────────────────────────────────────

  let tier = 'STANDARD';
  if (score >= 800) tier = 'TITAN';
  else if (score >= 650) tier = 'PREMIUM';

  return {
    score,
    tier,
    riskMultiplier: (1000 - score) / 1000, // 0.0 (safest) → 1.0 (riskiest)
    breakdown,
    flags,
    // Attestation stats for downstream audit
    attestationStats: { total: (data.attestations || []).length, qualified, dropped },
    // Default details for audit trail
    defaultDetails,
  };
}
