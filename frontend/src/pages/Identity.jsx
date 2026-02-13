import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import VerifiedCard from '../components/identity/VerifiedCard.jsx';
import TierBadge from '../components/common/TierBadge.jsx';
import { fetchIdentity, fetchPassportScore } from '../utils/api.js';

export default function Identity() {
  const { address } = useAccount();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [passportLoading, setPassportLoading] = useState(false);
  const [passportResult, setPassportResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!address) {
      setProfile(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    fetchIdentity(address)
      .then((data) => {
        if (active) {
          setProfile(data);
          setError('');
        }
      })
      .catch((err) => {
        if (active) {
          setProfile(null);
          setError(err?.message || 'Failed to load identity');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [address]);

  const handlePassportCheck = async () => {
    if (!address) return;
    setPassportLoading(true);
    setPassportResult(null);
    try {
      const data = await fetchPassportScore(address);
      setPassportResult(data);
      if (data?.identityTier != null && profile) {
        setProfile((prev) => ({ ...prev, ...data }));
      } else if (data?.ok && data?.identityTier != null) {
        setProfile((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      setPassportResult({ error: err?.message || 'Passport check failed' });
    } finally {
      setPassportLoading(false);
    }
  };

  const tierLabel =
    profile?.tierName ||
    (profile?.identityTier != null
      ? ['Anonymous', 'Basic', 'Standard', 'Verified', 'Trusted', 'Institutional'][
          profile.identityTier
        ]
      : 'Anonymous');

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Identity</h1>
        <div className="page-subtitle">
          Optional verification unlocks better loan terms. Your data stays private; only outcomes are
          stored.
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration
          variant="identity"
          identityData={{
            walletAddress: address || null,
            compositeScore: profile?.compositeScore ?? null,
            identityTier: profile?.identityTier ?? 0,
            tierName: tierLabel,
            passportResult
          }}
        />
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Verification Tier</div>
          <div className="stat-value">
            {address ? (
              <TierBadge tier={profile?.identityTier ?? 0} tierName={tierLabel} size="medium" />
            ) : (
              '—'
            )}
          </div>
          <div className="stat-delta">Upgrade to unlock LTV</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Composite Score</div>
          <div className="stat-value">{profile?.compositeScore != null ? profile.compositeScore : '—'}</div>
          <div className="stat-delta">IAS + FBS (0-1000)</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Eligibility</div>
          <div className="stat-value">
            {profile?.policy?.small?.allowed
              ? 'Small loans'
              : profile?.policy?.medium?.allowed
              ? 'Medium'
              : profile?.policy?.large?.allowed
              ? 'Large'
              : 'Pending'}
          </div>
          <div className="stat-delta">Policy bands</div>
        </div>
      </div>
      {error && (
        <div className="holo-card" style={{ borderColor: 'var(--danger-600)' }}>
          <p className="muted">{error}</p>
        </div>
      )}
      <div className="grid-2">
        <VerifiedCard
          identityTier={profile?.identityTier ?? 0}
          tierName={profile?.tierName}
          compositeScore={profile?.compositeScore}
          ias={profile?.ias}
          fbs={profile?.fbs}
          policy={profile?.policy}
          attestations={[]}
          hasWallet={Boolean(address)}
          loading={loading}
        />
        <div className="holo-card">
          <h3 className="holo-title">Tier upgrade</h3>
          <div className="muted">
            Higher tiers require more verification (e.g. Gitcoin Passport, World ID) and repayment
            history.
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="pill">Current: {tierLabel}</div>
            <div className="pill">Target: Verified (Tier 3) or higher</div>
          </div>
          <button
            className="button"
            type="button"
            onClick={() =>
              document
                .getElementById('identity-checklist')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            View requirements
          </button>
        </div>
      </div>
      <div className="holo-card" id="identity-checklist">
        <div className="section-head">
          <div>
            <h3 className="section-title">Verification checklist</h3>
            <div className="section-subtitle">Complete steps to raise your tier</div>
          </div>
        </div>
        <div className="card-list" style={{ marginBottom: 16 }}>
          <div className={`pill ${address ? 'success' : ''}`} style={address ? { borderColor: 'var(--success-600)' } : {}}>
            {address ? '✓ ' : ''}Connect wallet
          </div>
          <div className={`pill ${(profile?.identityTier ?? 0) >= 1 ? 'success' : ''}`}>
            {(profile?.identityTier ?? 0) >= 1 ? '✓ ' : ''}Add verification (Passport or attest)
          </div>
          <div className={`pill ${(profile?.identityTier ?? 0) >= 2 ? 'success' : ''}`}>
            {(profile?.identityTier ?? 0) >= 2 ? '✓ ' : ''}Reach Standard tier for best access
          </div>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <button
            type="button"
            className="button button--secondary"
            onClick={handlePassportCheck}
            disabled={!address || passportLoading}
          >
            {passportLoading ? 'Checking...' : 'Verify with Gitcoin Passport'}
          </button>
          {passportResult && (
            <div className="muted" style={{ fontSize: 12 }}>
              {passportResult.error ? (
                <span style={{ color: 'var(--danger-400)' }}>{passportResult.error}</span>
              ) : (
                <>
                  Score: {passportResult.score ?? '—'} · Stamps: {passportResult.stampsCount ?? 0}
                  {passportResult.attestationCreated && ' · Attestation saved'}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
