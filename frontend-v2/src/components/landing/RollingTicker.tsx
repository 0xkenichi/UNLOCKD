"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "@/utils/api";

interface VestingFeedItem {
    symbol: string;
    amount: string;
    date: string;
    type: string;
    percentage: number;
}

export const RollingTicker = () => {
    const [feed, setFeed] = useState<VestingFeedItem[]>([]);

    useEffect(() => {
        const fetchFeed = async () => {
            try {
                const res = await api.fetchVestingFeed(10);
                if (res.success && res.data) {
                    setFeed(res.data);
                }
            } catch (err) {
                console.warn("Failed to fetch rolling ticker feed", err);
            }
        };

        fetchFeed();
        const interval = setInterval(fetchFeed, 30000); // Pulse every 30s
        return () => clearInterval(interval);
    }, []);

    // Fallback static data if feed is empty
    const displayItems = feed.length > 0 ? feed : [
        { symbol: "TAO", amount: "450k", date: "2026-04-12", type: "Validator", percentage: 2.5 },
        { symbol: "ARB", amount: "1.2M", date: "2026-03-24", type: "Core", percentage: 1.8 },
        { symbol: "OP", amount: "800k", date: "2026-03-28", type: "Foundation", percentage: 1.2 },
        { symbol: "TIA", amount: "300k", date: "2026-04-05", type: "Seed", percentage: 3.1 },
    ];

    return (
        <div className="w-full bg-black/40 border-y border-white/5 py-4 overflow-hidden relative group">
            {/* Gloss Sheen */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-[3s] pointer-events-none" />
            
            <motion.div 
                className="flex whitespace-nowrap min-w-max"
                animate={{ x: [0, -1000] }}
                transition={{ 
                    duration: 40, 
                    repeat: Infinity, 
                    ease: "linear" 
                }}
            >
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex gap-12 px-6">
                        {displayItems.map((item, idx) => (
                            <div key={`${i}-${idx}`} className="flex flex-col gap-1 border-r border-white/5 pr-12 last:border-0 pointer-events-none">
                                <div className="flex items-baseline gap-3">
                                    <span className="text-xl font-black font-display tracking-tighter text-foreground">{item.symbol}</span>
                                    <span className="text-xs font-mono font-bold text-accent-teal">
                                        {item.amount}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-secondary">Next Unlock: {new Date(item.date).toLocaleDateString()} ({item.type})</span>
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
