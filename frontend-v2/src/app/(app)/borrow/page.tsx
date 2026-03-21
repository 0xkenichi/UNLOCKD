"use client";

import { useMemo, useState } from "react";
import { 
  Plus, 
  TrendingUp, 
  ShieldCheck, 
  Activity, 
  ArrowUpRight,
  DollarSign,
  PieChart as PieChartIcon,
  Fingerprint,
  Zap,
  Calculator,
  Lock,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Info,
  ShieldAlert
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { AssetTable } from "@/components/ui/AssetTable";
import { ComingSoon } from "@/components/ui/ComingSoon";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { useAccount, useChainId } from "wagmi";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { ZKShield } from "@/components/stealth/ZKShield";
import { toast } from "react-hot-toast";
import { DebtClock } from "@/components/borrow/DebtClock";

export default function Borrow() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState(1);
  const [selectedCollateral, setSelectedCollateral] = useState<any>(null);
  const [borrowAmount, setBorrowAmount] = useState("");
  const [simulationData, setSimulationData] = useState<any>(null);
  const [stealthEnabled, setStealthEnabled] = useState(false);

  // Fetch broader portfolio for discovery
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => api.fetchPortfolio(address!),
    enabled: !!address
  });

  // Fetch active loans for the Debt Clock
  const { data: loansData, refetch: refetchLoans } = useQuery({
    queryKey: ['loans', address],
    queryFn: () => api.fetchLoans(address!),
    enabled: !!address
  });

  const activeLoan = useMemo(() => {
    const loan = loansData?.items?.find((l: any) => l.status === 'active' || l.status === 'pending');
    if (loan && (!loan.created_at || !loan.duration_days)) return null;
    return loan;
  }, [loansData]);

  const collateralOptions = useMemo(() => {
    const vested = portfolio?.assets?.vested || [];
    const locked = portfolio?.assets?.locked || [];
    const staked = portfolio?.assets?.staked || [];
    
    // ONLY show illiquid tokens (vesting, locked, staked) on Borrow page
    const allAssets = [
      ...vested.map((v: any) => ({ ...v, isIlliquid: true, borrowable: true })),
      ...locked.map((l: any) => ({ ...l, isIlliquid: true, borrowable: true })),
      ...staked.map((s: any) => ({ ...s, isIlliquid: true, borrowable: true }))
    ];

    return allAssets.map((item: any) => ({
      id: item.loanId || item.collateralId || (item.contractAddress === 'native' || !item.contractAddress ? `native-${item.chain}-${item.symbol}` : item.contractAddress),
      asset: item.protocol || item.symbol || "Vested Token",
      symbol: item.symbol,
      value: Number(item.pv || item.valueUsd || (item.balance * 1)) || 0,
      unlock: item.unlockTime ? new Date(item.unlockTime * 1000).toLocaleDateString() : (item.isIlliquid ? "VESTING" : "LIQUID"),
      status: item.isIlliquid ? "ILLIQUID" : "LIQUID",
      isIlliquid: item.isIlliquid,
      borrowable: item.borrowable,
      raw: item
    }));
  }, [portfolio]);

  // Simulation Mutation
  const simulateMutation = useMutation({
    mutationFn: (data: { wallet: string, amount: number, collateralId: string }) => 
      api.post('/api/loans/simulate', data),
    onSuccess: (data) => {
      setSimulationData(data.simulation);
      setStep(2);
    },
    onError: (err: any) => {
      toast.error(err.message || "Appraisal Engine Failure");
    }
  });

  // Origination Mutation
  const originateMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/loans/originate', data),
    onSuccess: () => {
      setStep(3);
      toast.success("Liquid Credit Disbursed");
    },
    onError: (err: any) => {
      toast.error(err.message || "Origination Failure");
    }
  });

  const handleSimulate = () => {
    if (!address || !selectedCollateral || !borrowAmount) return;
    simulateMutation.mutate({
      wallet: address,
      amount: Number(borrowAmount),
      collateralId: selectedCollateral.id
    });
  };

  const handleOriginate = () => {
    if (!address || !simulationData) return;
    originateMutation.mutate({
      wallet: address,
      amount: borrowAmount,
      ltvBps: simulationData.ltvBps,
      aprBps: simulationData.aprBps,
      duration_days: 30, // Default for MVP, can be expanded to selector
      stealthEnabled, // ERC-5564 logic
      collateralItems: [{
        sourceId: selectedCollateral.id,
        amount: selectedCollateral.value,
        rawData: selectedCollateral.raw
      }]
    });
  };

  const steps = [
    { id: 1, title: "Discovery", icon: Activity },
    { id: 2, title: "Appraisal", icon: Calculator },
    { id: 3, title: "Extraction", icon: Zap }
  ];

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-8 text-center bg-radial-at-t from-accent-teal/5 to-transparent">
        <div className="relative">
          <div className="absolute inset-0 bg-accent-teal/20 blur-3xl rounded-full scale-150 animate-pulse" />
          <div className="w-24 h-24 rounded-3xl bg-surface border border-white/10 flex items-center justify-center relative z-10">
            <Lock className="w-10 h-10 text-accent-teal" />
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-black uppercase tracking-tighter italic redaction-text">Authentication Required</h1>
          <p className="text-secondary max-w-sm font-medium opacity-60">Establish a secure link to your on-chain identity to access sovereign credit lines.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-32 pt-8">
      {activeLoan && (
        <div className="mb-12">
          <DebtClock loan={activeLoan} />
        </div>
      )}

      {/* Sovereign Step Indicator */}
      <div className="flex items-center justify-center gap-12 border-b border-white/5 pb-8">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-4">
            <div className={`flex flex-col items-center gap-3 transition-all duration-500 ${step >= s.id ? 'opacity-100' : 'opacity-30'}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all ${
                step >= s.id ? 'bg-accent-teal/10 border-accent-teal shadow-[0_0_20px_rgba(46,190,181,0.3)]' : 'bg-white/5 border-white/10'
              }`}>
                <s.icon size={20} className={step >= s.id ? 'text-accent-teal' : 'text-secondary'} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">{s.id === 1 ? 'Select Assets' : s.id === 2 ? 'Evaluation' : 'Capital Release'}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-24 h-px ${step > s.id ? 'bg-accent-teal shadow-[0_0_10px_rgba(46,190,181,0.5)]' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-12"
          >
            <div className="lg:col-span-8 space-y-10">
              <header className="space-y-4">
                <h1 className="text-7xl font-black italic tracking-tighter uppercase leading-[0.8] redaction-text text-glow-teal">Scan for Credit</h1>
                <p className="text-secondary font-medium text-lg leading-relaxed opacity-60 max-w-2xl">
                  Discovery of all wallet assets. Vestra identifies and highlights <span className="text-accent-teal">illiquid vesting positions</span> eligible for instant USDC credit.
                </p>
              </header>

              <div className="grid grid-cols-1 gap-4">
                {portfolioLoading ? (
                  Array(3).fill(0).map((_, i) => (
                    <div key={i} className="h-28 rounded-3xl bg-white/[0.02] border border-white/5 animate-pulse" />
                  ))
                ) : collateralOptions.length > 0 ? (
                  collateralOptions.map((option: any) => (
                    <motion.div 
                      whileHover={{ scale: 1.01, backgroundColor: 'rgba(255,255,255,0.03)' }}
                      whileTap={{ scale: 0.99 }}
                      key={option.id}
                      onClick={() => setSelectedCollateral(option)}
                      className={`p-8 rounded-[2rem] border transition-all cursor-pointer flex items-center justify-between group ${
                        selectedCollateral?.id === option.id 
                          ? 'bg-accent-teal/10 border-accent-teal shadow-glow-teal' 
                          : 'bg-white/[0.01] border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-8">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border transition-all ${
                          selectedCollateral?.id === option.id ? 'bg-accent-teal/20 border-accent-teal' : 'bg-black/40 border-white/10'
                        }`}>
                          <Sparkles size={28} className={selectedCollateral?.id === option.id ? 'text-accent-teal shadow-glow-teal' : 'text-secondary/20'} />
                        </div>
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-2xl font-black tracking-tight uppercase italic">{option.asset}</h3>
                            <span className={`text-[9px] font-black px-3 py-1 rounded-lg border uppercase tracking-widest ${
                              option.isIlliquid ? 'bg-accent-teal/10 text-accent-teal border-accent-teal/20' :
                              'bg-white/5 text-secondary/40 border-white/10'
                            }`}>
                              {option.isIlliquid ? "VESTING" : "LIQUID"}
                            </span>
                            {option.borrowable && (
                              <span className="text-[9px] font-black px-3 py-1 rounded-lg bg-accent-gold/10 text-accent-gold border border-accent-gold/20 uppercase tracking-widest">
                                Borrowable
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-secondary/40 mt-1">Unlock: {option.unlock}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-black italic text-accent-teal tracking-tighter">
                          <ZKShield variant="glitch">${option.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</ZKShield>
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-secondary/40">{option.isIlliquid ? 'Present Value (PV)' : 'Market Value'}</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="p-16 rounded-[3rem] bg-white/[0.01] border border-dashed border-white/10 text-center space-y-4">
                    <ShieldAlert className="mx-auto text-secondary/20" size={48} />
                    <p className="text-secondary font-black uppercase tracking-widest text-xs opacity-40">No verified streams detected</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 lg:pt-32">
              <Card variant="glass" className="p-10 space-y-10 sticky top-24 border-white/5 bg-surface/40 backdrop-blur-3xl shadow-2xl">
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary opacity-60">Credit Demand</label>
                    <span className="text-[10px] font-black text-accent-teal underline cursor-pointer hover:text-white transition-colors" onClick={() => selectedCollateral && setBorrowAmount((selectedCollateral.value * 0.65).toFixed(0))}>MAX CREDIT (65%)</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number"
                      value={borrowAmount}
                      onChange={(e) => setBorrowAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/60 border border-white/10 rounded-2xl p-8 text-4xl font-black italic outline-none focus:border-accent-teal/50 transition-all placeholder:text-white/5 text-accent-teal"
                    />
                    <span className="absolute right-8 top-1/2 -translate-y-1/2 font-black italic text-secondary/20 text-xl">USDC</span>
                  </div>
                </div>

                <div className="space-y-4 border-t border-white/5 pt-8">
                   <div className="flex justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-secondary/40">Network Fee</span>
                      <span className="font-mono text-xs font-bold text-accent-cyan">0.02%</span>
                   </div>
                   <div className="flex justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-secondary/40">Slippage Tolerance</span>
                      <span className="font-mono text-xs font-bold text-accent-gold">0.5%</span>
                   </div>
                </div>

                <button 
                  disabled={!selectedCollateral || !selectedCollateral.borrowable || !borrowAmount || simulateMutation.isPending}
                  onClick={handleSimulate}
                  className="w-full py-6 rounded-2xl bg-accent-teal text-background font-black uppercase tracking-widest text-[11px] hover:scale-[1.02] active:scale-95 transition-all shadow-[0_20px_40px_rgba(46,190,181,0.3)] disabled:opacity-20 flex items-center justify-center gap-3"
                >
                  {simulateMutation.isPending ? (
                    <Activity className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Generate Evaluation</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </Card>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-12"
          >
            <div className="lg:col-span-7 space-y-12">
              <button onClick={() => setStep(1)} className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-secondary/60 hover:text-white transition-colors group">
                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to Assets
              </button>

              <header className="space-y-4">
                <h1 className="text-7xl font-black italic tracking-tighter uppercase leading-[0.8] redaction-text text-glow-gold">Credit Evaluation</h1>
                <div className="inline-flex items-center gap-3 px-5 py-2 rounded-xl bg-accent-gold/10 border border-accent-gold/20 text-accent-gold">
                  <Fingerprint size={18} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Protocol Intelligence Model: ACTIVE</span>
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-10 rounded-[2.5rem] bg-accent-gold/5 border border-accent-gold/20 space-y-3 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <TrendingUp size={64} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-gold/60 block">Identity Tier</span>
                  <div className="text-5xl font-black italic tracking-tighter text-accent-gold shadow-glow-gold">{simulationData.tier}</div>
                  <span className="text-[10px] font-bold text-accent-gold/40 block tracking-widest uppercase">Max LTV: {(simulationData.ltvBps / 100).toFixed(0)}%</span>
                </div>
                <div className="p-10 rounded-[2.5rem] bg-accent-cyan/5 border border-accent-cyan/20 space-y-3 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                    <PieChartIcon size={64} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-cyan/60 block">Estimated APR</span>
                  <div className="text-5xl font-black italic tracking-tighter text-accent-cyan shadow-glow-cyan">{(simulationData.aprBps / 100).toFixed(2)}%</div>
                  <span className="text-[10px] font-bold text-accent-cyan/40 block tracking-widest uppercase">Fixed Over Term</span>
                </div>
              </div>

              <div className="p-10 rounded-[2.5rem] bg-white/[0.01] border border-white/5 space-y-8">
                <div className="flex items-center justify-between">
                   <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-secondary/40 flex items-center gap-2">
                     <Calculator size={14} className="text-accent-gold" />
                     Evaluation Logic
                   </h4>
                   <span className="text-[9px] font-mono text-accent-teal/40">MODEL_SYNC: COMPLETED</span>
                </div>
                <div className="space-y-4 font-mono text-sm">
                  <div className="flex justify-between text-accent-teal">
                    <span className="opacity-60">{'>'} VCS SCORE:</span>
                    <span className="font-bold">{simulationData.score} PTS [ALPHA]</span>
                  </div>
                  <div className="flex justify-between text-secondary/40">
                    <span className="opacity-60">{'>'} RISK RANK:</span>
                    <span className="font-bold">RANK_{Math.max(1, 6 - simulationData.ltvBps/2000).toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between text-secondary/40">
                    <span className="opacity-60">{'>'} PROTOCOL BACKSTOP:</span>
                    <span className="font-bold">ACTIVE_LIQUIDITY_VAULT</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <Card variant="solid" className="p-12 space-y-8 bg-surface/40 backdrop-blur-3xl border-accent-gold/20 shadow-[-20px_40px_100px_rgba(255,184,0,0.05)] rounded-[3rem]">
                <div className="space-y-6 text-center">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary/60">Total Disburse</span>
                    <div className="text-7xl font-black italic tracking-tighter mt-4 text-glow-gold leading-none">
                       <ZKShield variant="glitch">${simulationData.principal.toLocaleString()}</ZKShield>
                    </div>
                    <span className="text-xs font-black text-accent-gold/40 tracking-widest uppercase mt-4 block italic">Credit Line Verified & Ready</span>
                  </div>

                  <div className="space-y-6 pt-8 border-t border-white/5">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Monthly Payment</span>
                        <span className="font-black italic text-xl text-accent-gold tracking-tight">
                          ${((Number(simulationData.principal) * (1 + simulationData.aprBps/10000)) / 12).toFixed(2)}
                        </span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-secondary/60 uppercase tracking-widest">Weekly Estimated</span>
                        <span className="font-black text-md text-secondary/80">
                          ${((Number(simulationData.principal) * (1 + simulationData.aprBps/10000)) / 52).toFixed(2)}
                        </span>
                     </div>
                     <div className="flex justify-between items-center pt-2 border-t border-white/5">
                        <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Total Repayment</span>
                        <span className="font-black italic text-2xl text-accent-gold">
                          ${(Number(simulationData.principal) * (1 + simulationData.aprBps/10000)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                     </div>
                  </div>

                  <div className="space-y-4 pt-6">
                     <div className="flex justify-between items-center group cursor-help">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-secondary/40 uppercase tracking-widest">Privacy Shield</span>
                          <Info size={10} className="text-secondary/20" />
                        </div>
                         <div className="flex items-center gap-3">
                           <span className="text-[9px] font-black uppercase tracking-widest text-accent-cyan opacity-60">ERC-5564 Enabled</span>
                           <button 
                             onClick={() => setStealthEnabled(!stealthEnabled)}
                             className={`w-10 h-5 rounded-full transition-all relative ${stealthEnabled ? 'bg-accent-cyan' : 'bg-white/10'}`}
                           >
                             <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${stealthEnabled ? 'left-6' : 'left-1'}`} />
                           </button>
                        </div>
                     </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <button 
                    disabled={originateMutation.isPending}
                    onClick={handleOriginate}
                    className="w-full py-7 rounded-[2rem] bg-accent-gold text-background font-black uppercase tracking-[0.2em] text-xs hover:scale-[1.02] active:scale-95 transition-all shadow-[0_30px_60px_rgba(255,215,0,0.2)] flex items-center justify-center gap-4"
                  >
                     {originateMutation.isPending ? (
                        <Activity className="w-6 h-6 animate-spin" />
                     ) : (
                        <>
                          <ShieldCheck size={22} />
                          <span>Finalize & Transfer</span>
                        </>
                     )}
                  </button>

                  <p className="text-[10px] text-center text-secondary/40 font-medium leading-relaxed px-6 italic">
                    By confirming, you authorize the locking of the selected assets. Funds will be transferred to your wallet instantly.
                  </p>
                </div>
              </Card>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            key="step3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto text-center space-y-16 py-16"
          >
            <div className="relative inline-block">
               <div className="absolute inset-0 bg-accent-teal/20 blur-[100px] rounded-full scale-150 animate-pulse" />
               <div className="w-40 h-40 rounded-[3rem] bg-accent-teal flex items-center justify-center text-background relative z-10 shadow-glow-teal border-4 border-white/20">
                 <CheckCircle2 size={80} />
               </div>
            </div>

            <div className="space-y-6">
              <h1 className="text-7xl font-black italic tracking-tighter uppercase redaction-text text-glow-teal">Capital Unlocked</h1>
              <p className="text-secondary text-xl font-medium opacity-60 leading-relaxed max-w-lg mx-auto">
                Credit release successful. Your institutional credit line is now active and funds have been disbursed to your sovereign address. 
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-md mx-auto">
               <button onClick={() => window.location.href='/dashboard'} className="py-6 rounded-2xl bg-white/5 border border-white/10 font-black uppercase tracking-widest text-[11px] hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                  <Activity size={18} />
                  <span>Dashboard</span>
               </button>
                <button onClick={() => setStep(1)} className="py-6 rounded-2xl bg-accent-teal/10 border border-accent-teal/20 font-black uppercase tracking-widest text-[11px] text-accent-teal transition-all hover:bg-accent-teal/20 flex items-center justify-center gap-3">
                  <Plus size={18} />
                  <span>New Credit</span>
               </button>
            </div>
            
            <ComingSoon label="Automatic Withdrawal Test" className="mt-8" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
