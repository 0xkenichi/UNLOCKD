"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  Shield, 
  Fingerprint, 
  Globe, 
  UserCheck, 
  ExternalLink, 
  Activity, 
  Info,
  Lock
} from "lucide-react";
import { MatrixReveal } from "@/components/stealth/MatrixReveal";
import { useStealthMode } from "@/components/providers/stealth-provider";
import { useAccount } from "wagmi";
import { usePassportSnapshot } from "@/hooks/usePassportSnapshot";
import { generatePOAProof } from "@/utils/zkProof";
import Link from "next/link";
import { toast } from "react-hot-toast";

export default function IdentityPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { isStealthMode, toggleStealthMode } = useStealthMode();
  const { address, isConnected } = useAccount();
  const passport = usePassportSnapshot(address);
  
  const [isGeneratingZK, setIsGeneratingZK] = useState(false);

  const stats = useMemo(() => [
    { 
      label: "Vestra Credit Score", 
      value: isConnected ? (passport.compositeScore?.toString() || "0") : "000", 
      delta: "VCS Algorithm", 
      color: "accent-teal" 
    },
    { 
      label: "Risk Multiplier", 
      value: isConnected ? `${(passport.multiplier || 1.0).toFixed(2)}x` : "1.00x", 
      delta: (passport.multiplier || 1.0) < 1.0 ? "Market Risk Applied" : "No Unlock Risk", 
      color: (passport.multiplier || 1.0) < 1.0 ? "red-400" : "accent-cyan" 
    },
    { 
      label: "Trust Tier", 
      value: isConnected ? (passport.tierName || "Anonymous") : "Locked", 
      delta: isConnected ? "Verified Account" : "Connect Wallet", 
      color: passport.identityTier && passport.identityTier >= 4 ? "accent-teal" : passport.identityTier && passport.identityTier <= 1 ? "red-500" : "gray-400" 
    },
  ], [passport, isConnected]);

  const handleZKGeneration = async () => {
    if (!address) return;
    setIsGeneratingZK(true);
    try {
      await generatePOAProof(address, "secret", 1);
      toast.success("ZK-Proof Generated & Pinned");
    } finally {
      setIsGeneratingZK(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      {/* Header */}
      <div className="mb-16 relative overflow-hidden p-12 rounded-[2rem] bg-white/[0.02] border border-white/5">
        <div className="absolute top-[-20%] right-[-10%] w-[400px] h-[400px] bg-accent-teal/5 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-teal/10 border border-accent-teal/20 mb-6"
          >
            <Fingerprint size={12} className="text-accent-teal" />
            <span className="text-[10px] font-black uppercase tracking-widest text-accent-teal">Security Protocol IV-A</span>
          </motion.div>
          
          <h1 className="text-5xl font-black tracking-tighter uppercase mb-4 italic redaction-text">Global Identity</h1>
          <p className="text-secondary text-lg max-w-2xl font-medium redaction-text opacity-70">
            Link your wallet to see your Vestra Credit Score (VCS). Our multi-chain reputation engine analyzes Gitcoin Passport, transaction history, and liquidity behavior to unlock premium borrowing terms.
          </p>
        </div>
      </div>

      {/* Stats Table */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-8 rounded-3xl bg-white/[0.03] border border-white/5 group hover:border-accent-teal/30 transition-all"
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-secondary mb-4 block">{stat.label}</span>
            <div className="flex items-baseline gap-3">
              <MatrixReveal text={stat.value}>
                <span className={`text-4xl font-black tracking-tighter text-${stat.color}`}>{stat.value}</span>
              </MatrixReveal>
            </div>
            <span className="text-xs font-bold text-secondary/50 mt-2 block">{stat.delta}</span>
          </motion.div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Verification Status */}
        <div className="p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/5">
          <h3 className="text-2xl font-black uppercase tracking-tighter mb-8 italic">Verification Checklist</h3>
          
          <div className="space-y-6">
            {[
              { label: "Connect Primary Wallet (EVM)", status: isConnected ? "Completed" : "Pending", icon: UserCheck, completed: isConnected },
              { 
                label: "Gitcoin Passport Score", 
                status: isConnected ? (passport.loading ? "Loading..." : `${passport.score?.toFixed(1) || 0} Score`) : "0.0 Score", 
                icon: Globe, 
                completed: (passport.score || 0) > 0,
                link: "https://passport.gitcoin.co"
              },
              { label: "VCS On-Chain History", status: isConnected ? "Active" : "Pending", icon: Shield, completed: isConnected },
            ].map((item) => {
              const statusColor = item.completed ? 'text-accent-teal' : 'text-secondary/40';
              return (
                <div key={item.label} className="flex items-center justify-between p-6 rounded-2xl bg-black/40 border border-white/5 group hover:border-white/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.completed ? 'bg-accent-teal/10' : 'bg-white/5'}`}>
                      <item.icon size={20} className={item.completed ? 'text-accent-teal' : 'text-gray-500'} />
                    </div>
                    <div>
                      <span className="text-sm font-bold block">{item.label}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-secondary/60">{item.status}</span>
                    </div>
                  </div>
                  
                  {item.completed ? (
                    <div className="w-6 h-6 rounded-full bg-accent-teal/20 flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-accent-teal" />
                    </div>
                  ) : item.link ? (
                    <a 
                      href={item.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-[8px] font-black uppercase tracking-widest text-secondary hover:bg-white/10 transition-all"
                    >
                      Get Passport <ExternalLink size={10} />
                    </a>
                  ) : (
                    <div className={`text-[10px] font-black uppercase tracking-widest ${statusColor}`}>
                      Required
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button 
            className="w-full mt-10 py-5 rounded-2xl bg-accent-teal text-background font-black uppercase tracking-tight hover:scale-[1.02] transition-all shadow-[0_0_20px_rgba(46,190,181,0.2)] disabled:opacity-50"
            disabled={!isConnected || passport.loading}
          >
            {passport.loading ? 'Syncing...' : 'Sync Passport Data'}
          </button>
        </div>

        {/* Score Breakdown & Stealth */}
        <div className="space-y-8">
          <div className="p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/5">
            <h3 className="text-2xl font-black uppercase tracking-tighter mb-8 italic">VCS Breakdown</h3>
            
            <div className="space-y-8">
              {[
                { label: "Identity (Gitcoin)", score: passport.ias || 0, max: 500, icon: Fingerprint, color: "accent-teal" },
                { label: "Financial History", score: passport.fbs || 0, max: 500, icon: Activity, color: "accent-cyan" },
                { label: "On-Chain Behavior", score: passport.walletAgeBaseScore || 0, max: 200, icon: Shield, color: "accent-teal" },
              ].map((module) => (
                <div key={module.label} className="space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                      <module.icon size={12} className={`text-${module.color}`} />
                      <span className="text-white">{module.label}</span>
                    </div>
                    <span className={`text-${module.color}`}>{module.score} / {module.max}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(module.score / module.max) * 100}%` }}
                      className={`h-full bg-${module.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 p-6 rounded-2xl bg-accent-teal/5 border border-accent-teal/10 flex gap-4">
               <Info className="text-accent-teal shrink-0" size={18} />
               <p className="text-xs text-secondary font-medium leading-relaxed">
                 Sync Gitcoin Passport to improve your Vestra Credit Score and unlock premium borrowing rates.
               </p>
            </div>
          </div>

          {/* Institutional Stealth Mode */}
          <div className="p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/5 border-dashed border-accent-cyan/30">
             <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter italic">Stealth Protocol</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-accent-cyan mt-1">Institutional ZK-Proof (POA)</p>
                </div>
                <button 
                  onClick={toggleStealthMode}
                  className={`w-14 h-7 rounded-full p-1 transition-all ${isStealthMode ? 'bg-accent-cyan' : 'bg-white/10'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-background transition-all ${isStealthMode ? 'ml-7 shadow-[0_0_10px_rgba(46,190,181,0.5)]' : 'ml-0'}`} />
                </button>
             </div>
             
             <p className="text-xs text-secondary font-medium mb-8 leading-relaxed">
               Institutions can generate a Zero-Knowledge Proof of Assets to verify collateral without revealing the underlying wallet composition or history.
             </p>

             <button 
                onClick={handleZKGeneration}
                disabled={!isConnected || isGeneratingZK}
                className="w-full py-4 rounded-xl border border-accent-cyan/30 text-accent-cyan font-black uppercase text-[10px] tracking-widest hover:bg-accent-cyan/10 transition-all flex items-center justify-center gap-3"
             >
                <Lock className="w-4 h-4" />
                {isGeneratingZK ? "Generating Circuit..." : "Generate Institutional ZK-Attestation"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
