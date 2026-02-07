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

function IllustrationSvg() {
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

export default function PageIllustration({ variant = 'dashboard' }) {
  const shouldReduceMotion = useReducedMotion();
  const label = VARIANT_LABELS[variant] || 'Protocol overview';
  const show3d = useMemo(
    () =>
      !shouldReduceMotion &&
      ['borrow', 'repay', 'governance', 'identity', 'dashboard'].includes(variant),
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
          <Suspense fallback={<IllustrationSvg />}>
            <OrbScene />
          </Suspense>
        ) : (
          <IllustrationSvg />
        )}
      </div>
    </div>
  );
}
