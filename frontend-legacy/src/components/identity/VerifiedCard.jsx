// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import PassportSummary from '../common/PassportSummary.jsx';
import TierBadge from '../common/TierBadge.jsx';

const TIER_NAMES = {
  0: 'Anonymous',
  1: 'Basic',
  2: 'Standard',
  3: 'Verified',
  4: 'Trusted',
  5: 'Institutional'
};

function scoreBand(score) {
  if (score == null) return '—';
  if (score >= 780) return 'Excellent';
  if (score >= 700) return 'Good';
  if (score >= 620) return 'Fair';
  if (score >= 500) return 'Building';
  return 'New';
}

export default function VerifiedCard({
  identityTier = 0,
  tierName,
  compositeScore,
  ias,
  fbs,
  policy,
  attestations = [],
  passportScore = null,
  passportStamps = null,
  hasWallet = false,
  loading = false
}) {
  const tierLabel = tierName || TIER_NAMES[identityTier] || 'Anonymous';
  const band = useMemo(() => scoreBand(compositeScore), [compositeScore]);
  const totalStamps = useMemo(
    () => attestations.reduce((sum, item) => sum + Number(item?.stampsCount || 0), 0),
    [attestations]
  );
  const steps = useMemo(() => {
    const attestationLabel =
      attestations.length > 0
        ? `Add verification (${attestations.length} linked)`
        : 'Add verification (e.g. Gitcoin Passport)';
    const list = [
      { id: 'connect', label: 'Connect wallet', done: hasWallet },
      { id: 'attest', label: attestationLabel, done: attestations.length > 0 },
      { id: 'bind', label: 'Identity linked to address', done: identityTier >= 1 && attestations.length > 0 }
    ];
    return list;
  }, [hasWallet, attestations.length, identityTier]);

  const nextAction = useMemo(() => {
    if (!hasWallet) return { text: 'Connect your wallet', to: null };
    if (attestations.length === 0) return { text: 'Verify with Gitcoin Passport or attest', to: '/identity' };
    if (identityTier < 2) return { text: 'Add more verifications to reach Standard tier', to: '/identity' };
    return null;
  }, [hasWallet, attestations.length, identityTier]);

  if (loading) {
    return (
      <div className="holo-card verified-card">
        <div className="verified-card__header">
          <h3 className="holo-title">Verification status</h3>
        </div>
        <div className="loading-row">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="holo-card verified-card">
      <div className="verified-card__header">
        <h3 className="holo-title">Verification status</h3>
        <TierBadge tier={identityTier} tierName={tierLabel} compositeScore={compositeScore} size="medium" showScore />
      </div>
      <div className="verified-card__body">
        <div className="verified-card__stat-row">
          <div className="verified-card__stat">
            <span className="verified-card__stat-label">Score band</span>
            <span className="verified-card__stat-value">{band}</span>
          </div>
          {compositeScore != null && (
            <div className="verified-card__stat">
              <span className="verified-card__stat-label">Composite</span>
              <span className="verified-card__stat-value">{compositeScore}</span>
            </div>
          )}
          {(ias != null || fbs != null) && (
            <div className="verified-card__stat">
              <span className="verified-card__stat-label">IAS / FBS</span>
              <span className="verified-card__stat-value muted">{ias ?? '—'} / {fbs ?? '—'}</span>
            </div>
          )}
          <div className="verified-card__stat">
            <span className="verified-card__stat-label">Attestations</span>
            <span className="verified-card__stat-value muted">
              {attestations.length} · {totalStamps} stamps
            </span>
          </div>
          <div className="verified-card__stat">
            <span className="verified-card__stat-label">Gitcoin Passport</span>
            <PassportSummary
              className="verified-card__stat-value muted"
              score={passportScore}
              stamps={passportStamps}
              showLabel={false}
            />
          </div>
        </div>
        {policy && (
          <div className="verified-card__policy">
            <span className="tag">Small loans</span> {policy.small?.allowed ? 'Allowed' : 'Requires Tier 2+'}
            {' · '}
            <span className="tag">Medium</span> {policy.medium?.allowed ? 'Allowed' : `Tier ${policy.medium?.requiredTier}+`}
            {' · '}
            <span className="tag">Large</span> {policy.large?.allowed ? 'Allowed' : `Tier ${policy.large?.requiredTier}+`}
          </div>
        )}
        <div className="verified-card__checklist">
          <div className="section-subtitle" style={{ marginBottom: 8 }}>Checklist</div>
          <div className="card-list" style={{ gap: 6 }}>
            {steps.map((s) => (
              <div
                key={s.id}
                className={`pill ${s.done ? 'success' : ''}`}
                style={{ opacity: s.done ? 1 : 0.85 }}
              >
                {s.done ? '✓ ' : ''}{s.label}
              </div>
            ))}
          </div>
        </div>
        {nextAction && (
          <div className="verified-card__next">
            {nextAction.to ? (
              <Link to={nextAction.to} className="button button--secondary button--small">
                {nextAction.text}
              </Link>
            ) : (
              <span className="muted">{nextAction.text}</span>
            )}
          </div>
        )}
      </div>
      <div className="verified-card__privacy muted">
        Your raw identity data is not stored on-chain; only verification outcomes and score are used.
      </div>
    </div>
  );
}
