import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Zap, Shield, Lock, BarChart3, Globe, ArrowRight, ExternalLink } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

const stagger = { animate: { transition: { staggerChildren: 0.09 } } };

const PILLARS = [
  {
    icon: Lock,
    color: '139, 92, 246',
    title: 'Vesting-Backed Credit',
    desc: 'Unlock liquidity from locked token positions before they vest — without selling. Vestra creates real lending markets around on-chain vesting schedules.'
  },
  {
    icon: BarChart3,
    color: '59, 130, 246',
    title: 'Dynamic Present Value Engine',
    desc: 'Our DPV engine prices vesting collateral using time-adjusted, volatility-weighted models — giving borrowers fair LTVs and lenders precise risk exposure.'
  },
  {
    icon: Shield,
    color: '16, 185, 129',
    title: 'Strict Recourse Architecture',
    desc: 'Every loan is backed by real collateral escrow, tiered liquidation, insurance vaults, and staged auction mechanics. Zero-emission guarantees.'
  },
  {
    icon: Globe,
    color: '251, 146, 60',
    title: 'Institutional Grade',
    desc: 'Built for funds, DAOs, and serious builders. Distressed Debt Bonds, isolated lending tiers, KYC-gated instruments, and auditor-ready contracts.'
  }
];

const STATS = [
  { label: 'Market Opportunity', value: '$300B+', sub: 'Locked vesting tokens globally' },
  { label: 'Architecture', value: 'V7.0', sub: 'Citadel hardening' },
  { label: 'Contracts', value: 'EIP-170 Safe', sub: 'Facet-split verified' },
  { label: 'Stage', value: 'Pre-Mainnet', sub: 'Testnet live & shipping' }
];

export default function About() {
  const navigate = useNavigate();

  return (
    <div className="stack">
      {/* Hero */}
      <motion.div
        variants={stagger}
        initial="initial"
        animate="animate"
        style={{ marginBottom: '4rem' }}
      >
        <motion.div variants={fadeUp}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: '20px', padding: '4px 14px', marginBottom: '20px'
          }}>
            <Zap size={13} color="#a78bfa" />
            <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: 600 }}>The Protocol</span>
          </div>
          <h1 className="page-title holo-glow" style={{ maxWidth: '720px', marginBottom: '1.2rem' }}>
            The credit layer for the vesting economy
          </h1>
          <p className="page-subtitle" style={{ maxWidth: '600px', margin: '0 0 2rem' }}>
            Vestra Protocol is building the infrastructure that lets token holders access liquidity against their vesting positions — before unlock, without selling, with institutional-grade risk controls.
          </p>
          <div className="inline-actions">
            <button className="button" type="button" onClick={() => navigate('/docs?doc=whitepaper')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              Read Whitepaper <ArrowRight size={14} />
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/hiring')}>
              We're Hiring
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Stats */}
      <div className="stat-row" style={{ marginBottom: '4rem' }}>
        {STATS.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-delta">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Mission */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        className="holo-card"
        style={{
          marginBottom: '3rem',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.07), rgba(59,130,246,0.05))',
          border: '1px solid rgba(139,92,246,0.2)',
          padding: '2.5rem'
        }}
      >
        <h2 className="holo-title" style={{ marginBottom: '1rem' }}>Why we exist</h2>
        <p style={{ color: '#94a3b8', fontSize: '16px', lineHeight: 1.85, maxWidth: '700px', margin: 0 }}>
          Hundreds of billions of dollars in token value sit locked in vesting schedules — illiquid to the people who earned them. The options today are bad: OTC sales at steep discounts, opaque dealer desks, or simply waiting. Vestra Protocol changes this with a transparent, on-chain credit market that respects vesting mechanics, prices collateral fairly, and enforces strict recourse without human intermediaries.
        </p>
      </motion.div>

      {/* Pillars */}
      <motion.div
        variants={stagger}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '16px',
          marginBottom: '4rem'
        }}
      >
        {PILLARS.map(p => (
          <motion.div
            key={p.title}
            variants={fadeUp}
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid rgba(${p.color}, 0.15)`,
              borderRadius: '16px',
              padding: '28px 24px',
              transition: 'border-color 0.2s'
            }}
          >
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: `rgba(${p.color}, 0.1)`,
              border: `1px solid rgba(${p.color}, 0.2)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <p.icon size={20} color={`rgb(${p.color})`} />
            </div>
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '16px', marginBottom: '10px', fontFamily: 'var(--font-display)' }}>
              {p.title}
            </h3>
            <p style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.7, margin: 0 }}>
              {p.desc}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Join CTA */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        className="holo-card"
        style={{ textAlign: 'center', padding: '3.5rem 2rem' }}
      >
        <h3 className="holo-title" style={{ marginBottom: '0.75rem' }}>Join the build</h3>
        <p className="muted" style={{ marginBottom: '1.8rem', maxWidth: '480px', margin: '0 auto 1.8rem' }}>
          We're a lean, high-conviction team assembling the core builders for Vestra Protocol. If this resonates, we want to hear from you.
        </p>
        <div className="inline-actions" style={{ justifyContent: 'center' }}>
          <button className="button" type="button" onClick={() => navigate('/hiring')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            View Open Roles <ArrowRight size={14} />
          </button>
          <a
            href="https://tally.so/r/vestra-apply"
            target="_blank"
            rel="noopener noreferrer"
            className="button ghost"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            Open Application <ExternalLink size={13} />
          </a>
        </div>
      </motion.div>
    </div>
  );
}
