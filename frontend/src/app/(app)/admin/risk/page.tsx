"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldAlert, 
  Users, 
  Plus, 
  Trash2, 
  Filter, 
  RefreshCw, 
  ArrowLeft,
  Search,
  Zap,
  ChevronDown,
  Loader2
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AssetTable } from "@/components/ui/AssetTable";
import { api } from "@/utils/api";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STORAGE_KEY = 'vestra_admin_session';

const FLAG_TYPES = [
    { id: 'insider', label: 'Insider / Founder' },
    { id: 'cohort_alert', label: 'Cohort Alert' },
    { id: 'manual_review', label: 'Manual Review' }
];

export default function AdminRiskPage() {
    const router = useRouter();
    const [isAuthed, setIsAuthed] = useState(false);
    const [tab, setTab] = useState('flags');
    
    // Flags State
    const [flags, setFlags] = useState<any[]>([]);
    const [loadingFlags, setLoadingFlags] = useState(false);
    const [filterWallet, setFilterWallet] = useState('');
    const [addWallet, setAddWallet] = useState('');
    const [addType, setAddType] = useState('insider');
    
    // Cohort State
    const [cohortBy, setCohortBy] = useState('borrower');
    const [cohortData, setCohortData] = useState<any>(null);
    const [loadingCohort, setLoadingCohort] = useState(false);

    useEffect(() => {
        if (sessionStorage.getItem(STORAGE_KEY) === '1') {
            setIsAuthed(true);
        } else {
            router.push('/admin');
        }
    }, [router]);

    const loadFlags = useCallback(async () => {
        setLoadingFlags(true);
        try {
            const data = await api.fetchAdminRiskFlags(filterWallet || undefined);
            setFlags(data || []);
        } catch (err: any) {
            toast.error("Failed to sync risk flags.");
        } finally {
            setLoadingFlags(false);
        }
    }, [filterWallet]);

    const loadCohort = useCallback(async () => {
        setLoadingCohort(true);
        try {
            const data = await api.fetchAdminRiskCohort(cohortBy);
            setCohortData(data);
        } catch (err: any) {
            toast.error("Cohort analysis failed.");
        } finally {
            setLoadingCohort(false);
        }
    }, [cohortBy]);

    useEffect(() => {
        if (isAuthed) {
            if (tab === 'flags') loadFlags();
            else loadCohort();
        }
    }, [tab, isAuthed, loadFlags, loadCohort]);

    const handleAddFlag = async () => {
        if (!addWallet.startsWith('0x')) return toast.error("Invalid address.");
        try {
            await api.createAdminRiskFlag({
                walletAddress: addWallet,
                flagType: addType,
                source: 'manual_v2'
            });
            setAddWallet('');
            loadFlags();
            toast.success("Risk flag deployed.");
        } catch (err: any) {
            toast.error("Flag deployment failed.");
        }
    };

    const handleDeleteFlag = async (id: string) => {
        try {
            await api.deleteAdminRiskFlag(id);
            loadFlags();
            toast.success("Flag retracted.");
        } catch (err: any) {
            toast.error("Deletion failed.");
        }
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
                        <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white">Risk Engine</h1>
                        <p className="text-xs text-secondary font-medium italic opacity-70">Monitor and mitigate protocol exposure.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 bg-surface/80 p-1.5 rounded-2xl border border-white/5 shadow-xl">
                    <button 
                        onClick={() => setTab('flags')}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            tab === 'flags' ? 'bg-accent-teal text-background shadow-glow-teal' : 'text-secondary hover:text-white'
                        }`}
                    >
                        Flags
                    </button>
                    <button 
                        onClick={() => setTab('cohort')}
                        className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                            tab === 'cohort' ? 'bg-accent-teal text-background shadow-glow-teal' : 'text-secondary hover:text-white'
                        }`}
                    >
                        Cohorts
                    </button>
                </div>
            </header>

            <main>
                <AnimatePresence mode="wait">
                    {tab === 'flags' ? (
                        <motion.div 
                            key="flags"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-8"
                        >
                            {/* Add Flag Card */}
                            <Card variant="glass" className="bg-accent-red/5 border-accent-red/20 shadow-2xl">
                                <CardHeader>
                                    <CardTitle className="text-lg font-black uppercase italic tracking-tighter text-accent-red flex items-center gap-2">
                                        <ShieldAlert className="w-5 h-5" />
                                        Deploy Risk Flag
                                    </CardTitle>
                                    <p className="text-[10px] text-accent-red/70 font-bold uppercase tracking-widest">Capping LTV for suspect entities</p>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-2 relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary opacity-30" />
                                            <input 
                                                className="w-full bg-surface border border-white/10 rounded-xl py-3 pl-12 pr-4 text-xs font-mono text-accent-red outline-none focus:border-accent-red/50"
                                                placeholder="0x... TARGET WALLET"
                                                value={addWallet}
                                                onChange={e => setAddWallet(e.target.value)}
                                            />
                                        </div>
                                        <div className="relative">
                                            <select 
                                                className="w-full bg-surface border border-white/10 rounded-xl py-3 px-4 text-[10px] font-black uppercase tracking-widest text-white outline-none appearance-none"
                                                value={addType}
                                                onChange={e => setAddType(e.target.value)}
                                            >
                                                {FLAG_TYPES.map(f => (
                                                    <option key={f.id} value={f.id}>{f.label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 text-secondary pointer-events-none" />
                                        </div>
                                        <button 
                                            onClick={handleAddFlag}
                                            className="bg-accent-red text-white font-black uppercase tracking-widest rounded-xl hover:bg-white hover:text-accent-red transition-all text-[10px] py-3 shadow-glow-red"
                                        >
                                            Deploy Intel
                                        </button>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Flags Table */}
                            <Card variant="glass" className="border border-white/5 bg-surface/30 shadow-3xl">
                                <CardHeader className="flex flex-row items-center justify-between">
                                    <CardTitle className="text-xl font-black uppercase italic tracking-tighter">Active Suppression</CardTitle>
                                    <button onClick={loadFlags} className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-accent-teal transition-all">
                                        {loadingFlags ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    </button>
                                </CardHeader>
                                <CardContent>
                                    <AssetTable 
                                        columns={[
                                            { header: "Wallet", accessorKey: "walletAddress", className: "font-mono text-[11px]" },
                                            { header: "Type", accessorKey: "flagType", className: "font-black uppercase tracking-widest text-[9px] text-accent-red" },
                                            { header: "Source", accessorKey: "source", className: "text-secondary font-medium" },
                                            { header: "Created", accessorKey: "createdAt", className: "font-mono text-[10px] opacity-50" },
                                            { 
                                                header: "Ops", 
                                                accessorKey: (item: any) => (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteFlag(item.id);
                                                        }}
                                                        className="p-2 rounded-lg hover:bg-accent-red/10 text-secondary hover:text-accent-red transition-all"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                ),
                                                align: "right"
                                            }
                                        ]}
                                        data={flags}
                                        loading={loadingFlags}
                                    />
                                </CardContent>
                            </Card>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="cohort"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-8"
                        >
                            <div className="flex gap-4">
                                <select 
                                    className="bg-surface border border-white/5 rounded-2xl px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white outline-none"
                                    value={cohortBy}
                                    onChange={e => setCohortBy(e.target.value)}
                                >
                                    <option value="borrower">Group by Borrower</option>
                                    <option value="token">Group by Token</option>
                                </select>
                                <button onClick={loadCohort} className="flex items-center gap-2 px-6 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:border-accent-teal transition-all">
                                    <RefreshCw className="w-3 h-3" /> Re-Analyze
                                </button>
                            </div>

                            {loadingCohort ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loader2 className="w-10 h-10 animate-spin text-accent-teal opacity-50" />
                                </div>
                            ) : cohortBy === 'borrower' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {(cohortData?.borrowers || []).map((b: any, i: number) => (
                                        <Card key={i} variant="glass" className="bg-surface/30 border border-white/5 hover:border-accent-teal/30 transition-all">
                                            <CardContent className="p-6">
                                                <div className="flex items-center gap-4 mb-4">
                                                    <div className="w-10 h-10 rounded-xl bg-accent-teal/10 flex items-center justify-center">
                                                        <Users className="w-5 h-5 text-accent-teal" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Identity</div>
                                                        <div className="text-xs font-mono font-bold text-white">{b.wallet.slice(0,8)}...{b.wallet.slice(-6)}</div>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <div className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Exposure</div>
                                                        <div className="text-2xl font-black italic tracking-tighter text-white">{b.loanCount} LOANS</div>
                                                    </div>
                                                    <div className="text-[10px] font-black uppercase tracking-widest text-accent-teal bg-accent-teal/10 px-2 py-0.5 rounded-full">
                                                        {b.loanCount > 5 ? 'High Heat' : 'Standard'}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                    {(cohortData?.byToken || []).map((t: any, i: number) => (
                                        <Card key={i} variant="glass" className="bg-surface/30 border border-white/5">
                                            <CardHeader>
                                                <CardTitle className="text-lg font-black uppercase italic tracking-tighter flex items-center gap-2">
                                                    <Zap className="w-4 h-4 text-accent-teal" />
                                                    Token Registry: {t.token.slice(0,10)}...
                                                </CardTitle>
                                                <p className="text-[10px] text-secondary font-black uppercase tracking-widest opacity-50">
                                                    {t.borrowers?.length || 0} unique borrowers detected
                                                </p>
                                            </CardHeader>
                                            <CardContent>
                                                <AssetTable 
                                                    columns={[
                                                        { header: "Wallet Address", accessorKey: "wallet", className: "font-mono text-[10px]" },
                                                        { header: "Positions", accessorKey: "loanCount", align: "right", className: "font-black" }
                                                    ]}
                                                    data={t.borrowers || []}
                                                />
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
