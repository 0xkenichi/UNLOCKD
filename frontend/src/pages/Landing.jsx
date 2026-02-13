import { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Shield, Zap, Lock, TrendingUp, Clock, Award, ChevronDown, Rocket, Briefcase, Landmark } from 'lucide-react';
import ChainStatus from '../components/common/ChainStatus.jsx';
import useIdleMount from '../utils/useIdleMount.js';

const LandingScene = lazy(() => import('../components/landing/LandingScene.jsx'));

const fadeInUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.08
    }
  }
};

export default function Landing() {
  const navigate = useNavigate();
  const showScene = useIdleMount({ timeout: 1000 });
  const [openFaq, setOpenFaq] = useState(null);

  const features = [
    {
      icon: Shield,
      title: 'Non-Custodial',
      description: 'Keep full control of your vested assets. No custody, no counterparty risk.'
    },
    {
      icon: Zap,
      title: 'Instant Liquidity',
      description: 'Unlock liquidity from locked tokens in minutes, not months.'
    },
    {
      icon: Lock,
      title: 'Auto-Settled',
      description: 'Loans automatically settle at unlock. No manual intervention needed.'
    },
    {
      icon: TrendingUp,
      title: 'Fair Valuation',
      description: 'DPV (Discounted Present Value) ensures fair, transparent pricing.'
    },
    {
      icon: Clock,
      title: 'Time-Optimized',
      description: 'LTV caps calibrated to your specific unlock timeline.'
    },
    {
      icon: Award,
      title: 'Battle-Tested',
      description: 'Monte Carlo simulations power our risk model.'
    }
  ];

  const steps = [
    {
      number: '01',
      title: 'Connect & Verify',
      description: 'Connect your wallet and verify your vesting contract ownership.',
      time: '< 1 min'
    },
    {
      number: '02',
      title: 'Get Valuation',
      description: 'Our engine computes your DPV based on unlock schedule and market conditions.',
      time: '~ 30 sec'
    },
    {
      number: '03',
      title: 'Borrow USDC',
      description: 'Receive USDC instantly at conservative LTV (20-40%).',
      time: 'Instant'
    },
    {
      number: '04',
      title: 'Auto-Settle',
      description: 'At unlock, your loan settles automatically. Keep your upside.',
      time: 'Automated'
    }
  ];

  const useCases = [
    {
      icon: Rocket,
      title: 'Project Teams',
      description: 'Access liquidity without selling team allocations. Retain full upside while covering operational costs.'
    },
    {
      icon: Briefcase,
      title: 'Contributors',
      description: 'Convert locked compensation into liquid capital for personal needs or reinvestment opportunities.'
    },
    {
      icon: Landmark,
      title: 'Investors',
      description: 'Leverage vested positions without triggering tax events or breaking lock-up terms.'
    }
  ];

  const faqs = [
    {
      question: 'How is Vestra different from selling OTC?',
      answer: 'OTC deals often involve 20-70% discounts and permanent loss of upside. Vestra lets you borrow at fair LTV (20-40%) while keeping your tokens and all future gains.'
    },
    {
      question: 'What happens if token price drops?',
      answer: 'Our conservative LTV caps (calibrated via Monte Carlo simulations) provide buffer against volatility. At unlock, you can repay and reclaim your tokens, or let the protocol settle automatically.'
    },
    {
      question: 'Which vesting contracts are supported?',
      answer: 'We support OpenZeppelin VestingWallet, Sablier, Superfluid, TokenTimelock, and more. Custom integrations available for DAOs and protocols.'
    },
    {
      question: 'Is this audited?',
      answer: 'Full smart contract audits are planned with leading firms (PeckShield, Quantstamp). Current deployment is testnet-only for development and testing.'
    }
  ];

  return (
    <div className="landing-page">
      {/* Hero Section */}
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
          {...fadeInUp}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 id="hero-title" className="landing-hero-title landing-glow">
              <span className="typewriter">VESTRA PROTOCOL</span>
            </h1>
          </motion.div>
          
          <p className="landing-hero-subtitle">
            Credit against vested tokens.<br />
            <strong>Non-custodial. Auto-settled. Institutional-grade.</strong>
          </p>

          <div className="landing-pills">
            <span className="pill">
              <Sparkles size={14} />
              $300B+ Locked Value
            </span>
            <span className="pill">
              <TrendingUp size={14} />
              Monte Carlo Validated
            </span>
          </div>
          
          <div className="landing-hero-actions">
            <motion.button
              onClick={() => navigate('/dashboard')}
              className="landing-primary-button"
              type="button"
              data-testid="landing-cta"
              aria-label="Launch and register"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            >
              Launch & Register
            </motion.button>
            <motion.button
              onClick={() => navigate('/docs')}
              className="landing-secondary-button"
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Read Docs
            </motion.button>
          </div>

          <ChainStatus />
          
          <p className="landing-hero-disclaimer">
            Testnet • Base Sepolia • No real funds
          </p>
        </motion.div>
      </section>

      {/* Features Section */}
      <motion.section
        className="landing-section"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <div className="landing-section-content">
          <h2 className="landing-section-title">Why Vestra Protocol?</h2>
          <p className="landing-section-subtitle">
            The first protocol to provide credit against non-transferable vesting claims with DPV valuation and auto-settlement.
          </p>
          
          <motion.div 
            className="grid-3"
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                className="holo-card"
                variants={fadeInUp}
                whileHover={{ y: -6, scale: 1.02 }}
                transition={{ type: 'spring', stiffness: 300 }}
                style={{ cursor: 'default' }}
              >
                <div style={{ 
                  width: '56px', 
                  height: '56px', 
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 'var(--space-4)'
                }}>
                  <feature.icon size={28} strokeWidth={1.5} color="var(--primary-500)" />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: 'var(--space-2)', color: 'var(--text-primary)' }}>
                  {feature.title}
                </h3>
                <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text-muted)', margin: 0 }}>
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* How It Works */}
      <motion.section
        className="landing-section"
        style={{ background: 'radial-gradient(circle at center, rgba(30, 41, 59, 0.4), transparent)' }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
      >
        <div className="landing-section-content">
          <h2 className="landing-section-title">How It Works</h2>
          <p className="landing-section-subtitle">
            Four simple steps to unlock liquidity from your vested tokens.
          </p>
          
          <div style={{ 
            display: 'grid', 
            gap: 'var(--space-6)', 
            marginTop: 'var(--space-12)', 
            maxWidth: '900px', 
            marginLeft: 'auto', 
            marginRight: 'auto' 
          }}>
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: 'var(--space-6)',
                  alignItems: 'start',
                  padding: 'var(--space-6)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--surface-soft)',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'border-color var(--motion-fast)',
                  cursor: 'default'
                }}
                whileHover={{ borderColor: 'var(--border-strong)' }}
              >
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-strong)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '24px',
                  fontWeight: '600',
                  color: 'var(--primary-400)',
                  flexShrink: 0
                }}>
                  {step.number}
                </div>
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  <h3 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text-muted)', margin: 0 }}>
                    {step.description}
                  </p>
                  <div style={{ 
                    fontSize: '13px', 
                    color: 'var(--primary-400)', 
                    fontWeight: '600',
                    marginTop: 'var(--space-1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Clock size={14} />
                    {step.time}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Use Cases — simple static grid */}
      <motion.section
        className="landing-section"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
      >
        <div className="landing-section-content">
          <h2 className="landing-section-title">Built For Everyone</h2>
          <p className="landing-section-subtitle">
            Whether you're a team, contributor, or investor — unlock your potential.
          </p>
          <div className="grid-3" style={{ marginTop: 'var(--space-12)' }}>
            {useCases.map((useCase, index) => {
              const Icon = useCase.icon;
              return (
                <motion.div
                  key={useCase.title}
                  className="holo-card"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  whileHover={{ y: -4 }}
                  style={{ cursor: 'default' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-soft)', border: '1px solid var(--border-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Icon size={24} strokeWidth={1.5} color="var(--primary-500)" />
                    </div>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                      {useCase.title}
                    </h3>
                  </div>
                  <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text-muted)', margin: 0 }}>
                    {useCase.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.section>

      {/* FAQ */}
      <motion.section
        className="landing-section"
        style={{ background: 'radial-gradient(circle at center, rgba(30, 41, 59, 0.3), transparent)' }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
      >
        <div className="landing-section-content">
          <h2 className="landing-section-title">Frequently Asked Questions</h2>
          
          <div style={{ 
            display: 'grid', 
            gap: 'var(--space-3)', 
            marginTop: 'var(--space-12)', 
            maxWidth: '800px', 
            marginLeft: 'auto', 
            marginRight: 'auto' 
          }}>
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                style={{
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--surface-soft)',
                  overflow: 'hidden',
                  transition: 'border-color var(--motion-fast)'
                }}
                whileHover={{ borderColor: 'var(--border-strong)' }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  style={{
                    width: '100%',
                    padding: 'var(--space-4) var(--space-5)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '16px',
                    fontWeight: '700',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    transition: 'background var(--motion-fast)'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(88, 166, 255, 0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <motion.div
                    animate={{ rotate: openFaq === index ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                    style={{ color: 'var(--primary-500)', flexShrink: 0 }}
                  >
                    <ChevronDown size={18} />
                  </motion.div>
                  <span>{faq.question}</span>
                </button>
                {openFaq === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      padding: '0 var(--space-5) var(--space-5) calc(var(--space-5) + 18px + var(--space-3))',
                      fontSize: '15px',
                      lineHeight: '1.6',
                      color: 'var(--text-muted)'
                    }}
                  >
                    {faq.answer}
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section
        className="landing-section"
        style={{ 
          background: 'var(--bg-secondary)',
          textAlign: 'center',
          padding: 'var(--space-24) var(--space-6)'
        }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <div className="landing-section-content">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="landing-section-title" style={{ fontSize: 'clamp(36px, 5vw, 56px)', marginBottom: 'var(--space-4)' }}>
              Ready to Unlock?
            </h2>
            <p className="landing-section-subtitle" style={{ fontSize: 'clamp(18px, 2.5vw, 22px)', marginBottom: 'var(--space-10)' }}>
              Join the future of vesting credit. Non-custodial, auto-settled, fair.
            </p>
            
            <div style={{ display: 'flex', gap: 'var(--space-5)', justifyContent: 'center', flexWrap: 'wrap' }}>
              <motion.button
                onClick={() => navigate('/dashboard')}
                className="landing-primary-button"
                type="button"
                whileHover={{ scale: 1.05, y: -3 }}
                whileTap={{ scale: 0.95 }}
                style={{ fontSize: '18px', padding: '16px 32px' }}
              >
                Launch & Register
              </motion.button>
              <motion.button
                onClick={() => navigate('/docs')}
                className="landing-secondary-button"
                type="button"
                whileHover={{ scale: 1.05, y: -3 }}
                whileTap={{ scale: 0.95 }}
                style={{ fontSize: '18px', padding: '16px 32px' }}
              >
                Explore Docs
              </motion.button>
              <motion.button
                onClick={() => navigate('/airdrop')}
                className="landing-secondary-button"
                type="button"
                whileHover={{ scale: 1.05, y: -3 }}
                whileTap={{ scale: 0.95 }}
                style={{ fontSize: '18px', padding: '16px 32px' }}
              >
                Airdrop Info
              </motion.button>
            </div>

            <div style={{ marginTop: 'var(--space-10)', display: 'flex', justifyContent: 'center' }}>
              <ChainStatus />
            </div>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
