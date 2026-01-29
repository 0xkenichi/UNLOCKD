import { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import ChainStatus from '../components/common/ChainStatus.jsx';
import ChainPrompt from '../components/common/ChainPrompt.jsx';
import useIdleMount from '../utils/useIdleMount.js';

const LandingScene = lazy(() => import('../components/landing/LandingScene.jsx'));

export default function Landing() {
  const navigate = useNavigate();
  const showScene = useIdleMount({ timeout: 1400 });

  return (
    <div className="landing-hero-simple">
      <div className="landing-hero-canvas">
        {showScene ? (
          <Suspense
            fallback={
              <div className="loading-row landing-scene-loading">
                <div className="spinner" />
              </div>
            }
          >
            <LandingScene />
          </Suspense>
        ) : (
          <div className="landing-scene-placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="landing-hero-content">
        <h1 className="landing-hero-title holo-glow">VESTRA</h1>
        <p className="landing-hero-subtitle">
          Borrow against your vested & locked tokens — on-chain, no custody,
          auto-settled.
        </p>
        <p className="landing-hero-tagline">
          Liquidity for the future you already own.
        </p>
        <div className="landing-hero-actions">
          <button
            onClick={() => {
              navigate('/dashboard');
            }}
            className="landing-primary-button"
            type="button"
          >
            Launch App (Testnet)
          </button>
          <a
            href="/docs"
            className="landing-secondary-button"
          >
            Read Docs
          </a>
        </div>
        <div className="landing-metrics">
          <div className="metric-card">
            <div className="stat-label">Active Markets</div>
            <div className="stat-value">12</div>
            <div className="muted">Testnet sample</div>
          </div>
          <div className="metric-card">
            <div className="stat-label">Total Borrowed</div>
            <div className="stat-value">$6.8M</div>
            <div className="muted">Across vesting vaults</div>
          </div>
          <div className="metric-card">
            <div className="stat-label">Avg LTV</div>
            <div className="stat-value">38.4%</div>
            <div className="muted">Conservative target</div>
          </div>
        </div>
        <ChainStatus />
        <ChainPrompt />
        <p className="landing-hero-disclaimer">
          Testnet only — Base Sepolia • No real funds at risk
        </p>
      </div>
    </div>
  );
}
