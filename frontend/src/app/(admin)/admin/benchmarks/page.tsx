'use client';

import { RevenueTracker } from '@/components/lend/RevenueTracker';
import { GlassCard } from '@/components/ui/GlassCard';
import { Target, TrendingUp, BarChart3 } from 'lucide-react';

export default function AdminBenchmarksPage() {
  return (
    <main className="min-h-screen bg-[#0D0F0E] px-4 py-12 max-w-7xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-display text-[#E8E6DF] font-medium redaction-text flex items-center gap-4">
          <BarChart3 className="w-10 h-10 text-emerald-400" />
          Protocol Benchmarks
        </h1>
        <p className="text-[#9C9A92] mt-2 text-sm max-w-md">
          Internal growth metrics, revenue targets, and KPI tracking for Vestra Protocol administrators.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="p-1 rounded-3xl bg-gradient-to-r from-emerald-500/20 via-amber-500/10 to-transparent">
            <RevenueTracker />
          </div>

          <GlassCard className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <Target className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl text-[#E8E6DF] font-medium uppercase tracking-widest">Growth Strategy</h2>
            </div>
            <div className="space-y-4 text-sm text-[#9C9A92] leading-relaxed">
              <p>
                Our current focus is reaching the <span className="text-white font-bold">$1M TVL</span> milestone on Mainnet. 
                This will trigger the first phase of the Vestra Rewards program.
              </p>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs uppercase font-bold tracking-tighter">Current Efficiency</span>
                  <span className="text-emerald-400 font-mono">94.2%</span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-[94.2%] bg-emerald-500" />
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="p-6 border-amber-500/20">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-[#E8E6DF] uppercase tracking-tighter">Revenue Forecast</h3>
            </div>
            <p className="text-xs text-[#9C9A92] mb-4">
              Estimated annual revenue based on current utilization and borrow rates.
            </p>
            <div className="text-3xl font-mono font-bold text-white mb-2">$152,400</div>
            <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">+12% vs last month</div>
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
