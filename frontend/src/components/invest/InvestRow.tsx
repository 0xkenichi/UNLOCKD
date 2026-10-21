'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ZoomHoverCard } from './ZoomHoverCard';
import { ChevronRight, Shield, AlertCircle } from 'lucide-react';

interface InvestRowProps {
  name: string;
  description: string;
  /** Estimated variable supply APY, already formatted (e.g. "4.12%"). */
  apy: string;
  /** Pool assets, formatted. */
  aum: string;
  /** Deposit cap, formatted, or undefined when uncapped. */
  maxCap?: string;
  /** 0–100 progress toward the cap (or utilization when uncapped). */
  progress: number;
  progressLabel: string;
  withdrawal: string;
  href: string;
}

const COLOR = '#3b82f6';

export function InvestRow({
  name,
  description,
  apy,
  aum,
  maxCap,
  progress,
  progressLabel,
  withdrawal,
  href,
}: InvestRowProps) {
  return (
    <ZoomHoverCard>
      <div className="group relative flex flex-col md:flex-row items-center gap-6 p-6 rounded-2xl border transition-all duration-500 bg-white/[0.03] border-white/5 hover:border-white/20">
        {/* Left Section: Icon & Identity */}
        <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden"
            style={{ background: `${COLOR}20`, boxShadow: `0 0 20px ${COLOR}30`, border: `1px solid ${COLOR}40` }}
          >
            <Shield style={{ color: COLOR }} size={28} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-bold truncate text-white">{name}</h3>
              <span
                className="text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold tracking-widest flex-shrink-0"
                style={{ color: COLOR, borderColor: `${COLOR}40`, background: `${COLOR}10` }}
              >
                ERC-4626
              </span>
            </div>
            <p className="text-sm text-white/40 mt-1">{description}</p>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-white/25 uppercase tracking-tighter">
              <span className="flex items-center gap-1"><AlertCircle size={10} /> Withdrawal: {withdrawal}</span>
            </div>
          </div>
        </div>

        {/* Middle Section: Metrics */}
        <div className="flex items-center gap-8 md:gap-12 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-white/5">
          <div className="flex flex-col items-center md:items-end min-w-[100px]">
            <div className="text-3xl font-bold tracking-tighter text-white">{apy}</div>
            <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold">Est. APY · variable</div>
          </div>

          <div className="flex flex-col gap-2 w-full md:w-56">
            <div className="flex justify-between text-[11px] font-medium">
              <span className="text-white/40">{progressLabel}</span>
              <span className="text-white/80 font-mono">{maxCap ? `${aum} / ${maxCap}` : aum}</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                viewport={{ once: true }}
                className="h-full rounded-full relative"
                style={{ background: COLOR }}
              />
            </div>
          </div>
        </div>

        {/* Right Section: Action */}
        <Link
          href={href}
          className="w-full md:w-auto px-8 py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 group-hover:gap-4 bg-white/10 text-white hover:bg-white/20"
        >
          <span className="uppercase tracking-widest">Deposit</span>
          <ChevronRight size={18} />
        </Link>
      </div>
    </ZoomHoverCard>
  );
}
