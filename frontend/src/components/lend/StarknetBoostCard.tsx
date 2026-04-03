'use client';

import { motion } from 'framer-motion';
import { Zap, ExternalLink, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/utils';

interface StarknetBoostCardProps {
  onBoost: () => void;
  className?: string;
}

export function StarknetBoostCard({ onBoost, className }: StarknetBoostCardProps) {
  return (
    <GlassCard className={cn(
      "relative overflow-hidden border-[#4EAF90]/30 bg-gradient-to-br from-[#4EAF90]/10 via-transparent to-[#0D0F0E]",
      className
    )}>
      {/* Dynamic Background Element */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#4EAF90]/20 rounded-full blur-[100px]" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 rounded-full blur-[100px]" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#4EAF90]/20 border border-[#4EAF90]/30">
              <Zap className="w-5 h-5 text-[#4EAF90]" />
            </div>
            <div>
              <h3 className="text-[#E8E6DF] font-medium text-lg redaction-text font-bold">Starknet Accelerator</h3>
              <p className="text-[#9C9A92] text-[10px] uppercase tracking-widest">Powered by Starkzap</p>
            </div>
          </div>
          <div className="group">
            <a 
              href="https://earn.starknet.io" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[#9C9A92] hover:text-[#E8E6DF] transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-[#E8E6DF] tracking-tighter">18.6%</span>
            <span className="text-[#4EAF90] font-medium">APY</span>
          </div>
          <p className="text-[#9C9A92] text-xs mt-2 leading-relaxed">
            Boost your USDC yield by bridging to Starknet. Built on Vesu lending markets with STRK ecosystem rewards.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[10px] text-[#9C9A92] uppercase mb-1">Base Yield</div>
            <div className="text-sm font-medium text-[#E8E6DF]">6.2% USDC</div>
          </div>
          <div className="p-3 rounded-xl bg-[#4EAF90]/10 border border-[#4EAF90]/20">
            <div className="text-[10px] text-[#4EAF90] uppercase mb-1">STRK Boost</div>
            <div className="text-sm font-medium text-[#4EAF90]">+12.4%</div>
          </div>
        </div>

        <div className="space-y-3 mb-8">
          <div className="flex items-center gap-2 text-[10px] text-[#9C9A92]">
            <ShieldCheck className="w-3 h-3 text-[#4EAF90]" />
            <span>Audited Vesu Core Strategies</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[#9C9A92]">
            <ShieldCheck className="w-3 h-3 text-[#4EAF90]" />
            <span>0.8% Vestra Facilitation Fee</span>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBoost}
          className="w-full py-4 rounded-xl bg-[#4EAF90] hover:bg-[#5DCAA5] text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#4EAF90]/20 transition-all font-black uppercase tracking-widest text-xs"
        >
          <span>Launch Accelerator</span>
          <ArrowUpRight className="w-4 h-4" />
        </motion.button>
      </div>
    </GlassCard>
  );
}
