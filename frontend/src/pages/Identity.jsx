// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useCallback, useEffect, useState } from 'react';
import { IsometricIdentityPassport } from '../components/visuals/IsometricHeroes.jsx';
import { useAccount, useSignMessage } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PassportSummary from '../components/common/PassportSummary.jsx';
import VerifiedCard from '../components/identity/VerifiedCard.jsx';
import TierBadge from '../components/common/TierBadge.jsx';
import PrivacyModeToggle from '../components/privacy/PrivacyModeToggle.jsx';
import PrivacyUpgradeWizard from '../components/privacy/PrivacyUpgradeWizard.jsx';
import { fetchIdentity, fetchPassportScore } from '../utils/api.js';
import { getPassportSnapshotFromAttestations } from '../utils/passport.js';
import { getActiveIdentity, useOnchainSession, useWalletSession, requestWalletSession } from '../utils/onchainSession.js';
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
  const { address: evmAddress } = useAccount();
  const { publicKey: solPublicKey } = useWallet();
  const { session } = useOnchainSession();
  const { auth, setAuth } = useWalletSession();
  const { enabled: privacyMode } = usePrivacyMode();

  // We default the Identity fetch to EVM if connected to act as the primary Gitcoin Passport Anchor
  const activeWalletAddress = evmAddress || (solPublicKey ? solPublicKey.toString() : '');
  const hasSolanaLinked = Boolean(solPublicKey && evmAddress);

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
      if (!auth?.token) {
        if (!evmAddress || !signMessageAsync) {
          throw new Error('Please connect an EVM wallet to authenticate with Vestra.');
        }
        const newAuth = await requestWalletSession({ address: evmAddress, signMessageAsync });
        setAuth(newAuth);
      }

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
      <div className="page-header" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Isometric passport hero — floats top-right */}
        <div style={{
          position: 'absolute', top: '-16px', right: '-8px',
          pointerEvents: 'none', zIndex: 0, opacity: 0.65,
          mask: 'linear-gradient(to left, rgba(0,0,0,1) 30%, transparent 90%)',
          WebkitMask: 'linear-gradient(to left, rgba(0,0,0,1) 30%, transparent 90%)'
        }}>
          <IsometricIdentityPassport
            width={280} height={180}
            tier={profile?.identityTier ?? 0}
          />
        </div>

        <h1 className="page-title holo-glow" style={{ position: 'relative', zIndex: 1 }}>Global Identity</h1>
        <div className="page-subtitle" style={{ position: 'relative', zIndex: 1 }}>
          Link multiple wallets to a single Gitcoin Passport score. Optional verification unlocks better loan terms.
        </div>
        <div className="inline-actions" style={{ marginTop: 8, position: 'relative', zIndex: 1 }}>
          <span className="chip">EVM Passport Anchor</span>
          {hasSolanaLinked && (
            <span className="chip" style={{ borderColor: 'var(--success-600)', color: 'var(--success-400)' }}>
              Solana Wallet Linked
            </span>
          )}
        </div>
        <div className="inline-actions" style={{ marginTop: 10, position: 'relative', zIndex: 1 }}>
          <PrivacyModeToggle />
        </div>
      </div>
      <PrivacyUpgradeWizard enabled={privacyMode} />

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
          <div className="stat-delta">Based on Gitcoin Stamps</div>
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

      <div className="holo-card" id="identity-checklist">
        <div className="section-head">
          <div>
            <h3 className="section-title">Gitcoin Passport Verification</h3>
            <div className="section-subtitle">Link wallets and synchronize your off-chain stamps.</div>
          </div>
        </div>

        {/* Wallet Linking UI */}
        <div style={{ marginBottom: 24, padding: 16, background: 'var(--bg-layer-2)', borderRadius: 12, border: '1px solid var(--border-primary)' }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Linked Connected Addresses</h4>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="pill">EVM (Anchor)</span>
              <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>{evmAddress ? `${evmAddress.slice(0, 6)}...${evmAddress.slice(-4)}` : 'Not connected'}</span>
            </div>
            {evmAddress && <span className="tag success">Active</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="pill">Solana</span>
              <span style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>{solPublicKey ? `${solPublicKey.toString().slice(0, 6)}...${solPublicKey.toString().slice(-4)}` : 'Not connected'}</span>
            </div>
            {solPublicKey && evmAddress ? <span className="tag success">Linked to EVM Passport</span> : <span className="tag">Independent</span>}
          </div>
          {!evmAddress && solPublicKey && (
            <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>
              Warning: Connect an EVM wallet to act as your primary Gitcoin Passport anchor. Your Solana wallet will map its trust score from the connected EVM address automatically.
            </div>
          )}
        </div>

        <div className="card-list" style={{ marginBottom: 16 }}>
          <div className={`pill ${activeWalletAddress ? 'success' : ''}`} style={activeWalletAddress ? { borderColor: 'var(--success-600)' } : {}}>
            {activeWalletAddress ? '✓ ' : ''}Connect Primary Wallet
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
            disabled={!evmAddress || passportLoading}
            aria-disabled={!evmAddress || passportLoading}
          >
            {passportLoading ? 'Checking...' : 'Sync Gitcoin Passport Score'}
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
                  {passportResult.attestationCreated && ' · Score synchronized globally'}
                </>
              )}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12 }}>
            Note: Ensure you have minted your actual Gitcoin Stamps on passport.gitcoin.co prior to syncing your rank here.
          </div>
        </div>
      </div>

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
            <div className="muted">Run a passport check to create your first attestation.</div>
          )}
          <div className="identity-attestations__actions">
            <a
              className="button ghost"
              href="https://passport.gitcoin.co/"
              target="_blank"
              rel="noreferrer"
              aria-label="Open Gitcoin Passport in a new tab"
            >
              Manage Gitcoin Stamps
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

