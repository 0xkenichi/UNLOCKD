"use client";

import React from "react";
import { motion } from "framer-motion";
import { Gift, Trophy, Users, Zap, Bug, MessageSquare, BookOpen } from "lucide-react";
import Link from "next/link";

export default function AirdropPage() {
  const stats = [
    { label: "Total Airdrop", value: "3%", sub: "Supply", icon: Gift },
    { label: "Testnet Allotment", value: "2%", sub: "Phase 1+2", icon: Zap },
    { label: "Bug Bounty", value: "0.5%", sub: "Critical", icon: Bug },
  ];

  const leaderboard = [
    { rank: 1, address: "0x74...e92a", points: "125,480", multiplier: "2.4x" },
    { rank: 2, address: "0x32...a11b", points: "98,200", multiplier: "1.8x" },
    { rank: 3, address: "0xf9...ccde", points: "85,600", multiplier: "1.8x" },
    { rank: 4, address: "0x11...44ff", points: "72,100", multiplier: "1.5x" },
    { rank: 5, address: "0x8a...3322", points: "68,450", multiplier: "1.2x" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-8 py-12">
      {/* Header */}
      <div className="mb-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent-teal to-accent-cyan shadow-[0_0_30px_rgba(46,190,181,0.3)] flex items-center justify-center mb-8"
        >
          <Gift size={32} className="text-background" />
        </motion.div>
        
        <h1 className="text-5xl font-black tracking-tighter uppercase mb-4 italic">Airdrop Program</h1>
        <p className="text-secondary text-lg max-w-2xl font-medium">
          Testnet participation is tracked on-chain. Early supporters, bug reporters, and protocol stress-testers are prioritized for the genesis distribution.
        </p>
      </div>

      {/* Allocation Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <stat.icon size={64} />
            </div>
            <div className="relative z-10">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-cyan mb-4 block">{stat.label}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-tighter text-foreground">{stat.value}</span>
                <span className="text-xs font-bold text-secondary">{stat.sub}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Qualification Logic */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/5 h-full">
            <h3 className="text-2xl font-black uppercase tracking-tighter mb-8 italic">Qualification Mechanics</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Connect & Onboard", points: "+50 pts", desc: "Complete initial wallet verification" },
                { label: "Borrow Action", points: "+200 pts", desc: "Execute a successful USDC loan" },
                { label: "Supply Liquidity", points: "+350 pts", desc: "Deposit assets into a supply pool" },
                { label: "Submit Feedback", points: "+150 pts", desc: "Report UI issues or improvements" },
              ].map((step, i) => (
                <div key={step.label} className="p-6 rounded-2xl bg-black/40 border border-white/5 hover:border-accent-teal/30 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-bold">{step.label}</span>
                    <span className="text-[10px] font-black text-accent-teal">{step.points}</span>
                  </div>
                  <p className="text-[10px] text-secondary/70 leading-relaxed uppercase tracking-widest">{step.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col sm:flex-row gap-4">
              <Link href="/feedback" className="flex-1">
                <button className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                  <MessageSquare size={14} /> Share Feedback
                </button>
              </Link>
              <Link href="/docs" className="flex-1">
                <button className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                  <BookOpen size={14} /> Read Docs
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Global Leaderboard */}
        <div className="p-10 rounded-[2.5rem] bg-accent-teal/5 border border-accent-teal/10 relative overflow-hidden h-full">
          <div className="absolute top-[-10%] left-[-10%] w-full h-[30%] bg-accent-teal/10 blur-[60px] rounded-full pointer-events-none" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black uppercase tracking-tighter italic">Leaderboard</h3>
              <div className="w-8 h-8 rounded-lg bg-accent-teal/20 flex items-center justify-center">
                <Trophy size={16} className="text-accent-teal" />
              </div>
            </div>

            <div className="space-y-4">
              {leaderboard.map((user) => (
                <div key={user.rank} className="flex items-center justify-between p-4 rounded-xl bg-black/40 border border-white/5">
                  <div className="flex items-center gap-4">
                    <span className={`text-sm font-black ${user.rank === 1 ? 'text-accent-teal' : 'text-secondary'}`}>#{user.rank}</span>
                    <div>
                      <span className="text-xs font-mono font-bold block text-foreground">{user.address}</span>
                      <span className="text-[9px] font-black uppercase text-secondary/60">{user.multiplier} Multiplier</span>
                    </div>
                  </div>
                  <span className="text-xs font-black text-accent-teal">{user.points}</span>
                </div>
              ))}
            </div>

            <button className="w-full mt-8 py-4 rounded-xl border border-accent-teal/30 text-[10px] font-black uppercase tracking-widest text-accent-teal hover:bg-accent-teal/5 transition-all">
              View All Rankings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
