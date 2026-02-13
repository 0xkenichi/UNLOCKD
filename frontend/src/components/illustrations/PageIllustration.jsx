import { Suspense, useMemo, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Canvas, useFrame } from '@react-three/fiber';

const ILLUSTRATIONS_DISABLED = String(import.meta.env.VITE_DISABLE_ILLUSTRATIONS || '').trim() === 'true';

const VARIANT_META = {
  dashboard: { label: 'Protocol telemetry', badge: 'Live' },
  portfolio: { label: 'Position distribution', badge: 'Portfolio' },
  lender: { label: 'Liquidity runway', badge: 'Lender' },
  borrow: { label: 'Borrow confidence', badge: 'Borrow' },
  repay: { label: 'Repayment readiness', badge: 'Repay' },
  auction: { label: 'Auction pressure map', badge: 'Auction' },
  governance: { label: 'Governance voting flow', badge: 'Governance' },
  identity: { label: 'Identity trust envelope', badge: 'Identity' },
  features: { label: 'Protocol capability map', badge: 'Features' },
  docs: { label: 'Documentation pathways', badge: 'Docs' },
  about: { label: 'Mission and operating model', badge: 'About' }
};

const VARIANT_THEME = {
  dashboard: { a: '#60A5FA', b: '#22D3EE', c: '#34D399' },
  portfolio: { a: '#818CF8', b: '#38BDF8', c: '#22D3EE' },
  lender: { a: '#10B981', b: '#22D3EE', c: '#60A5FA' },
  borrow: { a: '#F59E0B', b: '#FB7185', c: '#F97316' },
  repay: { a: '#34D399', b: '#60A5FA', c: '#22D3EE' },
  auction: { a: '#FB7185', b: '#A78BFA', c: '#60A5FA' },
  governance: { a: '#A78BFA', b: '#60A5FA', c: '#22D3EE' },
  identity: { a: '#60A5FA', b: '#34D399', c: '#22D3EE' },
  features: { a: '#22D3EE', b: '#A78BFA', c: '#60A5FA' },
  docs: { a: '#60A5FA', b: '#22D3EE', c: '#94A3B8' },
  about: { a: '#A78BFA', b: '#34D399', c: '#60A5FA' }
};

function LiveCore({ theme }) {
  const orbRef = useRef(null);
  const ringRef = useRef(null);
  const knotRef = useRef(null);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (orbRef.current) {
      orbRef.current.rotation.y += delta * 0.32;
      orbRef.current.rotation.x = Math.sin(t * 0.22) * 0.2;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.55;
      ringRef.current.rotation.x = Math.sin(t * 0.35) * 0.25;
    }
    if (knotRef.current) {
      knotRef.current.rotation.x += delta * 0.28;
      knotRef.current.rotation.y += delta * 0.25;
      knotRef.current.position.y = Math.sin(t * 0.8) * 0.08;
    }
  });

  return (
    <>
      <ambientLight intensity={0.72} />
      <pointLight position={[-2.3, 1.9, 2.6]} intensity={18} color={theme.a} />
      <pointLight position={[2.1, -1.2, 2.4]} intensity={14} color={theme.b} />
      <pointLight position={[0, 2.2, -2]} intensity={10} color={theme.c} />

      <group ref={orbRef}>
        <mesh>
          <icosahedronGeometry args={[1.18, 2]} />
          <meshStandardMaterial color={theme.a} transparent opacity={0.18} metalness={0.42} roughness={0.28} />
        </mesh>
      </group>

      <mesh ref={ringRef} rotation={[0.9, 0.1, 0]}>
        <torusGeometry args={[1.5, 0.05, 24, 120]} />
        <meshStandardMaterial color={theme.b} transparent opacity={0.78} emissive={theme.b} emissiveIntensity={0.2} />
      </mesh>

      <mesh ref={knotRef} scale={0.56}>
        <torusKnotGeometry args={[0.82, 0.22, 120, 18]} />
        <meshStandardMaterial color={theme.c} metalness={0.2} roughness={0.35} />
      </mesh>
    </>
  );
}

function LiveIllustration3D({ variant }) {
  const theme = VARIANT_THEME[variant] || VARIANT_THEME.dashboard;
  return (
    <Canvas
      className="illustration-canvas"
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      dpr={[1, 1.6]}
    >
      <LiveCore theme={theme} />
    </Canvas>
  );
}

function IdentityPassportGlyph({ identityData }) {
  const scoreNumber = Number(identityData?.compositeScore);
  const hasScore = Number.isFinite(scoreNumber);
  const normalizedScore = hasScore ? Math.max(0, Math.min(1000, Math.round(scoreNumber))) : null;
  const scoreLabel = hasScore ? String(normalizedScore) : '—';
  const barWidth = hasScore ? Math.round((normalizedScore / 1000) * 106) : 6;
  const tier = Number.isFinite(Number(identityData?.identityTier))
    ? Number(identityData.identityTier)
    : 0;
  const tierName = identityData?.tierName || 'Anonymous';

  return (
    <g>
      <rect x="40" y="44" width="108" height="132" rx="16" fill="rgba(10,14,20,0.58)" stroke="rgba(96,165,250,0.28)" />
      <circle cx="94" cy="90" r="19" fill="rgba(96,165,250,0.22)" />
      <rect x="70" y="114" width="48" height="22" rx="11" fill="rgba(96,165,250,0.22)" />

      <text x="168" y="72" fill="var(--text-muted)" fontSize="9" letterSpacing="1">COMPOSITE SCORE</text>
      <text x="168" y="100" fill="var(--text-primary)" fontSize="28" fontWeight="700">{scoreLabel}</text>
      <rect x="168" y="110" width="106" height="10" rx="5" fill="rgba(148,163,184,0.26)" />
      <rect x="168" y="110" width={barWidth} height="10" rx="5" fill="rgba(52,211,153,0.84)" />
      <text x="168" y="136" fill="rgba(52,211,153,0.92)" fontSize="10" letterSpacing="0.7">{`${tierName.toUpperCase()} · TIER ${tier}`}</text>
      <rect x="168" y="148" width="80" height="20" rx="10" fill="rgba(96,165,250,0.16)" stroke="rgba(96,165,250,0.34)" />
      <text x="208" y="161" fill="var(--primary-300)" fontSize="9" textAnchor="middle">KYC SAFE</text>
    </g>
  );
}

function VariantGlyph({ variant, identityData }) {
  if (variant === 'identity') {
    return <IdentityPassportGlyph identityData={identityData} />;
  }

  if (variant === 'lender') {
    return (
      <g>
        <rect x="40" y="138" width="34" height="40" rx="8" fill="rgba(16,185,129,0.35)" />
        <rect x="82" y="116" width="34" height="62" rx="8" fill="rgba(34,211,238,0.35)" />
        <rect x="124" y="96" width="34" height="82" rx="8" fill="rgba(96,165,250,0.35)" />
        <rect x="166" y="74" width="34" height="104" rx="8" fill="rgba(52,211,153,0.42)" />
        <path d="M44 96C88 84 122 70 162 48C178 40 196 34 220 36" stroke="rgba(52,211,153,0.95)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M214 30L236 34L222 50" stroke="rgba(52,211,153,0.95)" strokeWidth="4" fill="none" strokeLinecap="round" />
        <text x="224" y="176" fill="var(--text-secondary)" fontSize="10" textAnchor="end">Liquidity Growth</text>
      </g>
    );
  }

  if (variant === 'docs') {
    return (
      <g>
        <rect x="56" y="54" width="72" height="98" rx="12" fill="rgba(96,165,250,0.22)" stroke="rgba(96,165,250,0.36)" />
        <rect x="136" y="46" width="82" height="110" rx="12" fill="rgba(34,211,238,0.18)" stroke="rgba(34,211,238,0.3)" />
        <rect x="226" y="60" width="42" height="90" rx="10" fill="rgba(148,163,184,0.2)" stroke="rgba(148,163,184,0.34)" />
      </g>
    );
  }

  if (variant === 'governance') {
    return (
      <g>
        <circle cx="82" cy="82" r="16" fill="rgba(167,139,250,0.42)" />
        <circle cx="156" cy="58" r="16" fill="rgba(96,165,250,0.42)" />
        <circle cx="238" cy="86" r="16" fill="rgba(34,211,238,0.42)" />
        <circle cx="130" cy="138" r="16" fill="rgba(167,139,250,0.42)" />
        <circle cx="212" cy="146" r="16" fill="rgba(96,165,250,0.42)" />
        <path d="M82 82L156 58L238 86L212 146L130 138L82 82" stroke="rgba(167,139,250,0.8)" strokeWidth="2.4" fill="none" />
      </g>
    );
  }

  return (
    <g>
      <rect x="40" y="46" width="240" height="132" rx="18" fill="rgba(8,12,18,0.36)" stroke="rgba(148,163,184,0.24)" />
      <path d="M56 152C86 112 126 96 168 104C206 112 236 124 264 98" fill="none" stroke="rgba(96,165,250,0.78)" strokeWidth="3" strokeLinecap="round" />
      <path d="M56 134C96 94 142 78 194 86C226 92 246 102 268 82" fill="none" stroke="rgba(34,211,238,0.72)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="92" cy="86" r="20" fill="rgba(96,165,250,0.24)" />
      <circle cx="226" cy="124" r="28" fill="rgba(34,211,238,0.2)" />
    </g>
  );
}

function IllustrationSvg({ variant, identityData }) {
  const meta = VARIANT_META[variant] || VARIANT_META.dashboard;
  const theme = VARIANT_THEME[variant] || VARIANT_THEME.dashboard;
  const gradId = `ill-grad-${variant}`;
  const glowId = `ill-glow-${variant}`;

  return (
    <svg className="illustration-svg" viewBox="0 0 320 220" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={theme.a} stopOpacity="0.95" />
          <stop offset="100%" stopColor={theme.b} stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="58%">
          <stop offset="0%" stopColor={theme.c} stopOpacity="0.22" />
          <stop offset="100%" stopColor={theme.c} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="16" y="16" width="288" height="188" rx="24" fill="rgba(7,11,17,0.68)" />
      <rect x="16" y="16" width="288" height="188" rx="24" fill={`url(#${glowId})`} />
      <rect x="26" y="28" width="160" height="20" rx="10" fill={`url(#${gradId})`} opacity="0.55" />
      <rect x="26" y="54" width="98" height="8" rx="4" fill={theme.b} opacity="0.46" />
      <text x="34" y="43" fill="var(--text-primary)" fontSize="8.5" letterSpacing="0.9">{meta.badge.toUpperCase()}</text>

      <VariantGlyph variant={variant} identityData={identityData} />
    </svg>
  );
}

export default function PageIllustration({ variant = 'dashboard', identityData = null }) {
  if (ILLUSTRATIONS_DISABLED) {
    return null;
  }

  const label = VARIANT_META[variant]?.label || 'Protocol overview';
  const prefersReducedMotion = useReducedMotion();
  const useLive3d = useMemo(
    () => !prefersReducedMotion && variant !== 'identity',
    [prefersReducedMotion, variant]
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
        {useLive3d ? (
          <Suspense fallback={<IllustrationSvg variant={variant} identityData={identityData} />}>
            <LiveIllustration3D variant={variant} />
          </Suspense>
        ) : (
          <IllustrationSvg variant={variant} identityData={identityData} />
        )}
      </div>
    </div>
  );
}
