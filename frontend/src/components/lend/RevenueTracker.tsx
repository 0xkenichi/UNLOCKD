'use client';

import { motion } from 'framer-motion';
import { Target, TrendingUp, DollarSign, Wallet } from 'lucide-react';
import { cn, formatUsd } from '@/lib/utils';

// Mock data for demo
const REVENUE_CAP = 100000;
const CURRENT_REVENUE = 12450;
const TVL_GOAL = 1000000;
const CURRENT_VESTRA_TVL = 330450; // Mock current TVL

const AAVE_CONTRIB = 3200;
const STARKNET_CONTRIB = 5800;
const VESTRA_CONTRIB = 3450;

export function RevenueTracker() {
  const revPercentage = (CURRENT_REVENUE / REVENUE_CAP) * 100;
  const tvlPercentage = (CURRENT_VESTRA_TVL / TVL_GOAL) * 100;

  return (
    <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-sm">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-[#E8E6DF] text-sm font-medium tracking-tight">Vestra Protocol Growth</h3>
            <p className="text-[#9C9A92] text-[10px] uppercase tracking-widest font-bold">Revenue Target: $100k</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-emerald-400 font-mono tracking-tighter">{revPercentage.toFixed(1)}%</div>
          <div className="text-[9px] text-[#9C9A92] uppercase font-black italic">Rev Progress</div>
        </div>
      </div>

      {/* Main Progress Bar (Revenue) */}
      <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden mb-6">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${revPercentage}%` }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="absolute h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-amber-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
        />
      </div>

      {/* Mini Goal: $1M TVL (Mainnet Target) */}
      <div className="mb-8 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Wallet className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] uppercase font-bold text-amber-200 tracking-widest">Mainnet Mini-Goal: $1M TVL</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded-[4px] text-[8px] font-black bg-amber-500 text-black uppercase tracking-tighter">Production</span>
            <span className="text-[10px] font-mono text-amber-400/80">{formatUsd(CURRENT_VESTRA_TVL)} / $1M</span>
          </div>
        </div>
        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${tvlPercentage}%` }}
            transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
            className="h-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
          />
        </div>
      </div>

      {/* Pool Breakdown */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[9px] text-[#9C9A92]">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            <span className="uppercase tracking-tighter font-bold">Aave (0.3%)</span>
          </div>
          <div className="text-xs font-bold text-[#E8E6DF]">{formatUsd(AAVE_CONTRIB)}</div>
        </div>
        <div className="space-y-1 border-x border-white/5 px-4">
          <div className="flex items-center gap-1.5 text-[9px] text-[#9C9A92]">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4EAF90]" />
            <span className="uppercase tracking-tighter font-bold">Stark (0.8%)</span>
          </div>
          <div className="text-xs font-bold text-[#E8E6DF]">{formatUsd(STARKNET_CONTRIB)}</div>
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[9px] text-[#9C9A92]">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="uppercase tracking-tighter font-bold">Vestra (1.5%)</span>
          </div>
          <div className="text-xs font-bold text-[#E8E6DF]">{formatUsd(VESTRA_CONTRIB)}</div>
        </div>
      </div>

      {/* Target Logic Info */}
      <div className="mt-8 p-3 rounded-lg bg-white/5 border border-white/10 flex items-start gap-3">
        <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5" />
        <p className="text-[10px] text-[#9C9A92] leading-relaxed">
          Hitting the <span className="text-amber-400 font-bold">$1M TVL</span> mini-goal generates <span className="text-white font-medium">$15,000/year</span> in passive revenue. We need approximately <span className="text-emerald-400 font-bold">$8.4M</span> total TVL to secure the <span className="text-emerald-400 font-black">$100k</span> target.
        </p>
      </div>
    </div>
  );
}
