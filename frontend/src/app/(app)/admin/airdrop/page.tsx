"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Trophy, 
  Download, 
  RefreshCw, 
  Filter, 
  Calculator, 
  Users, 
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
  Loader2
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AssetTable } from "@/components/ui/AssetTable";
import { MetricCard } from "@/components/ui/MetricCard";
import { api } from "@/utils/api";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STORAGE_KEY = 'vestra_admin_session';

const DAY_OPTIONS = [7, 14, 30, 60, 90];
const PHASE_OPTIONS = [
  { id: 'all', label: 'All Activity' },
  { id: 'phase1', label: 'Phase 1 (Onboarding)' },
  { id: 'phase2', label: 'Phase 2 (Usage Depth)' },
  { id: 'content', label: 'Phase 3 (Content/Community)' }
];
const STRATEGY_PRESETS = [
  { id: 'merit', label: 'Merit', description: '20% Equal + 80% Weighted', mode: 'hybrid', equalPct: 20 },
  { id: 'conservative', label: 'Conservative', description: '50% Equal + 50% Weighted', mode: 'hybrid', equalPct: 50 },
  { id: 'community', label: 'Community', description: '70% Equal + 30% Weighted', mode: 'hybrid', equalPct: 70 },
  { id: 'pure-weighted', label: 'Pure Weighted', description: '0% Equal + 100% Weighted', mode: 'weighted', equalPct: 0 }
];

export default function AdminAirdropPage() {
    const router = useRouter();
    const [isAuthed, setIsAuthed] = useState(false);
    const [windowDays, setWindowDays] = useState(30);
    const [limit, setLimit] = useState(200);
    const [phase, setPhase] = useState('all');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);

    // Simulator State
    const [tokenPool, setTokenPool] = useState('1000000');
    const [recipientLimit, setRecipientLimit] = useState(200);
    const [minScore, setMinScore] = useState(1);
    const [allocationMode, setAllocationMode] = useState('weighted');
    const [hybridEqualPct, setHybridEqualPct] = useState(30);

    useEffect(() => {
        if (sessionStorage.getItem(STORAGE_KEY) === '1') {
            setIsAuthed(true);
        } else {
            router.push('/admin');
        }
    }, [router]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.fetchAdminAirdropLeaderboard(windowDays, limit, phase);
            setData(res);
        } catch (err: any) {
            toast.error("Failed to sync leaderboard.");
        } finally {
            setLoading(false);
        }
    }, [windowDays, limit, phase]);

    useEffect(() => { if (isAuthed) load(); }, [isAuthed, load]);

    const allocationRows = useMemo(() => {
        const sourceRows = data?.leaderboard || [];
        const filtered = sourceRows
            .filter((row: any) => Number(row.score || 0) >= minScore)
            .slice(0, recipientLimit);
        
        const totalScore = filtered.reduce((sum: number, row: any) => sum + Number(row.score || 0), 0);
        const parsedTokenPool = Number(tokenPool) || 0;
        
        if (!filtered.length || parsedTokenPool <= 0) return [];

        const equalPool = allocationMode === 'hybrid' ? (parsedTokenPool * hybridEqualPct) / 100 : 0;
        const weightedPool = parsedTokenPool - equalPool;
        const equalPerRecipient = equalPool / filtered.length;

        return filtered.map((row: any) => {
            const weightedSharePct = totalScore > 0 ? (Number(row.score || 0) / totalScore) * 100 : 0;
            const weightedAllocation = (weightedPool * weightedSharePct) / 100;
            const allocation = equalPerRecipient + weightedAllocation;
            const sharePct = (allocation / parsedTokenPool) * 100;
            return {
                ...row,
                weightedSharePct,
                equalAllocation: equalPerRecipient,
                weightedAllocation,
                sharePct,
                allocation
            };
        });
    }, [data, minScore, recipientLimit, tokenPool, allocationMode, hybridEqualPct]);

    const onExportAllocations = () => {
        if (!allocationRows.length) return;
        const rows = [
            ['rank', 'wallet', 'score', 'share_pct', 'allocation'],
            ...allocationRows.map((row: any) => [row.rank, row.walletAddress, row.score, row.sharePct.toFixed(4), row.allocation.toFixed(6)])
        ];
        const csv = rows.map((r: any[]) => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `airdrop-allocation-${phase}.csv`;
        link.click();
    };

    if (!isAuthed) return null;

    return (
        <div className="space-y-8 pb-20">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <Link href="/admin" className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-accent-teal/50 transition-all group">
                        <ArrowLeft className="w-4 h-4 text-secondary group-hover:text-accent-teal" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white">Rewards Hub</h1>
                        <p className="text-xs text-secondary font-medium italic opacity-70">Airdrop eligibility and and allocation modeling.</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <select className="bg-surface border border-white/5 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none text-white" value={phase} onChange={e => setPhase(e.target.value)}>
                        {PHASE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <button onClick={load} className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-accent-teal transition-all">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricCard label="Eligible Wallets" value={data?.totalEligibleWallets || 0} icon={<Users className="w-4 h-4" />} trend="neutral" changeLabel="Current Window" />
                <MetricCard label="Top Score" value={data?.leaderboard?.[0]?.score || 0} icon={<Trophy className="w-4 h-4" />} trend="up" changeLabel={data?.leaderboard?.[0]?.walletAddress.slice(0, 8)} />
                <MetricCard label="Activity Depth" value={data?.leaderboard?.length || 0} icon={<TrendingUp className="w-4 h-4" />} trend="neutral" changeLabel="Ranked Entities" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Simulator Settings */}
                <Card variant="glass" className="bg-surface/30 border border-white/5">
                    <CardHeader>
                        <CardTitle className="text-xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                            <Calculator className="w-5 h-5 text-accent-teal" />
                            Allocation Simulator
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Token Pool</label>
                                <input className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-accent-teal outline-none" value={tokenPool} onChange={e => setTokenPool(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Distribution Mode</label>
                                <select className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white outline-none appearance-none" value={allocationMode} onChange={e => setAllocationMode(e.target.value)}>
                                    <option value="weighted">Score Weighted</option>
                                    <option value="hybrid">Hybrid Formula</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="text-[9px] font-black text-secondary uppercase tracking-widest opacity-50">Strategy Presets</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {STRATEGY_PRESETS.map(p => (
                                    <button 
                                        key={p.id} 
                                        onClick={() => { setAllocationMode(p.mode); setHybridEqualPct(p.equalPct); }}
                                        className={`py-2 rounded-lg border text-[9px] font-black uppercase tracking-tighter transition-all ${
                                            allocationMode === p.mode && hybridEqualPct === p.equalPct 
                                            ? 'bg-accent-teal border-accent-teal text-background shadow-glow-teal' 
                                            : 'border-white/5 text-secondary hover:text-white'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {allocationMode === 'hybrid' && (
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-secondary uppercase tracking-widest">Equal Split Pct ({hybridEqualPct}%)</label>
                                <input type="range" className="w-full accent-accent-teal" min="0" max="100" value={hybridEqualPct} onChange={e => setHybridEqualPct(Number(e.target.value))} />
                            </div>
                        )}

                        <div className="pt-6 border-t border-white/5 grid grid-cols-3 gap-4">
                            <div>
                                <div className="text-[9px] font-black text-secondary uppercase opacity-50">Recipients</div>
                                <div className="text-lg font-black italic text-white">{allocationRows.length}</div>
                            </div>
                            <div>
                                <div className="text-[9px] font-black text-secondary uppercase opacity-50">Avg / Wallet</div>
                                <div className="text-lg font-black italic text-accent-teal">
                                    {allocationRows.length ? (Number(tokenPool) / allocationRows.length).toFixed(1) : 0}
                                </div>
                            </div>
                            <button onClick={onExportAllocations} className="flex flex-col items-center justify-center gap-1 hover:text-accent-teal transition-colors group">
                                <FileSpreadsheet className="w-5 h-5 opacity-50 group-hover:opacity-100" />
                                <span className="text-[8px] font-black uppercase tracking-widest">Export CSV</span>
                            </button>
                        </div>
                    </CardContent>
                </Card>

                {/* Leaderboard Section */}
                <Card variant="glass" className="bg-surface/30 border border-white/5 overflow-hidden">
                    <CardHeader>
                        <CardTitle className="text-xl font-black uppercase italic tracking-tighter">Leaderboard</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <AssetTable 
                            columns={[
                                { header: "Rank", accessorKey: "rank", className: "w-12 font-black italic text-secondary" },
                                { header: "Identity", accessorKey: (item: any) => (
                                    <div className="font-mono text-[11px] text-white/80">{item.walletAddress.slice(0, 10)}...</div>
                                )},
                                { header: "Score", accessorKey: "score", className: "font-black text-accent-cyan" },
                                { header: "Share %", accessorKey: (item: any) => {
                                    const row = allocationRows.find((r: any) => r.walletAddress === item.walletAddress);
                                    return <span className="font-mono text-[11px] text-secondary">{row ? row.sharePct.toFixed(2) : '0.00'}%</span>
                                }, align: "right" }
                            ]}
                            data={data?.leaderboard || []}
                            loading={loading}
                        />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
