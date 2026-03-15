"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const ASSETS = [
    { symbol: "ARB", price: 1.15, ltv: "45% DPV", color: "#2EBEB5" },
    { symbol: "OP", price: 2.40, ltv: "42% DPV", color: "#40E0FF" },
    { symbol: "TIA", price: 12.50, ltv: "38% DPV", color: "#8B5CF6" },
    { symbol: "PYTH", price: 0.65, ltv: "48% DPV", color: "#2EBEB5" },
    { symbol: "JUP", price: 0.92, ltv: "50% DPV", color: "#40E0FF" },
    { symbol: "STRK", price: 1.41, ltv: "40% DPV", color: "#FF4D4D" },
];

export const RollingTicker = () => {
    const [prices, setPrices] = useState(ASSETS);

    useEffect(() => {
        const interval = setInterval(() => {
            setPrices(prev => prev.map(asset => ({
                ...asset,
                price: asset.price + (Math.random() - 0.5) * 0.02
            })));
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full bg-black/40 border-y border-white/5 py-4 overflow-hidden relative group">
            {/* Gloss Sheen */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[3s] pointer-events-none" />
            
            <motion.div 
                className="flex whitespace-nowrap min-w-max"
                animate={{ x: [0, -1000] }}
                transition={{ 
                    duration: 30, 
                    repeat: Infinity, 
                    ease: "linear" 
                }}
            >
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex gap-12 px-6">
                        {prices.map((asset) => (
                            <div key={`${i}-${asset.symbol}`} className="flex flex-col gap-1 border-r border-white/5 pr-12 last:border-0 pointer-events-none">
                                <div className="flex items-baseline gap-3">
                                    <span className="text-xl font-black font-display tracking-tighter text-foreground">{asset.symbol}</span>
                                    <span className="text-xs font-mono font-bold" style={{ color: asset.color }}>
                                        ${asset.price.toFixed(3)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-secondary">Max LTV: {asset.ltv}</span>
                                    <span className="w-1 h-1 rounded-full bg-accent-teal/50 animate-pulse" />
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
            </motion.div>
        </div>
    );
};
