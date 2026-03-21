"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Zap, 
  Activity, 
  ArrowLeft,
  Calendar,
  Download,
  ShieldCheck,
  RotateCcw
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AssetTable } from "@/components/ui/AssetTable";
import { useStealthMode } from "@/components/providers/stealth-provider";
import { RepaySlider } from "@/components/repay/RepaySlider";
import { RepayActions } from "@/components/repay/RepayActions";
import { DebtClock } from "@/components/repay/DebtClock";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api";
import Link from "next/link";

import { Suspense } from "react";

function RepayContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isStealthMode } = useStealthMode();
    const loanIdPrefill = searchParams.get('loanId') || '';

    const { data: schedule, isLoading: scheduleLoading, refetch } = useQuery({
        queryKey: ['repaySchedule'],
        queryFn: () => api.fetchRepaySchedule()
    });

    const handleDownload = () => {
        window.open('/api/exports/repay-schedule', '_blank');
    };

    return (
        <div className={`space-y-8 pb-20 relative min-h-screen ${isStealthMode ? 'stealth-grid' : ''}`}>
            {isStealthMode && <div className="noise-overlay" />}

            <motion.header 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10"
            >
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <Link href="/dashboard" className="p-2 rounded-xl bg-surface/50 border border-white/5 hover:border-accent-teal/50 transition-all group">
                            <ArrowLeft className="w-4 h-4 text-secondary group-hover:text-accent-teal" />
                        </Link>
                        <h1 className="text-5xl font-black tracking-tighter uppercase italic text-glow-teal redaction-text">Settlement</h1>
                    </div>
                    <p className="text-secondary font-medium redaction-text opacity-70 ml-12">Manage and reduce your protocol obligations.</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 rounded-full bg-surface/80 backdrop-blur-md border border-white/5 flex items-center gap-3 text-xs shadow-xl">
                        <span className={`w-2.5 h-2.5 rounded-full ${isStealthMode ? 'bg-accent-cyan animate-pulse shadow-[0_0_10px_rgba(46,190,181,0.5)]' : 'bg-accent-teal'}`} />
                        <span className="text-secondary font-black uppercase tracking-widest text-[10px]">
                            {isStealthMode ? 'Privacy Active' : 'Public Ledger Mode'}
                        </span>
                    </div>
                </div>
            </motion.header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Simulator and Clock */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <DebtClock />
                        </motion.div>
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <RepaySlider />
                        </motion.div>
                    </div>

                    {/* Actions */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <RepayActions initialLoanId={loanIdPrefill} isStealthMode={isStealthMode} />
                    </motion.div>

                    {/* Schedule Table */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <Card variant="glass" className="border border-white/5 shadow-2xl">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <div>
                                    <CardTitle className="text-2xl font-black uppercase italic tracking-tighter">Repayment Schedule</CardTitle>
                                    <p className="text-xs text-secondary mt-1 font-medium">Timeline of upcoming contract settlements.</p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => refetch()}
                                        className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-accent-teal/50 text-secondary hover:text-accent-teal transition-all"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={handleDownload}
                                        className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-accent-teal/50 text-secondary hover:text-accent-teal transition-all"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <AssetTable
                                    columns={[
                                        { header: "Loan ID", accessorKey: "loanId", className: "font-mono" },
                                        { header: "Due Date", accessorKey: "unlockDate", className: "font-mono" },
                                        { header: "Principal", accessorKey: "principal", align: "right", className: "font-mono" },
                                        { header: "Status", accessorKey: "status", align: "right", className: "font-black uppercase tracking-widest text-[10px]" }
                                    ]}
                                    data={schedule?.items || []}
                                    loading={scheduleLoading}
                                />
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Sidebar/Guides */}
                <div className="space-y-8">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 }}
                    >
                        <Card variant="solid" className="border border-white/5 bg-accent-teal/5">
                            <CardHeader>
                                <CardTitle className="text-lg font-black uppercase italic tracking-tighter text-accent-teal">Strategy Guide</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-white/10 shrink-0">
                                        <Calendar className="w-4 h-4 text-accent-teal" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold">Monitor Deadlock</div>
                                        <p className="text-[10px] text-secondary leading-relaxed">Review due timelines to prevent automatic collateral liquidation.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-white/10 shrink-0">
                                        <Activity className="w-4 h-4 text-accent-cyan" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold">Early Settlement</div>
                                        <p className="text-[10px] text-secondary leading-relaxed">Repay early to improve your Protocol Credit Score and unlock higher LTVs.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center border border-white/10 shrink-0">
                                        <ShieldCheck className="w-4 h-4 text-accent-cyan" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold">Privacy Layer</div>
                                        <p className="text-[10px] text-secondary leading-relaxed">Use Stealth Mode to mask repayment amounts and collateral origins.</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.7 }}
                    >
                        <Card variant="glass" className="border border-white/5">
                            <CardHeader>
                                <CardTitle className="text-lg font-black uppercase italic tracking-tighter">Treasury Ops</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-[10px] text-secondary leading-relaxed mb-4 italic">
                                    Download your historical repayment schedule for institutional compliance and tax reporting.
                                </p>
                                <button 
                                    onClick={handleDownload}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-secondary text-xs font-black uppercase tracking-widest transition-all"
                                >
                                    <Download className="w-4 h-4" />
                                    Export CSV Report
                                </button>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}

export default function RepayPage() {
    return (
        <Suspense fallback={<div className="p-12 text-center redaction-text">Loading settlement layer...</div>}>
            <RepayContent />
        </Suspense>
    );
}
