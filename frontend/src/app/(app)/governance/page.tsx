"use client";

import { 
  ShieldCheck, 
  Users, 
  Cpu, 
  LineChart, 
  Info,
  ArrowRight,
  Code,
  Zap
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { motion } from "framer-motion";

export default function GovernancePage() {
  return (
    <div className="space-y-12 pb-20">
      <header className="space-y-4">
        <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-[0.9] text-glow-teal">
          Protocol Governance
        </h1>
        <p className="text-secondary font-medium text-lg leading-relaxed max-w-2xl">
          Vestra is transitioning towards a decentralized, community-driven ecosystem. 
          Currently governed by the Genesis Team during initial security stabilization.
        </p>
      </header>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card variant="glass" className="p-8 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-accent-teal/10 flex items-center justify-center border border-accent-teal/20">
            <LineChart className="text-accent-teal" size={24} />
          </div>
          <h2 className="text-2xl font-black italic uppercase tracking-tight">Token Utility</h2>
          <p className="text-secondary text-sm leading-relaxed">
            The future Vestra native token will serve as the primary coordination mechanism for risk parameters, 
            collateral onboarding, and protocol revenue distribution. Token holders will influence the Engine's 
            sensitivity and LTV thresholds.
          </p>
        </Card>

        <Card variant="glass" className="p-8 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-accent-cyan/10 flex items-center justify-center border border-accent-cyan/20">
            <Zap className="text-accent-cyan" size={24} />
          </div>
          <h2 className="text-2xl font-black italic uppercase tracking-tight">VCS Utility</h2>
          <p className="text-secondary text-sm leading-relaxed">
            Vestra Credit Score (VCS) is the planned liquidity extension that will allow for high-efficiency borrowing 
            against deep-value vesting positions. 
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[10px] font-black uppercase tracking-widest">
            <Info size={12} />
            Status: Development Ongoing - VCS Not Yet Launched
          </div>
        </Card>
      </div>

      {/* Decision Making Section */}
      <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 lg:p-12 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="space-y-4 max-w-xl">
            <h2 className="text-3xl font-black italic uppercase tracking-tighter">Genesis Phase</h2>
            <p className="text-secondary font-medium">
              Until the TGE and full protocol maturation, all critical decisions regarding risk management, 
              security upgrades, and strategic partnerships are managed by the Vestra Genesis Team.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-12 h-12 rounded-full bg-surface border border-white/10 flex items-center justify-center">
                  <Users size={16} className="text-secondary" />
                </div>
              ))}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest text-secondary">Genesis Council</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-2">
            <h4 className="font-bold text-accent-teal">Risk Parameters</h4>
            <p className="text-[11px] text-secondary">Active monitoring of TVL and stream health.</p>
          </div>
          <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-2">
            <h4 className="font-bold text-accent-cyan">Security Audits</h4>
            <p className="text-[11px] text-secondary">Ongoing verification of V4 Smart Vaults.</p>
          </div>
          <div className="p-6 rounded-2xl bg-black/40 border border-white/5 space-y-2">
            <h4 className="font-bold text-white">Feature Roadmap</h4>
            <p className="text-[11px] text-secondary">Strategic deployment of VCS and ZK-Oracle.</p>
          </div>
        </div>
      </div>

      {/* Future Roadmap */}
      <div className="flex flex-col items-center text-center space-y-6 max-w-2xl mx-auto py-12">
        <div className="w-16 h-16 rounded-full bg-accent-teal/10 flex items-center justify-center border border-accent-teal/20">
          <Cpu className="text-accent-teal" size={32} />
        </div>
        <h3 className="text-3xl font-black italic uppercase tracking-tight">The Decentralization Threshold</h3>
        <p className="text-secondary">
          Upon reaching the Decentralization Threshold, Vestra will undergo a full organizational restructuring. 
          A formalized proposal framework will be introduced to the community, enabling any token holder 
          to participate in the protocol's evolution.
        </p>
        <button className="px-8 py-4 rounded-2xl bg-accent-teal text-background font-black uppercase tracking-tight hover:scale-105 transition-all shadow-[0_20px_40px_rgba(46,190,181,0.2)] flex items-center gap-3">
          Explore Roadmap <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
