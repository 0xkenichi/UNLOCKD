import { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Zap, Globe } from 'lucide-react';
import ChainStatus from '../components/common/ChainStatus.jsx';
import useIdleMount from '../utils/useIdleMount.js';

const LandingScene = lazy(() => import('../components/landing/LandingScene.jsx'));

export default function Landing() {
  const navigate = useNavigate();
  const showScene = useIdleMount({ timeout: 1000 });

  return (
    <div className="landing-page landing-minimal">
      <section className="landing-hero-simple" aria-labelledby="hero-title">
        <div className="landing-hero-canvas" aria-hidden="true">
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
            <div className="landing-scene-placeholder" />
          )}
        </div>
        <motion.div
          className="landing-hero-content"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 id="hero-title" className="landing-hero-title landing-glow">
            VESTRA
          </h1>
          <p className="landing-hero-subtitle">
            Unlock liquidity from vested tokens.<br />
            Zero custody. Auto-settled.
          </p>
          <div className="landing-hero-actions">
            <motion.button
              onClick={() => navigate('/dashboard')}
              className="landing-primary-button"
              type="button"
              data-testid="landing-cta"
              aria-label="Launch VESTRA"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              Launch App
            </motion.button>
            <motion.button
              onClick={() => navigate('/docs')}
              className="landing-secondary-button"
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Docs
            </motion.button>
          </div>
          <ChainStatus />
          <p className="landing-hero-disclaimer">
            Testnet — Base Sepolia • No real funds
          </p>
        </motion.div>
      </section>

      <motion.section
        className="landing-section landing-section-compact"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="landing-section-content">
          <h2 className="landing-section-title">Why VESTRA?</h2>
          <div className="features-grid-minimal">
            <div className="feature-minimal">
              <Lock size={20} strokeWidth={1.5} />
              <span>Non-custodial</span>
            </div>
            <div className="feature-minimal">
              <Zap size={20} strokeWidth={1.5} />
              <span>Auto-settled</span>
            </div>
            <div className="feature-minimal">
              <Globe size={20} strokeWidth={1.5} />
              <span>Multi-chain</span>
            </div>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="landing-section landing-cta-section landing-cta-minimal"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div className="landing-section-content">
          <h2 className="landing-cta-title">Ready?</h2>
          <motion.button
            onClick={() => navigate('/dashboard')}
            className="landing-primary-button"
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Launch App
          </motion.button>
        </div>
      </motion.section>
    </div>
  );
}
