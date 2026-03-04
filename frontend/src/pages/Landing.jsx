import { Suspense, lazy, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useNavigate } from 'react-router-dom';
import {
  motion, useScroll, useTransform, useSpring, useVelocity, useMotionValue, useAnimationFrame,
  AnimatePresence
} from 'framer-motion';
import { Sparkles, Shield, Zap, Lock, TrendingUp, Clock, Award, ChevronDown, Rocket, Briefcase, Landmark, ExternalLink } from 'lucide-react';
import ChainStatus from '../components/common/ChainStatus.jsx';
import MarketTicker from '../components/landing/MarketTicker.jsx';
import Footer from '../components/common/Footer.jsx';
import useIdleMount from '../utils/useIdleMount.js';

const LandingScene = lazy(() => import('../components/landing/LandingScene.jsx'));

const NavDropdown = ({ title, items, isOpen, onMouseEnter, onMouseLeave }) => {
  return (
    <div
      style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%', pointerEvents: 'auto' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        style={{
          background: 'transparent',
          border: 'none',
          color: isOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
          fontSize: '15px',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          transition: 'all var(--motion-fast)'
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
        onMouseLeave={e => { if (!isOpen) e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
      >
        {title}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginTop: '4px',
              width: 'max-content',
              minWidth: '240px',
              background: 'var(--surface-strong)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(20px)',
              padding: '6px',
              zIndex: 100
            }}
          >
            {items.map((item, idx) => (
              <div
                key={idx}
                onClick={item.onClick}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'background var(--motion-fast)'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {item.icon && (
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'var(--surface-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    {item.icon}
                  </div>
                )}
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {item.label}
                    {item.external && <ExternalLink size={12} strokeWidth={2} style={{ opacity: 0.5 }} />}
                  </div>
                  {item.description && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.4 }}>
                      {item.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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

const TypewriterText = ({ text, delay = 0, showCursor = true }) => {
  return (
    <motion.span
      initial="hidden"
      animate="visible"
      style={{ display: 'inline-block', whiteSpace: 'nowrap' }}
    >
      {text.split('').map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
          variants={{
            hidden: { opacity: 0, display: 'none' },
            visible: { opacity: 1, display: 'inline-block' }
          }}
          transition={{
            duration: 0.05,
            delay: delay + index * 0.1,
            ease: "linear"
          }}
        >
          {char}
        </motion.span>
      ))}
      {showCursor && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          style={{ display: 'inline-block', color: 'var(--primary-400)', fontWeight: 300, marginLeft: '4px' }}
        >
          |
        </motion.span>
      )}
    </motion.span>
  );
};

function AbstractShape() {
  const meshRef = useRef();

  useFrame((state, delta) => {
    meshRef.current.rotation.x += delta * 0.05;
    meshRef.current.rotation.y += delta * 0.08;
  });

  return (
    <mesh ref={meshRef}>
      <octahedronGeometry args={[2.5, 2]} />
      <meshBasicMaterial
        color="#3b82f6"
        wireframe={true}
        transparent={true}
        opacity={0.15}
      />
    </mesh>
  );
}

function DynamicParallaxBackground() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 2000], [0, 400]); // Moves slower than scroll (parallax)

  return (
    <div className="dynamic-bg-container">
      <motion.div className="dynamic-gradient" style={{ y: y1 }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <AbstractShape />
        </Canvas>
      </div>
    </div>
  );
}

const HoverTiltCard = ({ feature }) => {
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const rotateX = useTransform(y, [0, 1], [8, -8]);
  const rotateY = useTransform(x, [0, 1], [-8, 8]);

  function handleMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width);
    y.set((event.clientY - rect.top) / rect.height);
  }

  function handleMouseLeave() {
    x.set(0.5);
    y.set(0.5);
  }

  return (
    <motion.div
      variants={fadeInUp}
      style={{
        perspective: 1200,
        transformStyle: 'preserve-3d',
        height: '100%'
      }}
    >
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateX,
          rotateY,
          cursor: 'default',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          position: 'relative'
        }}
        className="glass-card"
        whileHover={{ scale: 1.02, z: 20, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', borderColor: 'rgba(59, 130, 246, 0.4)' }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--gradient-icon)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 'var(--space-5)',
          transform: 'translateZ(30px)'
        }}>
          <feature.icon size={28} strokeWidth={1.5} color="var(--primary-400)" />
        </div>
        <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: 'var(--space-2)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)', transform: 'translateZ(20px)' }}>
          {feature.title}
        </h3>
        <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text-secondary)', margin: 0, transform: 'translateZ(10px)' }}>
          {feature.description}
        </p>

        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.03) 25%, transparent 30%)',
            pointerEvents: 'none',
            borderRadius: 'inherit'
          }}
          animate={{ backgroundPosition: ['200% auto', '-200% auto'] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>
    </motion.div>
  );
};

export default function Landing() {
  const navigate = useNavigate();
  const showScene = useIdleMount({ timeout: 1000 });
  const [openFaq, setOpenFaq] = useState(null);
  const [activeDropdown, setActiveDropdown] = useState(null);

  const handleDropdownEnter = (menu) => {
    setActiveDropdown(menu);
  };

  const handleDropdownLeave = () => {
    setActiveDropdown(null);
  };

  const navItems = {
    products: [
      {
        label: 'Vestra Web App',
        description: 'The full power of decentralized credit.',
        icon: <span style={{ fontSize: '18px' }}>📱</span>,
        onClick: () => navigate('/dashboard')
      },
      {
        label: 'Community Pools',
        description: 'Lend and earn continuous APY yields.',
        icon: <span style={{ fontSize: '18px' }}>💧</span>,
        onClick: () => navigate('/community-pools')
      }
    ],
    resources: [
      {
        label: 'Documentation',
        description: 'Guides and technical details.',
        onClick: () => navigate('/docs')
      },
      {
        label: 'Governance',
        description: 'The Vestra protocol governance.',
        onClick: () => navigate('/governance')
      },
      {
        label: 'Airdrop Info',
        description: 'Details and eligibility criteria.',
        onClick: () => navigate('/airdrop')
      }
    ],
    developers: [
      {
        label: 'Build',
        description: 'Integrate Vestra into your platform.',
        onClick: () => navigate('/docs')
      },
      {
        label: 'Github',
        description: 'Explore the open source repositories.',
        external: true,
        onClick: () => window.open('https://github.com/0xkenichi/UNLOCKD', '_blank')
      }
    ],
    about: [
      {
        label: 'About Vestra',
        description: 'Learn about the vision and the team.',
        onClick: () => navigate('/about')
      }
    ]
  };

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
      <DynamicParallaxBackground />
      {/* Hero Section */}
      <section className="landing-hero-simple" aria-labelledby="hero-title" style={{ justifyContent: 'flex-start', minHeight: '100vh', position: 'relative' }}>
        <div className="landing-hero-canvas" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100vw', right: 0, left: 'auto' }}>
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

        {/* Hero Content Overlay */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>

          {/* Top Row: Title (Left) + Network Status (Right) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: 'var(--space-8)', zIndex: 20 }}>

            {/* Top Left: Main Title + Nav Links */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                style={{ pointerEvents: 'auto' }}
              >
                <h1 id="hero-title" className="landing-glow" style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0 }}>
                  <span style={{ color: '#ffffff', display: 'inline-block' }}>
                    <TypewriterText text="VESTRA PROTOCOL" delay={0.4} />
                  </span>
                </h1>
              </motion.div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <NavDropdown title="Products" items={navItems.products} isOpen={activeDropdown === 'products'} onMouseEnter={() => handleDropdownEnter('products')} onMouseLeave={handleDropdownLeave} />
                <NavDropdown title="Resources" items={navItems.resources} isOpen={activeDropdown === 'resources'} onMouseEnter={() => handleDropdownEnter('resources')} onMouseLeave={handleDropdownLeave} />
                <NavDropdown title="Developers" items={navItems.developers} isOpen={activeDropdown === 'developers'} onMouseEnter={() => handleDropdownEnter('developers')} onMouseLeave={handleDropdownLeave} />
                <NavDropdown title="About" items={navItems.about} isOpen={activeDropdown === 'about'} onMouseEnter={() => handleDropdownEnter('about')} onMouseLeave={handleDropdownLeave} />
              </div>
            </div>

            {/* Top Right: Network Status */}
            <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <ChainStatus />
              </div>
            </div>

          </div>

          {/* Bottom Row: Info/Pills (Left) + Actions (Right) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%', paddingBottom: 'calc(var(--space-10) + 40px)' }}>

            {/* Bottom Left: Subtitle & Pills */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              <p className="landing-hero-subtitle" style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '400px', margin: 0, lineHeight: 1.5, pointerEvents: 'auto' }}>
                Credit against vested tokens.<br />
                <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Non-custodial. Auto-settled. Institutional-grade.</strong>
              </p>

              <div className="landing-pills" style={{ display: 'flex', gap: 'var(--space-3)', pointerEvents: 'auto' }}>
                <span className="pill" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: 'var(--primary-300)' }}>
                  <Sparkles size={14} />
                  $300B+ Locked Value
                </span>
                <span className="pill">
                  <TrendingUp size={14} />
                  Monte Carlo Validated
                </span>
              </div>
            </motion.div>

            {/* Bottom Right: Buttons */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="landing-hero-actions"
              style={{ display: 'flex', gap: 'var(--space-4)', pointerEvents: 'auto', margin: 0 }}
            >
              <motion.button
                onClick={() => navigate('/dashboard')}
                className="landing-primary-button"
                type="button"
                data-testid="landing-cta"
                aria-label="Launch and register"
                style={{ background: 'var(--gradient-button)', border: 'none', boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)' }}
                whileHover={{ scale: 1.05, boxShadow: '0 8px 32px rgba(59, 130, 246, 0.6)' }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                Launch & Register
              </motion.button>
              <motion.button
                onClick={() => navigate('/docs')}
                className="landing-secondary-button"
                type="button"
                style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
                whileHover={{ scale: 1.05, background: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.95 }}
              >
                Read Docs
              </motion.button>
            </motion.div>

          </div>
        </div>
      </section>

      <motion.section
        className="landing-section"
        style={{ position: 'relative' }}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-100px' }}
        transition={{ duration: 0.6 }}
      >
        <div className="landing-section-content" style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="landing-section-title">Why Vestra Protocol?</h2>
          <p className="landing-section-subtitle">
            The first protocol to provide credit against non-transferable vesting claims with DPV valuation and auto-settlement.
          </p>

          <motion.div
            className="grid-3"
            variants={stagger}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: '-50px' }}
            style={{ marginTop: 'var(--space-10)' }}
          >
            {features.map((feature, index) => (
              <HoverTiltCard key={feature.title} feature={feature} index={index} />
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* Market Ticker Section */}
      <section style={{ position: 'relative', zIndex: 10, marginTop: '-40px', marginBottom: 'var(--space-10)' }}>
        <MarketTicker />
      </section>

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
                  border: '1px solid var(--glass-border)',
                  background: 'var(--glass-bg)',
                  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
                  backdropFilter: 'blur(16px)',
                  transition: 'border-color var(--motion-fast)',
                  cursor: 'default',
                  position: 'relative'
                }}
                whileHover={{ borderColor: 'var(--primary-500)' }}
              >
                {index < steps.length - 1 && (
                  <div style={{ position: 'absolute', left: '55px', top: '90px', bottom: '-40px', width: '2px', background: 'linear-gradient(to bottom, rgba(59, 130, 246, 0.4), rgba(59, 130, 246, 0))', zIndex: -1 }} />
                )}
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--surface-strong)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-display)',
                  fontSize: '24px',
                  fontWeight: '700',
                  color: 'var(--primary-400)',
                  flexShrink: 0,
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.15)'
                }}>
                  {step.number}
                </div>
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  <h3 style={{ fontSize: '22px', fontWeight: '700', margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text-secondary)', margin: 0 }}>
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
                  className="glass-card"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  whileHover={{ y: -4, borderColor: 'var(--primary-500)', boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)' }}
                  style={{ cursor: 'default', padding: 'var(--space-6)', transition: 'all var(--motion-fast)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: 'var(--radius-md)',
                      background: 'var(--gradient-icon)', border: '1px solid rgba(59, 130, 246, 0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Icon size={24} strokeWidth={1.5} color="var(--primary-400)" />
                    </div>
                    <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                      {useCase.title}
                    </h3>
                  </div>
                  <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text-secondary)', margin: 0 }}>
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
                  border: '1px solid var(--glass-border)',
                  background: 'var(--glass-bg)',
                  overflow: 'hidden',
                  backdropFilter: 'blur(16px)',
                  transition: 'border-color var(--motion-fast), box-shadow var(--motion-fast)'
                }}
                whileHover={{ borderColor: 'rgba(59, 130, 246, 0.4)', boxShadow: '0 4px 20px rgba(59, 130, 246, 0.1)' }}
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
                    fontFamily: 'var(--font-display)',
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
                      color: 'var(--text-secondary)'
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
          background: 'radial-gradient(ellipse at bottom, rgba(59, 130, 246, 0.15), rgba(10, 14, 26, 1) 70%)',
          borderTop: '1px solid rgba(59, 130, 246, 0.1)',
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
                style={{ background: 'var(--gradient-button)', border: 'none', boxShadow: '0 4px 20px rgba(59, 130, 246, 0.4)', fontSize: '18px', padding: '16px 32px' }}
                whileHover={{ scale: 1.05, y: -3, boxShadow: '0 8px 32px rgba(59, 130, 246, 0.6)' }}
                whileTap={{ scale: 0.95 }}
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

      <Footer />
    </div>
  );
}
