'use client';

import { motion } from 'framer-motion';
import { TrendingUp, Zap, ShieldCheck, ArrowUpRight, Coins, Archive } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/utils';

interface VestraBoostCardProps {
  onBoost: () => void;
  className?: string;
}

export function VestraBoostCard({ onBoost, className }: VestraBoostCardProps) {
  return (
    <GlassCard className={cn(
      "relative overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-900/20 via-[#0D0F0E] to-[#0D0F0E]",
      className
    )}>
      {/* Dynamic Background Element - Golden Glow */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/10 rounded-full blur-[120px]" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-yellow-500/5 rounded-full blur-[100px]" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30">
              <TrendingUp className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-[#E8E6DF] font-medium text-lg redaction-text font-bold uppercase tracking-wider">Vestra High-Yield</h3>
              <p className="text-amber-500/80 text-[10px] uppercase tracking-[0.2em] font-black">Native Accelerator</p>
            </div>
          </div>
          <div className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400 font-bold uppercase tracking-tighter">
            High Risk Tier
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-bold text-[#E8E6DF] tracking-tighter drop-shadow-[0_0_20px_rgba(245,158,11,0.4)]">~30.0%</span>
            <span className="text-amber-400 font-medium text-xl">APY</span>
          </div>
          <p className="text-[#9C9A92] text-xs mt-3 leading-relaxed max-w-[90%]">
            The exclusive engine for <span className="text-white font-medium">Vesting-Based Loans</span>. High returns generated from 45%+ borrow interest on illiquid collateral.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group hover:border-amber-500/30 transition-all">
            <div className="space-y-1">
              <div className="text-[10px] text-[#9C9A92] uppercase">Liquidity</div>
              <div className="text-xs font-medium text-[#E8E6DF]">Restricted</div>
            </div>
            <Archive className="w-4 h-4 text-amber-500/50 group-hover:text-amber-400 transition-colors" />
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between group hover:border-amber-500/30 transition-all">
            <div className="space-y-1">
              <div className="text-[10px] text-[#9C9A92] uppercase">Source</div>
              <div className="text-xs font-medium text-[#E8E6DF]">Direct Loans</div>
            </div>
            <Coins className="w-4 h-4 text-amber-500/50 group-hover:text-amber-400 transition-colors" />
          </div>
        </div>

        <div className="space-y-3 mb-8">
          <div className="flex items-center gap-2 text-[10px] text-[#9C9A92]">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Strict drawdown for vesting borrowers</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[#9C9A92]">
            <ShieldCheck className="w-3 h-3 text-amber-400" />
            <span>1.5% Vestra Performance Fee</span>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBoost}
          className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all font-black uppercase tracking-widest text-xs"
        >
          <span>Enter Accelerator</span>
          <ArrowUpRight className="w-4 h-4" />
        </motion.button>
      </div>
    </GlassCard>
  );
}
