// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Eye, EyeOff, Plus, Trash2, Copy, CheckCircle, FileText, AlertTriangle, Users, LogOut, ChevronRight, Key, X, Activity } from 'lucide-react';
import RiskPulse from '../components/dashboard/RiskPulse.jsx';

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPER_ADMIN_PASSPHRASE = 'vestra-finch-2025-Ω';     // Change in production
const STORAGE_KEY = 'vestra_admin_session';
const WHITELIST_KEY = 'vestra_admin_whitelist';

// ─── Sensitive Documents (kept out of public Docs page) ────────────────────
const SENSITIVE_DOCS = [
    {
        id: 'risk-engine-internals',
        title: 'Risk Engine Internals v2',
        category: 'PROPRIETARY',
        classification: 'TOP SECRET',
        summary: 'Internal mechanics of the Monte Carlo DPV model, TWAP oracle integration, and volatility surface generation.',
        content: `# Risk Engine Internals — DPV Model (v2)

**Classification: Proprietary — Do Not Distribute**  
**Author: Finch / Vestra Protocol Core**

---

## 1. Overview

The Discounted Present Value (DPV) engine is the core of Vestra Protocol's collateral valuation. It prices unvested token allocations using a combination of:
- Time-weighted average price (TWAP) from on-chain oracle feeds
- Monte Carlo volatility simulation (10,000 paths × 30s intervals)
- Haircut curves calibrated per unlock duration

## 2. TWAP Oracle Integration

\`\`\`
P_twap = (Σ priceᵢ × timeᵢ) / totalWindow

Window: 3600s default, configurable per token
Stale Price Threshold: maxPriceAge = 300s
Circuit Breaker: if |P_spot - P_twap| > 20%, reject valuation
\`\`\`

## 3. Monte Carlo Simulation

Each valuation runs 10,000 GBM paths:
\`\`\`
S(t) = S(0) × exp((μ - σ²/2)t + σ√t × Z)
where Z ~ N(0,1)
\`\`\`

LTV is the 5th percentile of the terminal price distribution discounted to present value.

## 4. Staged Liquidation Thresholds

| Tier | Health Factor | Action |
|------|---------------|--------|
| 1 | ≥ 1.10 | Healthy, no action |
| 2 | 1.00 – 1.09 | Soft warning, UI alert |
| 3 | 0.90 – 0.99 | Staged tranche auction begins |
| 4 | < 0.90 | Full liquidation, insurance vault covers deficit |

## 5. Insurance Vault Backstop

The InsuranceVault.sol holds a reserve funded by 5% of all origination fees. Bad debt from defaulted loans is written down against this reserve, ensuring lenders face zero net loss.`
    },
    {
        id: 'institutional-architecture',
        title: 'Institutional Architecture Blueprint',
        category: 'ARCHITECTURE',
        classification: 'CONFIDENTIAL',
        summary: 'Full layered architecture including private loan rooms, isolated pools, flash-pump circuit breakers, and geo-blocking strategy.',
        content: `# Institutional Architecture Blueprint

**Classification: Confidential — Vestra Core Team Only**  
**Author: Finch / Protocol Architecture**

---

## 1. Private Loan Rooms

Private loans operate via a vault-based escrow model where the counterparty is an onchain vault address, not a public borrower. This:
- Hides borrower identity from public indexers
- Routes settlement through institutional vault interfaces
- Allows for custom liquidation preferences per institution

## 2. Isolated Lending Pools

Each token category has its own lending pool shard, preventing cross-contamination of liquidity. High-risk tokens (recently listed, low liquidity) are capped at 15% LTV maximum regardless of DPV output.

## 3. Flash-Pump Circuit Breakers

Three-layer defense:
1. **TWAP Gate**: Spot price must be within 20% of TWAP
2. **Volume Anomaly Detector**: Flags tokens with 5× normal trading volume in 3600s window
3. **Admin Override**: Protocol owner can pause a specific token feed within 30s

## 4. SEC Geo-Blocking Strategy

Geo-blocked at the frontend level based on Cloudflare IP geolocation. Smart contract layer remains neutral. Blocked jurisdictions: US, UK (pending), restricted markets.

## 5. Fractional LTV Capping

For tokens with cliff-based schedules, LTV is fractionally capped based on the percentage of allocation that has not vested. This prevents borrowing against theoretically vested tokens that are practically non-liquid.`
    },
    {
        id: 'tokenomics-internal',
        title: 'CRDT Full Tokenomics (Internal)',
        category: 'TOKENOMICS',
        classification: 'RESTRICTED',
        summary: 'Full CRDT allocation breakdown including team, advisor and seed round vesting schedules not yet publicly disclosed.',
        content: `# CRDT Tokenomics — Internal Full Version

**Classification: Restricted**  
**Author: Finch / Vestra Protocol**

---

## Total Supply: 100,000,000 CRDT

| Tranche | Allocation | Cliff | Vesting |
|---------|------------|-------|---------|
| Protocol Treasury | 25% | 12mo | 48mo |
| Team & Founders | 15% | 12mo | 36mo |
| Ecosystem Grants | 15% | 3mo | 24mo |
| Community Airdrop | 10% | 0mo | 12mo |
| Liquidity Incentives | 10% | 0mo | 18mo |
| Seed Round | 8% | 6mo | 24mo |
| Strategic Partners | 7% | 6mo | 18mo |
| Security Reserve | 5% | 12mo | 60mo |
| Advisory | 3% | 6mo | 18mo |
| Public Sale | 2% | 0mo | 0mo |

## Seed Round Details (Not Public)

Seed at: $0.025 / CRDT  
Round size: $2M  
Participants: [REDACTED — see legal folder]  
SAFT signed: Yes

## Advisor Wallets

All advisor allocations are held in Sablier v2 linear vesting wallets with cliff. Advisor identity disclosed only in legal agreements.`
    },
    {
        id: 'founder-notes',
        title: 'Founder Vision & Roadmap Notes',
        category: 'STRATEGY',
        classification: 'CONFIDENTIAL',
        summary: 'Finch\'s working notes on product vision, market positioning, and the Phase 2 feature roadmap.',
        content: `# Founder Notes — Vision & Roadmap

**Author: Finch**  
**Classification: Confidential**

---

## Core Thesis

The $300B+ locked in vesting schedules globally is the most overlooked liquidity gap in crypto. Every startup team member, investor, and advisor is sitting on illiquid paper wealth they cannot touch. Vestra captures this market by being the first protocol to price and lend against these schedules in a fully non-custodial, trustless manner.

## Phase 1 (Current)

- Core borrow/lend mechanics live on Base Sepolia testnet
- TWAP + Monte Carlo DPV model validated with 100+ scenario suite
- Institutional stress tests passing: SEC geo-blocking, flash pump circuit breakers, fractional LTV caps

## Phase 2 (Q3 2025)

- Mainnet launch on Base
- Sablier V2 native integration
- Cross-chain vesting support (Flow EVM, Avalanche)
- UI for institutional liquidity providers (private pool creation)

## Phase 3 (Q1 2026)

- Governance via CRDT token
- DAO-controlled parameter updates
- Partnerships with major token issuers for white-label vesting credit solutions

## Competitive Moat

Vestra's moat is the DPV engine. No competitor currently uses Monte Carlo simulation for vesting-based collateral. The moment this goes live on mainnet with adequate liquidity, the network effects become self-reinforcing — more borrowers → more yield → more lenders → more liquidity for borrowers.`
    }
];

// ─── Admin Panel Tabs ─────────────────────────────────────────────────────────
const TABS = [
    { id: 'vault', label: 'IP Vault', icon: FileText },
    { id: 'sentinel', label: 'Sentinel', icon: Activity },
    { id: 'whitelist', label: 'Whitelist', icon: Users },
];

// ─── Helper ───────────────────────────────────────────────────────────────────
function copyText(text, setCopied) {
    navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    });
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginGate({ onLogin }) {
    const [pass, setPass] = useState('');
    const [show, setShow] = useState(false);
    const [error, setError] = useState('');
    const [shake, setShake] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (pass === SUPER_ADMIN_PASSPHRASE) {
            sessionStorage.setItem(STORAGE_KEY, '1');
            onLogin();
        } else {
            setError('Invalid passphrase. Access denied.');
            setShake(true);
            setTimeout(() => setShake(false), 600);
            setPass('');
        }
    };

    return (
        <div style={{
            minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--space-6) 0'
        }}>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0, x: shake ? [-8, 8, -8, 8, 0] : 0 }}
                transition={{ duration: shake ? 0.4 : 0.4 }}
                style={{
                    width: '100%', maxWidth: '400px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '48px 40px',
                    boxShadow: 'inset 0 0 0 5px var(--surface), inset 0 0 0 6px var(--border-primary), var(--shadow-lg)'
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-accent)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px'
                    }}>
                        <Shield size={32} color="#c4a26c" />
                    </div>
                    <h1 className="section-title" style={{ margin: 0, fontSize: '30px' }}>Admin Portal</h1>
                    <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>Restricted access. Super admins only.</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ position: 'relative', marginBottom: '16px' }}>
                        <Key size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                        <input
                            type={show ? 'text' : 'password'}
                            value={pass}
                            onChange={e => { setPass(e.target.value); setError(''); }}
                            placeholder="Enter super admin passphrase"
                            style={{
                                width: '100%', boxSizing: 'border-box',
                                background: 'var(--surface-soft)', border: `1px solid ${error ? 'rgba(178,86,75,0.4)' : 'var(--border-primary)'}`,
                                borderRadius: 'var(--radius-sm)', padding: '14px 48px 14px 44px',
                                color: 'var(--text-primary)', fontSize: '15px', outline: 'none', fontFamily: 'var(--font-body)',
                                transition: 'border-color 0.2s'
                            }}
                            onFocus={e => { if (!error) e.target.style.borderColor = 'rgba(176,141,87,0.5)'; }}
                            onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border-primary)'; }}
                        />
                        <button type="button" onClick={() => setShow(s => !s)} style={{
                            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px'
                        }}>
                            {show ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    {error && (
                        <p style={{ color: 'var(--danger-400)', fontSize: '13px', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertTriangle size={14} /> {error}
                        </p>
                    )}

                    <button type="submit" className="button" style={{ width: '100%' }}>
                        Access Admin Portal
                    </button>
                </form>
            </motion.div>
        </div>
    );
}

// ─── IP Vault ─────────────────────────────────────────────────────────────────
function IPVault() {
    const [selected, setSelected] = useState(null);

    const classColors = {
        'TOP SECRET': { bg: 'rgba(178,86,75,0.1)', border: 'rgba(178,86,75,0.3)', text: '#cc7a6e' },
        CONFIDENTIAL: { bg: 'rgba(194,148,68,0.1)', border: 'rgba(194,148,68,0.3)', text: '#d8b06a' },
        RESTRICTED: { bg: 'rgba(196,162,108,0.1)', border: 'rgba(196,162,108,0.3)', text: '#c4a26c' },
    };

    if (selected) {
        const c = classColors[selected.classification] || classColors.RESTRICTED;
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <button onClick={() => setSelected(null)} className="button ghost" style={{ minHeight: 34, padding: '6px 12px' }}>← Back</button>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: c.text, background: c.bg, border: `1px solid ${c.border}`, padding: '3px 10px', borderRadius: '6px' }}>{selected.classification}</span>
                    <h2 className="section-title" style={{ margin: 0 }}>{selected.title}</h2>
                </div>
                <div className="holo-card" style={{ padding: '32px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                                        <div className="admin-md">
                        {selected.content.split('\n').map((line, i) => {
                            if (line.startsWith('# ')) return <h1 key={i}>{line.slice(2)}</h1>;
                            if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
                            if (line.startsWith('### ')) return <h3 key={i}>{line.slice(4)}</h3>;
                            if (line.startsWith('```')) return null;
                            if (line.startsWith('| ')) return <p key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', overflowWrap: 'anywhere' }}>{line}</p>;
                            if (line.startsWith('**') && line.endsWith('**')) return <strong key={i} style={{ display: 'block', color: 'var(--text-primary)' }}>{line.slice(2, -2)}</strong>;
                            if (line === '---') return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--rule)', margin: '24px 0' }} />;
                            if (line === '') return <br key={i} />;
                            return <p key={i} style={{ margin: '0 0 4px' }}>{line}</p>;
                        })}
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <div>
            <div style={{ marginBottom: '24px' }}>
                <h2 className="section-title" style={{ margin: '0 0 8px' }}>Intellectual Property Vault</h2>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>Classified documents not available in public documentation.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                {SENSITIVE_DOCS.map(doc => {
                    const c = classColors[doc.classification] || classColors.RESTRICTED;
                    return (
                        <motion.div
                            key={doc.id}
                            onClick={() => setSelected(doc)}
                                                        className="doc-card"
                            style={{ padding: '24px', cursor: 'pointer' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <span className="stat-label">{doc.category}</span>
                                <span className="tag" style={{ color: c.text, borderColor: c.border }}>{doc.classification}</span>
                            </div>
                            <h3 className="holo-title" style={{ margin: '0 0 8px' }}>{doc.title}</h3>
                            <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>{doc.summary}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--brass-300)', fontSize: '13px', fontWeight: 600 }}>
                                View Document <ChevronRight size={14} />
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Whitelist Manager ────────────────────────────────────────────────────────
function WhitelistManager() {
    const [list, setList] = useState(() => {
        try { return JSON.parse(localStorage.getItem(WHITELIST_KEY) || '[]'); } catch { return []; }
    });
    const [newAddr, setNewAddr] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [copied, setCopied] = useState('');
    const [error, setError] = useState('');

    const saveList = (next) => {
        setList(next);
        localStorage.setItem(WHITELIST_KEY, JSON.stringify(next));
    };

    const addEntry = () => {
        if (!newAddr.match(/^0x[0-9a-fA-F]{40}$/)) {
            setError('Invalid Ethereum address format.'); return;
        }
        if (list.some(e => e.address.toLowerCase() === newAddr.toLowerCase())) {
            setError('Address already in whitelist.'); return;
        }
        saveList([...list, { address: newAddr, label: newLabel || 'Unlabeled', addedAt: Date.now() }]);
        setNewAddr(''); setNewLabel(''); setError('');
    };

    const removeEntry = (addr) => saveList(list.filter(e => e.address !== addr));

    return (
        <div>
            <div style={{ marginBottom: '24px' }}>
                <h2 className="section-title" style={{ margin: '0 0 8px' }}>Whitelist Management</h2>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>Manage test wallets and authorized addresses for the admin portal.</p>
            </div>

            {/* Add Entry */}
            <div className="holo-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <h3 className="holo-title" style={{ margin: '0 0 16px' }}>Add Address</h3>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input
                        value={newAddr}
                        onChange={e => { setNewAddr(e.target.value); setError(''); }}
                        placeholder="0x... wallet address"
                        style={{ flex: '1 1 260px', minWidth: 0, padding: '10px 14px', fontSize: '13px', fontFamily: 'var(--font-mono)' }}
                    />
                    <input
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                        placeholder="Label (optional)"
                        style={{ flex: '1 1 150px', minWidth: 0, padding: '10px 14px', fontSize: '14px' }}
                    />
                    <button onClick={addEntry} className="button" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={16} /> Add
                    </button>
                </div>
                {error && <p style={{ color: 'var(--danger-400)', fontSize: '13px', margin: '10px 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={13} /> {error}</p>}
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {list.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                        <Users size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
                        <p style={{ margin: 0 }}>No whitelisted addresses yet.</p>
                    </div>
                )}
                {list.map(entry => (
                    <motion.div key={entry.address} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                        padding: '14px 20px', background: 'var(--surface)', border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-md)', flexWrap: 'wrap'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                            <CheckCircle size={16} color="#9db896" />
                            <div>
                                <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600 }}>{entry.label}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{entry.address}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => copyText(entry.address, () => setCopied(entry.address))} style={{ background: 'transparent', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', color: copied === entry.address ? 'var(--success-400)' : 'var(--text-secondary)', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                                {copied === entry.address ? <CheckCircle size={13} /> : <Copy size={13} />}
                            </button>
                            <button onClick={() => removeEntry(entry.address)} style={{ background: 'transparent', border: '1px solid rgba(178,86,75,0.35)', borderRadius: 'var(--radius-sm)', color: 'var(--danger-400)', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <Trash2 size={13} />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function Admin() {
    const [authed, setAuthed] = useState(() => sessionStorage.getItem(STORAGE_KEY) === '1');
    const [tab, setTab] = useState('vault');

    const logout = () => {
        sessionStorage.removeItem(STORAGE_KEY);
        setAuthed(false);
    };

    if (!authed) return <LoginGate onLogin={() => setAuthed(true)} />;

    return (
        <div style={{ minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ maxWidth: '1200px', margin: '0 auto 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={20} color="#c4a26c" />
                    </div>
                    <div>
                        <h1 className="section-title" style={{ margin: 0 }}>Vestra Admin Portal</h1>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px' }}>Super Administrator Access · <span style={{ color: '#9db896' }}>● Active Session</span></p>
                    </div>
                </div>
                <button onClick={logout} className="button ghost" style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: 'rgba(178,86,75,0.4)', color: 'var(--danger-400)' }}>
                    <LogOut size={14} /> Sign Out
                </button>
            </div>

            {/* Tabs */}
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '1px solid var(--rule)', paddingBottom: '0', overflowX: 'auto' }}>
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 20px', background: 'none', borderRadius: '0',
                            border: 'none', borderBottom: `1px solid ${tab === t.id ? 'var(--brass-400)' : 'transparent'}`,
                            color: tab === t.id ? 'var(--brass-300)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-body)', fontSize: '11.5px', fontWeight: 620, fontStretch: '118%',
                            letterSpacing: '0.09em', textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer',
                            marginBottom: '-1px', transition: 'all 0.2s'
                        }}>
                            <t.icon size={16} />
                            {t.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {tab === 'vault' && <IPVault />}
                        {tab === 'sentinel' && (
                            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                                <RiskPulse />
                            </div>
                        )}
                        {tab === 'whitelist' && <WhitelistManager />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
