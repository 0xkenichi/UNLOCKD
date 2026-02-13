import { Suspense, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Canvas } from '@react-three/fiber';

const VARIANT_LABELS = {
  dashboard: 'Portfolio radar',
  portfolio: 'Positions timeline',
  lender: 'Liquidity profile',
  borrow: 'Risk preview',
  repay: 'Repayment path',
  auction: 'Auction flow',
  governance: 'Consensus signal',
  identity: 'Privacy shield',
  features: 'Protocol stack',
  docs: 'Knowledge hub',
  about: 'Mission map'
};

function OrbScene() {
  return (
    <Canvas className="illustration-canvas">
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 4]} intensity={0.6} />
      <mesh rotation={[0.3, 0.6, 0]}>
        <icosahedronGeometry args={[1.15, 0]} />
        <meshStandardMaterial color="#C0C0C0" emissive="#1f3b5a" />
      </mesh>
    </Canvas>
  );
}

function IdentityPassportSvg({ identityData }) {
  const scoreNumber = Number(identityData?.compositeScore);
  const hasScore = Number.isFinite(scoreNumber);
  const normalizedScore = hasScore ? Math.max(0, Math.min(1000, Math.round(scoreNumber))) : null;
  const scoreLabel = hasScore ? String(normalizedScore) : '—';
  const barWidth = hasScore ? Math.round((normalizedScore / 1000) * 118) : 8;
  const tier = Number.isFinite(Number(identityData?.identityTier))
    ? Number(identityData.identityTier)
    : 0;
  const tierName = identityData?.tierName || 'Anonymous';
  const hasWallet = Boolean(identityData?.walletAddress);
  const passportScore = Number(identityData?.passportResult?.score);
  const hasPassportScore = Number.isFinite(passportScore) && passportScore > 0;
  const passportChip = hasPassportScore
    ? `Passport ${Math.round(passportScore)}`
    : 'Passport —';
  const walletChip = hasWallet ? 'Wallet on' : 'Wallet off';
  const tierChip = `Tier ${tier}`;

  return (
    <svg
      className="illustration-svg"
      viewBox="0 0 320 220"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="passportFrame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(88,166,255,0.26)" />
          <stop offset="100%" stopColor="rgba(96,165,250,0.08)" />
        </linearGradient>
        <linearGradient id="scoreBar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(56,139,253,0.85)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.85)" />
        </linearGradient>
      </defs>

      <rect x="16" y="14" width="288" height="192" rx="20" fill="rgba(255,255,255,0.03)" />
      <rect x="26" y="24" width="268" height="172" rx="16" fill="url(#passportFrame)" stroke="rgba(88,166,255,0.24)" />

      <text x="42" y="48" fill="var(--text-secondary)" fontSize="10" letterSpacing="1.2">IDENTITY PASSPORT</text>
      <text x="42" y="66" fill="var(--text-muted)" fontSize="8" letterSpacing="1">PRIVACY-PRESERVING PROOF</text>

      <rect x="42" y="78" width="88" height="88" rx="10" fill="rgba(13,17,24,0.65)" stroke="rgba(139,148,158,0.25)" />
      <circle cx="86" cy="108" r="18" fill="rgba(88,166,255,0.25)" />
      <rect x="64" y="132" width="44" height="18" rx="9" fill="rgba(88,166,255,0.2)" />

      <text x="150" y="88" fill="var(--text-muted)" fontSize="9" letterSpacing="0.8">COMPOSITE SCORE</text>
      <text x="150" y="112" fill="var(--text-primary)" fontSize="24" fontWeight="700">{scoreLabel}</text>
      <rect x="150" y="122" width="118" height="10" rx="5" fill="rgba(139,148,158,0.24)" />
      <rect x="150" y="122" width={barWidth} height="10" rx="5" fill="url(#scoreBar)" />
      <text x="150" y="146" fill="var(--success-400)" fontSize="9" letterSpacing="0.8">{`${tierName.toUpperCase()} · TIER ${tier}`}</text>

      <rect x="150" y="156" width="60" height="16" rx="8" fill="rgba(56,139,253,0.16)" stroke="rgba(88,166,255,0.28)" />
      <text x="180" y="167" fill="var(--primary-300)" fontSize="8" textAnchor="middle">{walletChip}</text>
      <rect x="214" y="156" width="72" height="16" rx="8" fill="rgba(16,185,129,0.14)" stroke="rgba(16,185,129,0.32)" />
      <text x="250" y="167" fill="var(--success-400)" fontSize="8" textAnchor="middle">{passportChip}</text>
      <rect x="150" y="176" width="42" height="14" rx="7" fill="rgba(59,130,246,0.16)" stroke="rgba(96,165,250,0.34)" />
      <text x="171" y="185" fill="var(--primary-300)" fontSize="8" textAnchor="middle">{tierChip}</text>
    </svg>
  );
}

function IllustrationSvg({ variant, identityData }) {
  if (variant === 'identity') {
    return <IdentityPassportSvg identityData={identityData} />;
  }

  return (
    <svg
      className="illustration-svg"
      viewBox="0 0 320 220"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="illGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--illustration-accent)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="var(--illustration-accent-2)" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect x="16" y="18" width="288" height="184" rx="24" fill="rgba(255,255,255,0.04)" />
      <circle className="illustration-orb" cx="92" cy="84" r="34" fill="url(#illGradient)" />
      <circle className="illustration-orb" cx="220" cy="120" r="46" fill="url(#illGradient)" />
      <path
        d="M40 162C78 128 120 124 162 136C192 144 226 156 280 128"
        fill="none"
        stroke="var(--illustration-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M60 142C96 112 142 108 196 122C230 130 260 140 290 116"
        fill="none"
        stroke="var(--illustration-accent-2)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <rect x="34" y="36" width="90" height="10" rx="5" fill="var(--illustration-accent)" opacity="0.5" />
      <rect x="34" y="54" width="120" height="8" rx="4" fill="var(--illustration-accent-2)" opacity="0.35" />
      <rect x="34" y="172" width="160" height="8" rx="4" fill="var(--illustration-accent)" opacity="0.2" />
    </svg>
  );
}

export default function PageIllustration({ variant = 'dashboard', identityData = null }) {
  const shouldReduceMotion = useReducedMotion();
  const label = VARIANT_LABELS[variant] || 'Protocol overview';
  const show3d = useMemo(
    () =>
      !shouldReduceMotion &&
      ['borrow', 'repay', 'governance', 'dashboard'].includes(variant),
    [shouldReduceMotion, variant]
  );

  return (
    <div className={`holo-card illustration-card illustration-card--${variant}`}>
      <div className="section-head">
        <div>
          <h3 className="section-title">Illustration</h3>
          <div className="section-subtitle">{label}</div>
        </div>
        <span className="tag">Visual</span>
      </div>
      <div className="illustration-body">
        {show3d ? (
          <Suspense fallback={<IllustrationSvg variant={variant} identityData={identityData} />}>
            <OrbScene />
          </Suspense>
        ) : (
          <IllustrationSvg variant={variant} identityData={identityData} />
        )}
      </div>
    </div>
  );
}
