'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import { FastForward, Droplets, FlaskConical, History } from 'lucide-react';
import { motion } from 'framer-motion';

export const DemoCenter = () => {
    const { address } = useAccount();
    const [warpSeconds, setWarpSeconds] = useState(86400); // 1 day
    const [loading, setLoading] = useState(false);
    const [timeOffset, setTimeOffset] = useState(0);

    const handleWarp = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/faucet/warp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ seconds: warpSeconds })
            });
            const data = await res.json();
            if (data.ok) {
                setTimeOffset(data.currentOffset);
                toast.success(`Time warped by ${Math.floor(warpSeconds / 3600)} hours!`);
                // Trigger a refresh of the dashboard data
                window.dispatchEvent(new Event('refresh-portfolio'));
            }
        } catch (err) {
            toast.error('Failed to warp time');
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateMock = async () => {
        if (!address) return toast.error('Connect wallet first');
        setLoading(true);
        try {
            const res = await fetch('/api/faucet/generate-vesting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    wallet: address,
                    symbol: 'VESTRA',
                    amount: '50000'
                })
            });
            const data = await res.json();
            if (data.ok) {
                toast.success('Generated dummy vesting contract!');
                window.dispatchEvent(new Event('refresh-portfolio'));
            }
        } catch (err) {
            toast.error('Failed to generate mock vesting');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
        >
            <Card variant="glass" className="border border-white/5 bg-surface/30 backdrop-blur-md shadow-2xl">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-xl font-black uppercase italic tracking-tighter text-accent-teal flex items-center gap-2">
                        <FlaskConical className="w-5 h-5" />
                        Testnet Demo Center
                    </CardTitle>
                    <div className="px-2 py-0.5 rounded-full border border-accent-teal/30 text-[10px] font-black uppercase tracking-widest text-accent-teal">
                        Simulation Mode
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <label className="text-[10px] uppercase text-secondary font-black tracking-widest opacity-70">Fast-Track Time (Seconds)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    value={warpSeconds} 
                                    onChange={(e) => setWarpSeconds(Number(e.target.value))}
                                    className="flex-grow bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:border-accent-teal/50 outline-none transition-all"
                                />
                                <button 
                                    onClick={handleWarp} 
                                    disabled={loading}
                                    className="p-3 rounded-xl bg-accent-teal/20 border border-accent-teal/50 hover:bg-accent-teal/30 text-accent-teal transition-all disabled:opacity-50"
                                >
                                    <FastForward className="w-4 h-4" />
                                </button>
                            </div>
                            <p className="text-[10px] text-secondary font-medium italic opacity-50">Artificially advance protocol state clock.</p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] uppercase text-secondary font-black tracking-widest opacity-70">Sovereign Faucet</label>
                            <button 
                                onClick={handleGenerateMock}
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-accent-cyan/20 hover:bg-accent-cyan/10 text-accent-cyan text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                                <Droplets className="w-4 h-4" />
                                Mint Demo Vesting Position
                            </button>
                            <p className="text-[10px] text-secondary font-medium italic opacity-50">Generate a mirrored Sablier-style stream.</p>
                        </div>
                    </div>

                    {timeOffset > 0 && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-accent-teal/5 border border-accent-teal/20 rounded-xl p-3 flex items-center gap-3"
                        >
                            <History className="w-4 h-4 text-accent-teal" />
                            <span className="text-xs font-bold text-accent-teal">
                                Current Protocol Warp: +{Math.floor(timeOffset / 86400)}d {Math.floor((timeOffset % 86400) / 3600)}h
                            </span>
                        </motion.div>
                    )}
                </CardContent>
            </Card>
        </motion.div>
    );
};
