"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { motion } from 'framer-motion';

export const RepaySlider = () => {
    const [amount, setAmount] = useState(45);
    const [simulated, setSimulated] = useState(false);

    const handleSimulate = () => {
        setSimulated(true);
        setTimeout(() => setSimulated(false), 1500);
    };

    const releaseLabel = amount >= 100 ? 'Full collateral release' : amount >= 70 ? 'Mostly released' : 'Partial release';
    const seizeRisk = Math.max(0, 100 - amount);

    return (
        <Card variant="glass" className="border border-white/5 bg-surface/30 backdrop-blur-md shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle className="text-xl font-black uppercase italic tracking-tighter text-accent-teal">
                        Settlement Simulator
                    </CardTitle>
                    <p className="text-[10px] text-secondary font-medium italic opacity-50">
                        Demo-only preview of seize vs release paths.
                    </p>
                </div>
                <div className="px-2 py-0.5 rounded-full border border-accent-teal/30 text-[10px] font-black uppercase tracking-widest text-accent-teal">
                    Simulation
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black text-secondary tracking-widest">Repayment Target</span>
                        <span className="text-sm font-mono font-bold text-accent-teal">{amount}%</span>
                    </div>
                    
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent-teal"
                    />

                    <div className="relative h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                            className="absolute top-0 left-0 h-full bg-accent-teal shadow-glow-teal"
                            initial={{ width: 0 }}
                            animate={{ width: `${amount}%` }}
                            transition={{ type: "spring", stiffness: 100 }}
                        />
                    </div>

                    <div className="flex justify-between items-end">
                        <div className="space-y-0.5">
                            <div className="text-[10px] uppercase font-black text-secondary opacity-50">Outcome</div>
                            <div className="text-xs font-bold text-white">{releaseLabel}</div>
                        </div>
                        <div className="text-right space-y-0.5">
                            <div className="text-[10px] uppercase font-black text-secondary opacity-50">Settlement Risk</div>
                            <div className="text-xs font-bold text-accent-red">{seizeRisk}% Exposed</div>
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-4">
                    <p className="text-[10px] text-secondary italic opacity-50">
                        This tool is illustrative and does not execute on-chain repayments.
                    </p>
                    <button 
                        onClick={handleSimulate}
                        className="w-full py-3 rounded-xl bg-accent-teal/10 border border-accent-teal/30 hover:bg-accent-teal/20 text-accent-teal text-xs font-black uppercase tracking-widest transition-all"
                    >
                        {simulated ? 'Configuration Applied' : 'Simulate Strategy'}
                    </button>
                </div>
            </CardContent>
        </Card>
    );
};
