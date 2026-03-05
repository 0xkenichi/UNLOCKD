// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Code2, Shield, LineChart, Globe, MessageSquare,
    ExternalLink, ChevronDown, Check, Zap, Users, Briefcase
} from 'lucide-react';

const fadeUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};
const stagger = { animate: { transition: { staggerChildren: 0.07 } } };

// ─── OPEN ROLES ─────────────────────────────────────────────────────────────
const ROLES = [
    {
        group: 'Core Team',
        emoji: '⚡',
        color: '139, 92, 246',
        tagline: 'The smallest possible group of the best possible people.',
        positions: [
            {
                title: 'Lead Smart Contract Engineer',
                type: 'Full-Time',
                location: 'Remote',
                comp: 'CRDT + Competitive',
                icon: Code2,
                desc: 'Own and extend the Vestra Protocol smart contract suite. You will architect the next evolutions of LoanManager, the DPV engine, and the isolated lending tiers. Deep expertise in Solidity, EVM security patterns, and DeFi mechanics required.',
                requirements: [
                    '3+ years Solidity production experience',
                    'Shipped at least one mainnet protocol',
                    'Familiarity with ERC-4626, TWAP oracles, liquidation mechanics',
                    'Strong test-driven development culture',
                    'Comfortable with Hardhat, Foundry, or both'
                ]
            },
            {
                title: 'Protocol Risk & Quant Engineer',
                type: 'Full-Time',
                location: 'Remote',
                comp: 'CRDT + Competitive',
                icon: LineChart,
                desc: 'Build and maintain the DPV risk engine powering all LTV decisions. This involves Monte Carlo simulation, volatility modeling, fixed-interest immunization, and LTV calibration across heterogeneous vesting schedules.',
                requirements: [
                    'Background in quantitative finance, statistics, or applied math',
                    'Python scientific stack (numpy, scipy, pandas)',
                    'Understanding of options pricing or credit risk frameworks',
                    'Ability to translate models into on-chain constraints',
                    'Bonus: Solidity knowledge'
                ]
            },
            {
                title: 'Protocol Security Researcher',
                type: 'Contract',
                location: 'Remote',
                comp: 'Bug Bounty + CRDT',
                icon: Shield,
                desc: 'Hunt attack vectors before auditors do. Review smart contracts, design fuzzing suites, and help prepare the codebase for external audit. You will have access to the full protocol internals.',
                requirements: [
                    'Proven smart contract security track record',
                    'Foundry fuzzing, Echidna, or Slither experience',
                    'Familiarity with DeFi exploit patterns (reentrancy, price manipulation, flash loans)',
                    'Audit report portfolio strongly preferred'
                ]
            }
        ]
    },
    {
        group: 'Team',
        emoji: '🔵',
        color: '59, 130, 246',
        tagline: 'Operators and builders who make the protocol real.',
        positions: [
            {
                title: 'Frontend Engineer (DeFi)',
                type: 'Full-Time',
                location: 'Remote',
                comp: 'CRDT + Competitive',
                icon: Code2,
                desc: 'Build and own the Vestra Protocol frontend. You will drive the borrow/lend UX, wallet integrations, real-time on-chain data flows, and a best-in-class dark-mode interface.',
                requirements: [
                    'Strong React + Vite experience',
                    'Wagmi / viem or ethers.js',
                    'Eye for premium, minimal, dark-mode UI',
                    'Responsive across devices, performance-conscious'
                ]
            },
            {
                title: 'Growth & Ecosystem Lead',
                type: 'Full-Time',
                location: 'Remote',
                comp: 'CRDT + Competitive',
                icon: Globe,
                desc: 'Drive awareness, integrations, and partnerships. Own the go-to-market plan for mainnet, forge deals with vesting platforms, and build the Vestra DeFi ecosystem.',
                requirements: [
                    'Experience growing a DeFi protocol or crypto product',
                    'Strong network in DeFi, VC, or token launch space',
                    'Content, BD, and distribution skills',
                    'Data-driven and highly self-directed'
                ]
            },
            {
                title: 'Community & Ops Manager',
                type: 'Full-Time',
                location: 'Remote',
                comp: 'CRDT + Salary',
                icon: MessageSquare,
                desc: 'Run the Vestra community across Discord, X, and Telegram. Coordinate between technical team, governance, and public-facing communications. You are the voice of the protocol.',
                requirements: [
                    'Experience managing DeFi or crypto communities',
                    'Strong writing and async communication skills',
                    'Comfortable explaining protocol mechanics simply',
                    'Crypto-native and on the pulse'
                ]
            }
        ]
    },
    {
        group: 'Contributors',
        emoji: '🟢',
        color: '16, 185, 129',
        tagline: 'Part-time builders, open-source contributors, and specialists.',
        positions: [
            {
                title: 'Technical Documentation Writer',
                type: 'Part-Time',
                location: 'Remote',
                comp: 'CRDT per project',
                icon: Globe,
                desc: 'Take internal specs, contracts, and research and turn them into world-class developer documentation. Clear, accurate, well-structured.',
                requirements: [
                    'Technical writing portfolio',
                    'Crypto or DeFi knowledge',
                    'Comfortable with Markdown, Mintlify, or Notion'
                ]
            },
            {
                title: 'Open Source Contributor',
                type: 'Open / Bounty',
                location: 'Remote',
                comp: 'Bounty + CRDT',
                icon: Code2,
                desc: 'Contribute to open components of the Vestra Protocol ecosystem. Bug bounties, feature grants, and contributor rewards are available on an ongoing basis.',
                requirements: [
                    'Any engineering background',
                    'Passion for DeFi infrastructure',
                    'Public GitHub contributions'
                ]
            }
        ]
    }
];

const VALUES = [
    'Protocol-first mindset',
    'High ownership & autonomy',
    'Clear async communication',
    'Crypto-native or willing to go deep',
    'Ships, not just plans',
    'No ego, high standards'
];

// ─── ROLE CARD ───────────────────────────────────────────────────────────────
function RoleCard({ role, color }) {
    const [open, setOpen] = useState(false);

    return (
        <motion.div
            variants={fadeUp}
            style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid rgba(${color}, ${open ? '0.3' : '0.12'})`,
                borderRadius: '16px',
                overflow: 'hidden',
                transition: 'border-color 0.25s'
            }}
        >
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', textAlign: 'left', padding: '22px 24px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '16px'
                }}
            >
                <div style={{
                    width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                    background: `rgba(${color}, 0.1)`, border: `1px solid rgba(${color}, 0.2)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <role.icon size={20} color={`rgb(${color})`} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px', marginBottom: '5px', fontFamily: 'var(--font-display)' }}>
                        {role.title}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{
                            fontSize: '11px', color: `rgb(${color})`,
                            background: `rgba(${color}, 0.1)`,
                            padding: '2px 10px', borderRadius: '20px', fontWeight: 700
                        }}>{role.type}</span>
                        <span style={{ fontSize: '12px', color: '#475569' }}>{role.location}</span>
                        <span style={{ fontSize: '12px', color: '#475569' }}>·</span>
                        <span style={{ fontSize: '12px', color: '#475569' }}>{role.comp}</span>
                    </div>
                </div>

                <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={18} color="#475569" />
                </motion.div>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        key="body"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div style={{ padding: '0 24px 28px', borderTop: `1px solid rgba(${color}, 0.08)` }}>
                            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: 1.8, margin: '18px 0 16px' }}>
                                {role.desc}
                            </p>
                            <div style={{ marginBottom: '22px' }}>
                                <div style={{
                                    color: '#cbd5e1', fontSize: '11px', fontWeight: 700,
                                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px'
                                }}>
                                    What we look for
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                    {role.requirements.map((r, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', color: '#94a3b8', fontSize: '13px' }}>
                                            <Check size={13} color={`rgb(${color})`} style={{ marginTop: '2px', flexShrink: 0 }} />
                                            {r}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <a
                                href="https://tally.so/r/vestra-apply"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                                    padding: '10px 22px', borderRadius: '10px',
                                    background: `rgba(${color}, 0.12)`,
                                    border: `1px solid rgba(${color}, 0.3)`,
                                    color: `rgb(${color})`, fontSize: '13px', fontWeight: 700,
                                    textDecoration: 'none', transition: 'all 0.2s'
                                }}
                            >
                                Apply for this role <ExternalLink size={13} />
                            </a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────
export default function Hiring() {
    return (
        <div className="stack">

            {/* Header */}
            <motion.div variants={stagger} initial="initial" animate="animate" style={{ marginBottom: '3rem' }}>
                <motion.div variants={fadeUp}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                        borderRadius: '20px', padding: '4px 14px', marginBottom: '18px'
                    }}>
                        <Zap size={13} color="#a78bfa" />
                        <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: 600 }}>We're Hiring</span>
                    </div>
                    <h1 className="page-title holo-glow" style={{ maxWidth: '680px', marginBottom: '1rem' }}>
                        Build the future of vesting credit
                    </h1>
                    <p className="page-subtitle" style={{ maxWidth: '560px', margin: '0 0 2rem' }}>
                        Vestra Protocol is assembling a lean, high-conviction team. No bloat, no bureaucracy — just world-class people building something that matters.
                    </p>
                    <div className="inline-actions">
                        <a
                            href="https://tally.so/r/vestra-apply"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="button"
                            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                            Apply Now <ExternalLink size={14} />
                        </a>
                    </div>
                </motion.div>
            </motion.div>

            {/* At-a-glance */}
            <div className="stat-row" style={{ marginBottom: '3.5rem' }}>
                {[
                    { label: 'Team Size', value: 'Small & Tight', sub: 'No bloat, high signal', icon: Users },
                    { label: 'Work Style', value: 'Async-First', sub: 'Remote, always', icon: Globe },
                    { label: 'Stage', value: 'Pre-Mainnet', sub: 'Testnet live, shipping fast', icon: Briefcase },
                    { label: 'Compensation', value: 'Token + Cash', sub: 'CRDT allocation included', icon: Zap }
                ].map(s => (
                    <div key={s.label} className="stat-card">
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value">{s.value}</div>
                        <div className="stat-delta">{s.sub}</div>
                    </div>
                ))}
            </div>

            {/* Philosophy */}
            <motion.div
                variants={fadeUp} initial="initial" whileInView="animate" viewport={{ once: true }}
                className="holo-card"
                style={{
                    marginBottom: '3rem',
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.07), rgba(59,130,246,0.05))',
                    border: '1px solid rgba(139,92,246,0.18)',
                    padding: '2.5rem'
                }}
            >
                <h3 className="holo-title" style={{ marginBottom: '1rem' }}>Our hiring philosophy</h3>
                <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: 1.85, maxWidth: '700px', margin: '0 0 1.5rem' }}>
                    We don't care about where you went to school or how many years are on your CV. We care about what you've shipped, how you think about problems, and whether you take ownership without being told. Every hire is expected to be world-class at their craft. We keep the team small on purpose — fewer people, higher trust, faster execution.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {VALUES.map(v => (
                        <div key={v} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Check size={11} color="#34d399" /> {v}
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Role Sections */}
            {ROLES.map(section => (
                <div key={section.group} style={{ marginBottom: '3.5rem' }}>
                    {/* Section header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '20px' }}>{section.emoji}</span>
                        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)' }}>
                            {section.group}
                        </h2>
                        <span style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.05)' }} />
                        <span style={{
                            fontSize: '12px', color: `rgb(${section.color})`,
                            background: `rgba(${section.color}, 0.1)`,
                            border: `1px solid rgba(${section.color}, 0.2)`,
                            padding: '2px 10px', borderRadius: '20px', fontWeight: 600
                        }}>
                            {section.positions.length} open
                        </span>
                    </div>
                    <p style={{ color: '#475569', fontSize: '13px', marginBottom: '1.5rem', paddingLeft: '32px' }}>
                        {section.tagline}
                    </p>

                    <motion.div
                        variants={stagger} initial="initial" whileInView="animate" viewport={{ once: true }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                        {section.positions.map(role => (
                            <RoleCard key={role.title} role={role} color={section.color} />
                        ))}
                    </motion.div>
                </div>
            ))}

            {/* Open Application CTA */}
            <motion.div
                variants={fadeUp} initial="initial" whileInView="animate" viewport={{ once: true }}
                className="holo-card"
                style={{ textAlign: 'center', padding: '3.5rem 2rem' }}
            >
                <h3 className="holo-title" style={{ marginBottom: '0.75rem' }}>Don't see your role?</h3>
                <p className="muted" style={{ marginBottom: '1.8rem', maxWidth: '480px', margin: '0 auto 1.8rem' }}>
                    If you're exceptional at something and believe you can move the needle for Vestra Protocol — reach out. We read every application.
                </p>
                <a
                    href="https://tally.so/r/vestra-apply"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button"
                    style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                    Submit Open Application <ExternalLink size={14} />
                </a>
            </motion.div>

        </div>
    );
}
