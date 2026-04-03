'use client';

import { motion } from 'framer-motion';
import { Shield, Zap, Sparkles, ArrowUpRight, BarChart3, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/utils';

interface AaveBoostCardProps {
  onBoost: () => void;
  className?: string;
}

export function AaveBoostCard({ onBoost, className }: AaveBoostCardProps) {
  return (
    <GlassCard className={cn(
      "relative overflow-hidden border-purple-500/20 bg-gradient-to-br from-purple-900/10 via-transparent to-[#0D0F0E]",
      className
    )}>
      {/* Dynamic Background Element */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-[100px]" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/5 rounded-full blur-[100px]" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30">
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-[#E8E6DF] font-medium text-lg redaction-text font-bold">Aave Bluechip</h3>
              <p className="text-[#9C9A92] text-[10px] uppercase tracking-widest">Aave V3 Protocol</p>
            </div>
          </div>
          <div className="px-2 py-1 rounded bg-[#1D9E75]/10 border border-[#1D9E75]/20 text-[9px] text-[#1D9E75] font-black uppercase italic">
            Non-Custodial
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-[#E8E6DF] tracking-tighter">~5.2%</span>
            <span className="text-purple-400 font-medium">APY</span>
          </div>
          <p className="text-[#9C9A92] text-xs mt-2 leading-relaxed">
            Market-leading supply rates via Aave V3. Institutional-grade security with instant entry and withdrawal.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-[10px] text-[#9C9A92] uppercase">Liquidity</div>
              <div className="text-xs font-medium text-[#E8E6DF]">Instant</div>
            </div>
            <Zap className="w-3 h-3 text-amber-400" />
          </div>
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-[10px] text-[#9C9A92] uppercase">Safety Score</div>
              <div className="text-xs font-medium text-[#E8E6DF]">A+ (Aave)</div>
            </div>
            <BarChart3 className="w-3 h-3 text-[#1D9E75]" />
          </div>
        </div>

        <div className="space-y-3 mb-8">
          <div className="flex items-center gap-2 text-[10px] text-[#9C9A92]">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Multi-chain USDC support</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[#9C9A92]">
            <ShieldCheck className="w-3 h-3 text-purple-400" />
            <span>0.3% Vestra Facilitation Fee</span>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBoost}
          className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 transition-all font-black uppercase tracking-widest text-xs"
        >
          <span>Supply to Aave</span>
          <ArrowUpRight className="w-4 h-4" />
        </motion.button>
      </div>
    </GlassCard>
  );
}
