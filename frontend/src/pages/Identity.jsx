import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PassportSummary from '../components/common/PassportSummary.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import VerifiedCard from '../components/identity/VerifiedCard.jsx';
import TierBadge from '../components/common/TierBadge.jsx';
import PrivacyModeToggle from '../components/privacy/PrivacyModeToggle.jsx';
import PrivacyUpgradeWizard from '../components/privacy/PrivacyUpgradeWizard.jsx';
import { fetchIdentity, fetchPassportScore } from '../utils/api.js';
import { getPassportSnapshotFromAttestations } from '../utils/passport.js';
import { getActiveIdentity, useOnchainSession } from '../utils/onchainSession.js';
import { usePrivacyMode } from '../utils/privacyMode.js';

function formatProviderLabel(provider = '') {
  if (!provider) return 'Unknown provider';
  return String(provider)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

export default function Identity() {
  const { address } = useAccount();
  const { session } = useOnchainSession();
  const { enabled: privacyMode } = usePrivacyMode();
  const activeIdentity = getActiveIdentity(session, address);
  const activeWalletAddress = activeIdentity.walletAddress || '';
  const { signMessageAsync } = useSignMessage();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [passportLoading, setPassportLoading] = useState(false);
  const [passportResult, setPassportResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeWalletAddress) {
      setProfile(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    fetchIdentity(activeWalletAddress)
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
  }, [activeWalletAddress]);

  const handlePassportCheck = async () => {
    if (!activeWalletAddress) return;
    setPassportLoading(true);
    setPassportResult(null);
    try {
      const data = await fetchPassportScore(activeWalletAddress);
      setPassportResult(data);
      if (data?.ok) {
        try {
          const refreshed = await fetchIdentity(activeWalletAddress);
          setProfile(refreshed);
        } catch {
          if (data?.identityTier != null) {
            setProfile((prev) => ({ ...prev, ...data }));
          }
        }
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
  const attestations = Array.isArray(profile?.attestations) ? profile.attestations : [];
  const totalStamps = attestations.reduce((sum, item) => sum + Number(item?.stampsCount || 0), 0);
  const hasAttestations = attestations.length > 0;
  const passportSnapshot = getPassportSnapshotFromAttestations(attestations);
  const passportScore = passportResult?.score ?? passportSnapshot.score ?? null;
  const passportStamps = passportResult?.stampsCount ?? passportSnapshot.stamps ?? null;
  const generateSignatureCallback = useCallback(
    async (message) => {
      if (!signMessageAsync) {
        throw new Error('Wallet signature unavailable');
      }
      return signMessageAsync({ message });
    },
    [signMessageAsync]
  );

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Identity</h1>
        <div className="page-subtitle">
          Optional verification unlocks better loan terms. Your data stays private; only outcomes are
          stored.
        </div>
        <div className="inline-actions" style={{ marginTop: 8 }}>
          <span className="chip">Testnet identity mode</span>
          <span className="chip">Seeded passport scoring</span>
          {activeWalletAddress && (
            <span className="chip">
              Active identity: {activeIdentity.chainType === 'solana' ? 'Solana' : 'EVM'}
            </span>
          )}
        </div>
        <div className="inline-actions" style={{ marginTop: 10 }}>
          <PrivacyModeToggle />
        </div>
      </div>
      <PrivacyUpgradeWizard enabled={privacyMode} />
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration
          variant="identity"
          identityData={{
            walletAddress: activeWalletAddress || null,
            compositeScore: profile?.compositeScore ?? null,
            ias: profile?.ias ?? null,
            fbs: profile?.fbs ?? null,
            identityTier: profile?.identityTier ?? 0,
            tierName: tierLabel,
            passportResult,
            generateSignatureCallback
          }}
        />
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Verification Tier</div>
          <div className="stat-value">
            {activeWalletAddress ? (
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
          attestations={attestations}
          passportScore={passportScore}
          passportStamps={passportStamps}
          hasWallet={Boolean(activeWalletAddress)}
          loading={loading}
        />
        <div className="holo-card identity-attestations">
          <h3 className="holo-title" id="attestations-heading">Attestations and stamps</h3>
          <div className="muted">
            Add and maintain attestations to improve your tier and unlock better borrowing terms.
          </div>
          <div className="identity-attestations__summary">
            <div className="pill">
              {hasAttestations ? `${attestations.length} attestation${attestations.length > 1 ? 's' : ''}` : 'No attestations yet'}
            </div>
            <div className="pill">Stamps counted: {totalStamps}</div>
            <PassportSummary
              as="div"
              className="pill"
              score={passportScore}
              stamps={passportStamps}
            />
            <div className="pill">Current tier: {tierLabel}</div>
          </div>
          {hasAttestations ? (
            <ul className="identity-attestations__list" aria-labelledby="attestations-heading">
              {attestations.map((item) => (
                <li className="identity-attestations__item" key={item.id || item.provider}>
                  <div className="identity-attestations__provider">{formatProviderLabel(item.provider)}</div>
                  <div className="identity-attestations__meta">
                    Score: {item.score ?? '—'} · Stamps: {item.stampsCount ?? 0} · Verified:{' '}
                    {formatDateLabel(item.verifiedAt)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="muted">Run a passport check below to create your first attestation.</div>
          )}
          <div className="identity-attestations__actions">
            <a
              className="button ghost"
              href="https://passport.gitcoin.co/"
              target="_blank"
              rel="noreferrer"
              aria-label="Open Gitcoin Passport in a new tab"
            >
              Open Gitcoin Passport
            </a>
            <button
              className="button"
              type="button"
              onClick={() =>
                document
                  .getElementById('identity-checklist')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              aria-controls="identity-checklist"
            >
              Verify now
            </button>
          </div>
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
          <div className={`pill ${activeWalletAddress ? 'success' : ''}`} style={activeWalletAddress ? { borderColor: 'var(--success-600)' } : {}}>
            {activeWalletAddress ? '✓ ' : ''}Connect wallet
          </div>
          <div className={`pill ${hasAttestations ? 'success' : ''}`}>
            {hasAttestations ? '✓ ' : ''}Add verification (Passport or attest)
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
            disabled={!activeWalletAddress || passportLoading}
            aria-disabled={!activeWalletAddress || passportLoading}
          >
            {passportLoading ? 'Checking...' : 'Verify with Gitcoin Passport'}
          </button>
          {passportResult && (
            <div
              className="muted"
              style={{ fontSize: 12 }}
              role="status"
              aria-live="polite"
            >
              {passportResult.error ? (
                <span style={{ color: 'var(--danger-400)' }}>{passportResult.error}</span>
              ) : (
                <>
                  <PassportSummary
                    score={passportResult.score}
                    stamps={passportResult.stampsCount}
                    showLabel={false}
                  />
                  {passportResult.attestationCreated && ' · Attestation saved'}
                </>
              )}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12 }}>
            Note: Passport verification in this environment is seeded for testnet UX and explicitly
            marked as mock in API responses.
          </div>
        </div>
      </div>
    </div>
  );
}
