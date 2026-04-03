'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { InvestRow } from '@/components/invest/InvestRow';
import { TitanMembership } from '@/components/invest/TitanMembership';
import { RevenueTracker } from '@/components/lend/RevenueTracker';
import { GlassCard } from '@/components/ui/GlassCard';
import { LayoutGrid, Sparkles, Filter, PieChart, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const VAULTS = [
  {
    id: 'usd-star-stable',
    name: 'USD* High Utility',
    description: 'Blue-chip vesting collateral from verified protocols (TAO, BIT). Fixed yield.',
    apy: '11.20%',
    aum: '$1.12M',
    maxCap: '$25M',
    withdrawal: 'Instant',
    type: 'STANDARD' as const,
    riskLevel: 'LOW' as const,
  },
  {
    id: 'usd-star-junior',
    name: 'USD* Junior Tranche',
    description: 'First-loss absorption pool. First layer to cover defaults/shortfalls.',
    apy: '27.26%',
    aum: '$330.45K',
    maxCap: '$5M',
    withdrawal: '7-day cooldown (0.5%)',
    type: 'JUNIOR' as const,
    riskLevel: 'HIGH' as const,
  },
  {
    id: 'usd-star-protected',
    name: 'USD* Protected (LP)',
    description: 'Senior-most tranche with secondary insurance from protocol reserve.',
    apy: '6.45%',
    aum: '$373.37K',
    maxCap: '$1M',
    withdrawal: 'Instant',
    type: 'PROTECTED' as const,
    riskLevel: 'MINIMAL' as const,
  },
  {
    id: 'high-risk-alpha',
    name: 'Risk Engine Alpha',
    description: 'Emerging projects with dynamic LTV. First to absorb auction shortfalls.',
    apy: '38.10%',
    aum: '$840.12K',
    maxCap: '$2M',
    withdrawal: 'T+3 (1.5% fee)',
    type: 'STRATEGY' as const,
    riskLevel: 'MAX' as const,
  }
];

export default function InvestPage() {
  const [isTitanMode, setIsTitanMode] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'STABLE' | 'RISK'>('ALL');
  const [allocation, setAllocation] = useState(50);

  const handleToggleTitan = () => {
    setIsTitanMode(!isTitanMode);
    if (!isTitanMode && !isVerified) {
      toast('Titan Mode: Restricted Access', {
        icon: '🛡️',
        style: {
          borderRadius: '10px',
          background: '#1e1b4b',
          color: '#fff',
          border: '1px solid #4f46e5'
        },
      });
    }
  };

  const handleVerify = () => {
    setIsVerified(true);
    toast.success('Titan Tier Verified: $450k Allocation Found');
  };

  const filteredVaults = useMemo(() => {
    if (filter === 'ALL') return VAULTS;
    if (filter === 'STABLE') return VAULTS.filter(v => v.riskLevel === 'LOW' || v.riskLevel === 'MINIMAL');
    return VAULTS.filter(v => v.riskLevel === 'HIGH' || v.riskLevel === 'MAX');
  }, [filter]);

  const seniorApy = 9.90;
  const juniorApy = 27.26;
  const combinedApy = (seniorApy * (100 - allocation) / 100) + (juniorApy * allocation / 100);

  return (
    <main className={cn(
      "min-h-screen transition-colors duration-1000 px-4 py-12 pb-24",
      isTitanMode ? "bg-[#09090b] selection:bg-purple-500/30" : "bg-[#020617] selection:bg-blue-500/30"
    )}>
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start lg:items-center gap-6 mb-12">
          <div className="flex-1 space-y-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className={cn(
                  "text-4xl font-bold tracking-tight font-display transition-all duration-500",
                  isTitanMode ? "text-purple-100 font-mono stealth-glitch" : "text-white"
                )} data-text={isTitanMode ? "TITAN TRANCHES" : "INVEST"}>
                  {isTitanMode ? 'TITAN TRANCHES' : 'Invest'}
                </h1>
                {isTitanMode && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500 text-white uppercase animate-pulse">
                    Titan Verified
                  </span>
                )}
              </div>
              <p className="text-white/40 text-sm max-w-md">
                {isTitanMode 
                  ? 'High-risk tranches prioritized for loss absorption. First layers to cover default events.' 
                  : 'Choose between liquid variable yield, stable pools, or higher-risk junior tranches.'}
              </p>
            </div>

            {/* Mode Toggle Control */}
            <div className="flex items-center w-fit gap-2 p-1 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-xl">
              <button
                onClick={() => setIsTitanMode(false)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  !isTitanMode ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white/60"
                )}
              >
                <LayoutGrid size={14} />
                Standard
              </button>
              <button
                onClick={handleToggleTitan}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  isTitanMode ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30" : "text-white/40 hover:text-white/60"
                )}
              >
                <Sparkles size={14} />
                Titan
              </button>
            </div>
          </div>

          <div className="w-full md:w-[400px]">
            <RevenueTracker />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {!isTitanMode ? (
            <motion.div
              key="standard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Yield Estimator Panel */}
              <GlassCard className="border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent">
                <div className="flex flex-col lg:flex-row gap-12 p-2">
                  <div className="flex-1 space-y-6">
                    <div className="flex justify-between items-end">
                      <div className="flex gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                          <PieChart className="text-blue-500" size={24} />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-white mb-1">Portfolio Simulator</h2>
                          <p className="text-white/40 text-sm">Balanced Senior vs Junior allocation</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-blue-500">~{combinedApy.toFixed(2)}% APY</div>
                        <div className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Projected Net Result</div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <input 
                        type="range"
                        min="0"
                        max="100"
                        value={allocation}
                        onChange={(e) => setAllocation(Number(e.target.value))}
                        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <div className="flex justify-between text-xs uppercase tracking-tighter">
                        <div className={cn("transition-colors", allocation < 50 ? "text-blue-400" : "text-white/40")}>
                          <span className="block text-xl font-bold font-mono">{(100 - allocation)}%</span>
                          Standard Yield
                        </div>
                        <div className={cn("text-right transition-colors", allocation >= 50 ? "text-pink-400" : "text-white/40")}>
                          <span className="block text-xl font-bold font-mono">{allocation}%</span>
                          Junior Tranche
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full lg:w-72 p-6 rounded-2xl bg-white/[0.03] border border-white/5 flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-6">
                      <div className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Risk Summary</div>
                      <ShieldCheck className="text-blue-500/40" size={16} />
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Senior Security</span>
                        <span className="text-white font-mono text-xs">Tier 1 Coverage</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/50">Junior Exposure</span>
                        <span className="text-pink-500/80 font-mono text-xs">First-Loss Buffering</span>
                      </div>
                      <div className="pt-4 border-t border-white/5 text-center">
                        <button className="text-[10px] font-bold text-blue-500/80 hover:text-blue-400 uppercase tracking-widest transition-colors flex items-center justify-center gap-2 mx-auto">
                          View Loss Tranche Details
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Filtering Controls */}
              <div className="flex justify-between items-center px-2">
                <div className="flex gap-2">
                  <button 
                    onClick={() => setFilter('ALL')}
                    className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all border", filter === 'ALL' ? "bg-white/10 border-white/20 text-white" : "border-transparent text-white/40 hover:text-white/60")}
                  >
                    All Vaults
                  </button>
                  <button 
                    onClick={() => setFilter('STABLE')}
                    className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all border", filter === 'STABLE' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" : "border-transparent text-white/40 hover:text-white/60")}
                  >
                    Stable
                  </button>
                  <button 
                    onClick={() => setFilter('RISK')}
                    className={cn("px-4 py-2 rounded-lg text-xs font-bold transition-all border", filter === 'RISK' ? "bg-pink-500/10 border-pink-500/20 text-pink-400" : "border-transparent text-white/40 hover:text-white/60")}
                  >
                    High Risk
                  </button>
                </div>
                <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest flex items-center gap-2">
                  <Filter size={12} /> Showing {filteredVaults.length} Active tranches
                </div>
              </div>

              {/* Vault List */}
              <div className="grid grid-cols-1 gap-6">
                {filteredVaults.map((vault) => (
                  <InvestRow key={vault.id} {...vault} />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="titan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <TitanMembership 
                isVerified={isVerified}
                onVerify={handleVerify}
                onApply={() => toast('Direct Application Required', { icon: '🔑' })}
                vaults={VAULTS.filter(v => v.riskLevel === 'HIGH' || v.riskLevel === 'MAX')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        .stealth-glitch { position: relative; }
        .stealth-glitch::before, .stealth-glitch::after {
          content: attr(data-text);
          position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          opacity: 0.8; pointer-events: none;
        }
        .stealth-glitch::before { color: #0ff; z-index: -1; animation: glitch-left 3s infinite linear alternate-reverse; }
        .stealth-glitch::after { color: #f0f; z-index: -2; animation: glitch-right 3s infinite linear alternate-reverse; }
        @keyframes glitch-left { 0% { transform: translate(0); } 20% { transform: translate(-2px, 1px); } 40% { transform: translate(-1px, -1px); } 60% { transform: translate(1px, 2px); } 80% { transform: translate(2px, -1px); } 100% { transform: translate(0); } }
        @keyframes glitch-right { 0% { transform: translate(0); } 20% { transform: translate(2px, -1px); } 40% { transform: translate(1px, 1px); } 60% { transform: translate(-1px, -2px); } 80% { transform: translate(-2px, 1px); } 100% { transform: translate(0); } }
      `}</style>
    </main>
  );
}
