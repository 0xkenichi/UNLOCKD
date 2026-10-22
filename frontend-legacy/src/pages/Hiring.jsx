// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Code2, Shield, LineChart, Globe, MessageSquare,
    ExternalLink, ChevronDown, Check, Zap, Users, Briefcase
} from 'lucide-react';
import '../styles/pages.css';

// ─── OPEN ROLES ─────────────────────────────────────────────────────────────
const ROLES = [
    {
        group: 'Core Team',
        emoji: '⚡',
        color: '176, 141, 87',
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
        color: '196, 162, 108',
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
        color: '127, 156, 120',
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
        <div className="holo-card hiring-role">
            <button
                type="button"
                className="hiring-role__toggle"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                <div className="hiring-role__icon">
                    <role.icon size={18} strokeWidth={1.5} color={`rgb(${color})`} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hiring-role__title">
                        {role.title}
                    </div>
                    <div className="hiring-role__meta">
                        <span className="tag">{role.type}</span>
                        <span>{role.location}</span>
                        <span aria-hidden="true">·</span>
                        <span>{role.comp}</span>
                    </div>
                </div>

                <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={18} color="var(--text-muted)" />
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
                        <div className="hiring-role__body">
                            <p>
                                {role.desc}
                            </p>
                            <div className="stat-label">
                                What we look for
                            </div>
                            <ul className="hiring-role__reqs">
                                {role.requirements.map((r, i) => (
                                    <li key={i}>
                                        <Check size={13} color={`rgb(${color})`} />
                                        {r}
                                    </li>
                                ))}
                            </ul>
                            <a
                                href="https://tally.so/r/vestra-apply"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="button ghost"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
                            >
                                Apply for this role <ExternalLink size={13} />
                            </a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────
export default function Hiring() {
    return (
        <div className="stack px-page">

            {/* Header */}
            <header className="page-header px-hero">
                <div>
                    <p className="vx-eyebrow">We&apos;re hiring</p>
                    <h1 className="page-title">
                        Build the future of <em>vesting credit</em>
                    </h1>
                    <p className="page-subtitle">
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
                </div>
            </header>

            {/* At-a-glance */}
            <dl className="px-facts">
                {[
                    { label: 'Team Size', value: 'Small & Tight', sub: 'No bloat, high signal', icon: Users },
                    { label: 'Work Style', value: 'Async-First', sub: 'Remote, always', icon: Globe },
                    { label: 'Stage', value: 'Pre-Mainnet', sub: 'Testnet live, shipping fast', icon: Briefcase },
                    { label: 'Compensation', value: 'Token + Cash', sub: 'CRDT allocation included', icon: Zap }
                ].map(s => (
                    <div key={s.label} className="px-fact">
                        <dt className="stat-label">{s.label}</dt>
                        <dd>
                            <span className="stat-value">{s.value}</span>
                            <span className="px-fact__note">{s.sub}</span>
                        </dd>
                    </div>
                ))}
            </dl>

            {/* Philosophy */}
            <section className="px-split">
                <div>
                    <p className="vx-eyebrow">How we hire</p>
                    <h2 className="section-title">Our hiring philosophy</h2>
                </div>
                <div className="px-prose">
                    <p>
                        We don't care about where you went to school or how many years are on your CV. We care about what you've shipped, how you think about problems, and whether you take ownership without being told. Every hire is expected to be world-class at their craft. We keep the team small on purpose — fewer people, higher trust, faster execution.
                    </p>
                    <div className="hiring-values">
                        {VALUES.map(v => (
                            <div key={v} className="pill">
                                <Check size={11} color="var(--success-400)" /> {v}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Role Sections */}
            <div>
                {ROLES.map(section => (
                    <section key={section.group} className="hiring-group">
                        {/* Section header */}
                        <div className="hiring-group__head">
                            <h2 className="section-title">
                                {section.group}
                            </h2>
                            <span className="tag">
                                {section.positions.length} open
                            </span>
                        </div>
                        <p className="hiring-group__tagline">
                            {section.tagline}
                        </p>

                        <div className="hiring-roles">
                            {section.positions.map(role => (
                                <RoleCard key={role.title} role={role} color={section.color} />
                            ))}
                        </div>
                    </section>
                ))}
            </div>

            {/* Open Application CTA */}
            <section className="vx-certificate px-join">
                <h2 className="section-title">Don't see your role?</h2>
                <p className="muted">
                    If you're exceptional at something and believe you can move the needle for Vestra Protocol — reach out. We read every application.
                </p>
                <div className="inline-actions">
                    <a
                        href="https://tally.so/r/vestra-apply"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                    >
                        Submit Open Application <ExternalLink size={14} />
                    </a>
                </div>
            </section>

        </div>
    );
}
