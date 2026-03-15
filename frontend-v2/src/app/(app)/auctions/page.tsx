"use client";

import { motion } from "framer-motion";
import { 
  Lock, 
  Gavel, 
  ShieldAlert, 
  Zap, 
  ArrowRight,
  Sparkles,
  BarChart3,
  Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";

export default function AuctionsPage() {
  return (
    <div className="space-y-12 pb-20 max-w-5xl">
      <header>
        <div className="flex items-center gap-2 text-risk-high mb-4">
          <span className="w-8 h-[1px] bg-risk-high/40" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Protocol Phase III</span>
        </div>
        <h1 className="text-5xl font-black font-display text-glow-cyan mb-6">LIQUIDATION AUCTIONS</h1>
        <p className="text-secondary text-lg leading-relaxed max-w-2xl">
          Deep liquidity for distressed vesting debt. Automated recovery rails for protocol solvency. 
          Currently undergoing security auditing for mainnet release.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: Gavel, label: "Dutch Auctions", desc: "Descending price discovery for non-custodial debt recovery." },
          { icon: ShieldAlert, label: "Quarantine", desc: "Privileged OTC buyback windows for protocol stakeholders." },
          { icon: BarChart3, label: "Market Depth", desc: "Institutional-grade interfaces for distressed asset trading." },
        ].map((item, i) => (
          <Card key={i} variant="glass" className="p-8 group hover:border-accent-cyan/30 transition-all duration-500">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500">
              <item.icon className="w-6 h-6 text-accent-cyan" />
            </div>
            <h4 className="text-sm font-black text-foreground mb-2 uppercase">{item.label}</h4>
            <p className="text-[11px] text-secondary leading-relaxed font-medium">{item.desc}</p>
          </Card>
        ))}
      </div>

      <div className="relative">
        {/* Placeholder / Coming Soon UI */}
        <div className="absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[8px] bg-black/40 rounded-[32px] border border-white/5">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center p-12 bg-surface-soft border border-white/10 rounded-[40px] shadow-2xl max-w-md mx-auto"
            >
                <div className="w-20 h-20 rounded-full bg-accent-cyan/10 flex items-center justify-center mx-auto mb-8 animate-pulse">
                    <Lock className="w-10 h-10 text-accent-cyan" />
                </div>
                <h2 className="text-2xl font-black font-display text-foreground mb-4 items-center gap-2 flex justify-center">
                    <Sparkles className="w-6 h-6 text-accent-teal" />
                    BETA ACCESS ONLY
                </h2>
                <p className="text-secondary text-sm font-medium mb-8 leading-relaxed">
                    The liquidation engine is currently in a closed beta on Sepolia. 
                    Whitelisted participants only. Request access via the Governance portal.
                </p>
                <div className="flex flex-col gap-3">
                    <button className="w-full py-4 rounded-2xl bg-gradient-to-tr from-accent-cyan to-accent-teal text-background font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(64,224,255,0.2)] hover:scale-105 transition-all">
                        Request Whitelist
                    </button>
                    <button className="w-full py-4 rounded-2xl border border-white/5 text-secondary font-bold text-xs uppercase tracking-widest hover:bg-white/5 transition-all">
                        Read Technical Specs
                    </button>
                </div>
            </motion.div>
        </div>

        {/* Blurred Background Content (Simulating a real page) */}
        <div className="opacity-20 pointer-events-none select-none">
            <div className="bg-surface-soft p-10 rounded-[32px] border border-white/5 space-y-10">
                <div className="flex justify-between items-center border-b border-white/5 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-lg bg-white/5" />
                        <div>
                            <div className="h-4 w-32 bg-white/10 rounded mb-2" />
                            <div className="h-3 w-16 bg-white/5 rounded" />
                        </div>
                    </div>
                    <div className="h-10 w-24 bg-white/10 rounded-xl" />
                </div>
                <div className="grid grid-cols-4 gap-4">
                    {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl" />)}
                </div>
                <div className="space-y-4">
                    {[1,2,3].map(i => (
                        <div key={i} className="h-16 w-full bg-white/[0.02] border border-white/5 rounded-xl" />
                    ))}
                </div>
            </div>
        </div>
      </div>

      <footer className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <Card variant="glass" className="p-8 flex items-start gap-6">
            <div className="w-12 h-12 rounded-full bg-accent-teal/10 flex items-center justify-center shrink-0">
                <Clock className="w-6 h-6 text-accent-teal" />
            </div>
            <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-foreground mb-2">Internal Testing</h4>
                <p className="text-[11px] text-secondary leading-relaxed font-medium">
                    Automated liquidations are running on Testnet v2.4a. 
                    Security audits by Vestra Shield begin Q3 2026.
                </p>
            </div>
         </Card>
         <Card variant="glass" className="p-8 flex items-start gap-6">
            <div className="w-12 h-12 rounded-full bg-accent-cyan/10 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6 text-accent-cyan" />
            </div>
            <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-foreground mb-2">Protocol Revenue</h4>
                <p className="text-[11px] text-secondary leading-relaxed font-medium">
                    10% of liquidation penalties are redirected to the Vestra Treasury. 
                    Read more in the Tokenomics doc.
                </p>
            </div>
         </Card>
      </footer>
    </div>
  );
}
