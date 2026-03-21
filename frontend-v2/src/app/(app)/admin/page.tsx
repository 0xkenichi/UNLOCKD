"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Shield, 
  Lock, 
  Eye, 
  EyeOff, 
  Plus, 
  Trash2, 
  Copy, 
  CheckCircle, 
  FileText, 
  AlertTriangle, 
  Users, 
  LogOut, 
  ChevronRight, 
  Key, 
  Activity,
  ArrowRight,
  Trophy
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { RiskPulse } from "@/components/admin/RiskPulse";
import { toast } from "react-hot-toast";
import Link from "next/link";

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPER_ADMIN_PASSPHRASE = 'vestra-finch-2025-Ω';
const STORAGE_KEY = 'vestra_admin_session';
const WHITELIST_KEY = 'vestra_admin_whitelist';

const SENSITIVE_DOCS = [
    {
        id: 'risk-engine-internals',
        title: 'Risk Engine Internals v2',
        category: 'PROPRIETARY',
        classification: 'TOP SECRET',
        summary: 'Internal mechanics of the Monte Carlo DPV model, TWAP oracle integration, and volatility surface generation.',
        content: `## Risk Engine Internals — DPV Model (v2)
**Classification: Proprietary — Do Not Distribute**  
**Author: Finch / Vestra Protocol Core**

---

### 1. Overview
The Discounted Present Value (DPV) engine is the core of Vestra Protocol's collateral valuation. It prices unvested token allocations using TWAP feeds and Monte Carlo volatility simulations.`
    },
    {
        id: 'institutional-architecture',
        title: 'Institutional Architecture Blueprint',
        category: 'ARCHITECTURE',
        classification: 'CONFIDENTIAL',
        summary: 'Full layered architecture including private loan rooms, isolated pools, and flash-pump circuit breakers.',
        content: `## Institutional Architecture Blueprint
**Classification: Confidential — Vestra Core Team Only**  
**Author: Finch / Protocol Architecture**

---

### 1. Private Loan Rooms
Private loans operate via a vault-based escrow model where the counterparty is an on-chain vault address, not a public borrower.`
    }
];

// ─── Login Gate ─────────────────────────────────────────────────────────────
const LoginGate = ({ onLogin }: { onLogin: () => void }) => {
    const [pass, setPass] = useState('');
    const [show, setShow] = useState(false);
    const [shake, setShake] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pass === SUPER_ADMIN_PASSPHRASE) {
            sessionStorage.setItem(STORAGE_KEY, '1');
            onLogin();
            toast.success("Administrator access granted.");
        } else {
            setShake(true);
            setTimeout(() => setShake(false), 600);
            setPass('');
            toast.error("Invalid credentials.");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(46,190,181,0.1),transparent_50%)]" />
            
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, x: shake ? [-10, 10, -10, 10, 0] : 0 }}
                className="w-full max-w-md p-8 rounded-3xl border border-white/5 bg-surface/50 backdrop-blur-2xl shadow-3xl relative z-10"
            >
                <div className="text-center mb-10">
                    <div className="w-16 h-16 rounded-2xl bg-accent-teal/10 border border-accent-teal/20 flex items-center justify-center mx-auto mb-6">
                        <Shield className="w-8 h-8 text-accent-teal" />
                    </div>
                    <h1 className="text-2xl font-black uppercase italic tracking-tighter text-white">Admin Portal</h1>
                    <p className="text-xs text-secondary font-medium mt-2">Restricted access. Super admins only.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="relative">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary opacity-50" />
                        <input
                            type={show ? 'text' : 'password'}
                            value={pass}
                            onFocus={(e) => e.target.style.borderColor = 'rgba(46,190,181,0.5)'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.05)'}
                            onChange={e => setPass(e.target.value)}
                            placeholder="SUPER_ADMIN_PASSPHRASE"
                            className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-12 text-sm outline-none transition-all font-mono text-accent-teal"
                        />
                        <button 
                            type="button" 
                            onClick={() => setShow(!show)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary hover:text-white transition-colors"
                        >
                            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    <button 
                        type="submit"
                        className="w-full py-4 bg-accent-teal text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all shadow-glow-teal"
                    >
                        Access Secure Hub
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

// ─── IP Vault ─────────────────────────────────────────────────────────────────
const IPVault = () => {
    const [selected, setSelected] = useState<any>(null);

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">IP Vault</h2>
                <p className="text-xs text-secondary mt-1 italic font-medium">Proprietary logic and internal protocol documentation.</p>
            </header>

            <AnimatePresence mode="wait">
                {selected ? (
                    <motion.div 
                        key="reader"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <button 
                            onClick={() => setSelected(null)}
                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-secondary hover:text-accent-teal transition-colors"
                        >
                            <ArrowLeft className="w-3 h-3" /> Back to Vault
                        </button>
                        <Card variant="glass" className="bg-surface/50 border border-white/5">
                            <CardContent className="p-8 prose prose-invert max-w-none">
                                <header className="mb-8 pb-8 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="text-3xl font-black uppercase italic tracking-tighter m-0">{selected.title}</h3>
                                    <span className="px-3 py-1 rounded-full bg-accent-red/10 border border-accent-red/20 text-[10px] font-black tracking-widest text-accent-red uppercase">
                                        {selected.classification}
                                    </span>
                                </header>
                                <div className="text-secondary font-medium leading-relaxed redaction-text whitespace-pre-line">
                                    {selected.content}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ) : (
                    <motion.div 
                        key="grid"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                        {SENSITIVE_DOCS.map(doc => (
                            <motion.div 
                                key={doc.id}
                                onClick={() => setSelected(doc)}
                                className="cursor-pointer"
                            >
                                <Card 
                                    variant="glass" 
                                    className="group hover:border-accent-teal/30 transition-all bg-surface/30 backdrop-blur-md h-full"
                                >
                                    <CardContent className="p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">{doc.category}</span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-accent-red">{doc.classification}</span>
                                        </div>
                                        <h3 className="text-lg font-black uppercase italic tracking-tighter text-white group-hover:text-accent-teal transition-colors mb-2">{doc.title}</h3>
                                        <p className="text-xs text-secondary leading-relaxed line-clamp-2 opacity-70 mb-4">{doc.summary}</p>
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-accent-teal">
                                            Unlock Intelligence <ChevronRight className="w-3 h-3" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ─── Whitelist Manager ────────────────────────────────────────────────────────
const WhitelistManager = () => {
    const [list, setList] = useState<any[]>([]);
    const [newAddr, setNewAddr] = useState('');
    const [newLabel, setNewLabel] = useState('');

    useEffect(() => {
        const stored = localStorage.getItem(WHITELIST_KEY);
        if (stored) try { setList(JSON.parse(stored)); } catch { setList([]); }
    }, []);

    const addEntry = () => {
        if (!newAddr.startsWith('0x') || newAddr.length !== 42) {
            toast.error("Invalid address format."); return;
        }
        const next = [...list, { address: newAddr, label: newLabel || 'System Entity', addedAt: Date.now() }];
        setList(next);
        localStorage.setItem(WHITELIST_KEY, JSON.stringify(next));
        setNewAddr(''); setNewLabel('');
        toast.success("Identity whitelisted.");
    };

    const removeEntry = (addr: string) => {
        const next = list.filter(e => e.address !== addr);
        setList(next);
        localStorage.setItem(WHITELIST_KEY, JSON.stringify(next));
    };

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">Identity Whitelist</h2>
                <p className="text-xs text-secondary mt-1 italic font-medium">Manage authorized test wallets and institutional partners.</p>
            </header>

            <Card variant="solid" className="bg-white/5 border border-white/5 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <input 
                        className="bg-surface border border-white/5 rounded-xl px-4 py-3 text-xs font-mono text-accent-teal outline-none focus:border-accent-teal/50"
                        placeholder="0x... ETHEREUM ADDRESS"
                        value={newAddr}
                        onChange={e => setNewAddr(e.target.value)}
                    />
                    <input 
                        className="bg-surface border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none focus:border-accent-teal/50"
                        placeholder="ENTITY LABEL"
                        value={newLabel}
                        onChange={e => setNewLabel(e.target.value)}
                    />
                    <button 
                        onClick={addEntry}
                        className="bg-accent-teal text-background font-black uppercase tracking-widest rounded-xl hover:bg-white transition-all text-[10px] py-3"
                    >
                        Authorize Identity
                    </button>
                </div>
            </Card>

            <div className="space-y-3">
                {list.map(entry => (
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={entry.address} 
                        className="flex items-center justify-between p-4 rounded-2xl bg-surface/30 border border-white/5 backdrop-blur-md"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center">
                                <Users className="w-4 h-4 text-accent-teal" />
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-widest text-white">{entry.label}</div>
                                <div className="text-[10px] font-mono text-secondary opacity-50">{entry.address}</div>
                            </div>
                        </div>
                        <button 
                            onClick={() => removeEntry(entry.address)}
                            className="p-3 rounded-xl hover:bg-accent-red/10 text-secondary hover:text-accent-red transition-all"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPage() {
    const [isAuthed, setIsAuthed] = useState(false);
    const [tab, setTab] = useState('sentinel');

    useEffect(() => {
        if (sessionStorage.getItem(STORAGE_KEY) === '1') setIsAuthed(true);
    }, []);

    const handleLogout = () => {
        sessionStorage.removeItem(STORAGE_KEY);
        setIsAuthed(false);
    };

    if (!isAuthed) return <LoginGate onLogin={() => setIsAuthed(true)} />;

    return (
        <div className="min-h-screen space-y-8 pb-20">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-accent-teal/10 border border-accent-teal/30 flex items-center justify-center shadow-glow-teal">
                        <Shield className="w-6 h-6 text-accent-teal" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white flex items-center gap-3">
                            Terminal Console
                            <span className="text-[10px] not-italic tracking-widest bg-accent-teal text-background px-2 py-0.5 rounded-full">SUPER_ADMIN</span>
                        </h1>
                        <p className="text-xs text-secondary font-medium italic opacity-70">Authenticated session active · System stable.</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <Link 
                        href="/admin/risk"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-accent-cyan/50 text-secondary hover:text-accent-cyan transition-all text-[10px] font-black uppercase tracking-widest"
                    >
                        Risk Engine <Activity className="w-3 h-3" />
                    </Link>
                    <Link 
                        href="/admin/airdrop"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-accent-teal/50 text-secondary hover:text-accent-teal transition-all text-[10px] font-black uppercase tracking-widest"
                    >
                        Rewards Hub <Trophy className="w-3 h-3" />
                    </Link>
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red hover:bg-accent-red hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
                    >
                        De-Auth <LogOut className="w-3 h-3" />
                    </button>
                </div>
            </header>

            <div className="flex gap-2 border-b border-white/5 pb-0">
                {[
                    { id: 'sentinel', label: 'Sentinel Monitor', icon: Activity },
                    { id: 'vault', label: 'IP Vault', icon: FileText },
                    { id: 'whitelist', label: 'Whitelist', icon: Users },
                ].map(t => (
                    <button 
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                            tab === t.id ? 'text-accent-teal border-accent-teal' : 'text-secondary border-transparent hover:text-white'
                        }`}
                    >
                        <t.icon className="w-3 h-3" />
                        {t.label}
                    </button>
                ))}
            </div>

            <main className="relative">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={tab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        {tab === 'sentinel' && (
                            <div className="max-w-2xl">
                                <RiskPulse />
                            </div>
                        )}
                        {tab === 'vault' && <IPVault />}
                        {tab === 'whitelist' && <WhitelistManager />}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
}

const ArrowLeft = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
);
