"use client";

import { useMemo, useState, useEffect } from "react";
import { 
  Zap, 
  ShieldCheck, 
  Clock, 
  ArrowRight,
  Calculator,
  Info,
  ChevronRight,
  CheckCircle2,
  Lock,
  ArrowLeft,
  Sparkles,
  TrendingUp,
  Fingerprint
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { useAccount, useChainId } from "wagmi";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import { MatrixReveal } from "@/components/stealth/MatrixReveal";

export default function Borrow() {
  const { address, isConnected } = useAccount();
  const [step, setStep] = useState(1);
  const [selectedCollateral, setSelectedCollateral] = useState<any>(null);
  const [borrowAmount, setBorrowAmount] = useState("");
  const [simulationData, setSimulationData] = useState<any>(null);

  // Fetch vested contracts for collateral selection
  const { data: vestedContracts, isLoading: vestedLoading } = useQuery({
    queryKey: ['vestedContracts', address],
    queryFn: () => api.fetchVestedContracts({ walletAddress: address }),
    enabled: !!address
  });

  const collateralOptions = useMemo(() => {
    const items = Array.isArray(vestedContracts) 
      ? vestedContracts 
      : (vestedContracts as any)?.items || [];
      
    return items.filter((item: any) => item.active).map((item: any) => ({
      id: item.loanId || item.collateralId,
      asset: item.protocol || "Vested Token",
      value: Number(item.pv || 0) / 1e6,
      unlock: item.unlockTime ? new Date(item.unlockTime * 1000).toLocaleDateString() : "--",
      raw: item
    }));
  }, [vestedContracts]);

  // Simulation Mutation
  const simulateMutation = useMutation({
    mutationFn: (data: { wallet: string, amount: number, collateralId: string }) => 
      api.post('/api/loans/simulate', data),
    onSuccess: (data) => {
      setSimulationData(data.simulation);
      setStep(2);
    },
    onError: (err: any) => {
      toast.error(err.message || "Simulation failed");
    }
  });

  // Origination Mutation
  const originateMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/loans/originate', data),
    onSuccess: () => {
      setStep(3);
      toast.success("Loan Originated!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Origination failed");
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
      collateralItems: [{
        sourceId: selectedCollateral.id,
        amount: selectedCollateral.value,
        rawData: selectedCollateral.raw
      }]
    });
  };

  const steps = [
    { id: 1, title: "Collateral", icon: ShieldCheck },
    { id: 2, title: "Simulation", icon: Calculator },
    { id: 3, title: "Execution", icon: Zap }
  ];

  if (!isConnected) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-6 text-center">
        <div className="w-20 h-20 rounded-full bg-accent-teal/10 flex items-center justify-center border border-accent-teal/20">
          <Lock className="w-10 h-10 text-accent-teal" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Connect Wallet to Access Credit</h1>
          <p className="text-secondary max-w-sm">Please connect your wallet to view your vested assets and eligible credit lines.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-8">
      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-4">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center">
            <div className={`flex flex-col items-center gap-2 ${step >= s.id ? 'text-accent-teal' : 'text-secondary/40'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all ${
                step >= s.id ? 'bg-accent-teal/10 border-accent-teal shadow-[0_0_15px_rgba(46,190,181,0.2)]' : 'bg-white/5 border-white/10'
              }`}>
                <s.icon size={18} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">{s.title}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-12 h-px mb-6 mx-2 ${step > s.id ? 'bg-accent-teal' : 'bg-white/10'}`} />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            <div className="lg:col-span-8 space-y-8">
              <header className="space-y-4">
                <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-[0.9]">Select Your Collateral</h1>
                <p className="text-secondary font-medium text-lg leading-relaxed">
                  Choose from your verified vested assets to unlock a dynamic credit line. Vestra analyzes stream health and protocol reputation instantly.
                </p>
              </header>

              <div className="grid grid-cols-1 gap-4">
                {vestedLoading ? (
                  Array(3).fill(0).map((_, i) => (
                    <div key={i} className="h-24 rounded-3xl bg-white/[0.02] border border-white/5 animate-pulse" />
                  ))
                ) : collateralOptions.length > 0 ? (
                  collateralOptions.map((option: any) => (
                    <motion.div 
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      key={option.id}
                      onClick={() => setSelectedCollateral(option)}
                      className={`p-6 rounded-[2rem] border transition-all cursor-pointer flex items-center justify-between group ${
                        selectedCollateral?.id === option.id 
                          ? 'bg-accent-teal/10 border-accent-teal shadow-[0_0_30px_rgba(46,190,181,0.1)]' 
                          : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-6">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all ${
                          selectedCollateral?.id === option.id ? 'bg-accent-teal/20 border-accent-teal' : 'bg-black/40 border-white/10'
                        }`}>
                          <Sparkles size={24} className={selectedCollateral?.id === option.id ? 'text-accent-teal' : 'text-secondary/40'} />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold tracking-tight">{option.asset}</h3>
                          <p className="text-xs font-black uppercase tracking-widest text-secondary/60">Unlock: {option.unlock}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black italic text-accent-teal tracking-tighter">${option.value.toLocaleString()}</div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-secondary/40">Present Value</p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="p-12 rounded-[2.5rem] bg-white/[0.02] border border-dashed border-white/10 text-center">
                    <Info className="mx-auto mb-4 text-secondary/40" size={32} />
                    <p className="text-secondary font-medium">No active vested streams detected.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 lg:pt-24">
              <Card variant="glass" className="p-8 space-y-8 sticky top-24">
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-black uppercase tracking-widest text-secondary">Borrow Amount</label>
                    <span className="text-[10px] font-bold text-accent-teal underline cursor-pointer" onClick={() => selectedCollateral && setBorrowAmount((selectedCollateral.value * 0.65).toFixed(0))}>Max Line (65%)</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number"
                      value={borrowAmount}
                      onChange={(e) => setBorrowAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 text-3xl font-black italic outline-none focus:border-accent-teal/50 transition-all placeholder:text-white/5"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black italic text-secondary/20">USDC</span>
                  </div>
                </div>

                <button 
                  disabled={!selectedCollateral || !borrowAmount || simulateMutation.isPending}
                  onClick={handleSimulate}
                  className="w-full py-6 rounded-[1.5rem] bg-accent-teal text-background font-black uppercase tracking-tight hover:scale-[1.02] transition-all shadow-[0_20px_40px_rgba(46,190,181,0.25)] disabled:opacity-30 flex items-center justify-center gap-3"
                >
                  {simulateMutation.isPending ? (
                    <div className="w-5 h-5 border-2 border-background border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Engage Engine</span>
                      <ArrowRight size={20} />
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
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-12"
          >
            <div className="lg:col-span-7 space-y-12">
              <button onClick={() => setStep(1)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-secondary hover:text-white transition-colors">
                <ArrowLeft size={14} /> Back to Collateral
              </button>

              <header className="space-y-4">
                <h1 className="text-6xl font-black italic tracking-tighter uppercase leading-[0.85]">Simulation Complete</h1>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-teal/10 border border-accent-teal/20 text-accent-teal">
                  <Fingerprint size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Matched with Account Identity</span>
                </div>
              </header>

              <div className="grid grid-cols-2 gap-6">
                <div className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-secondary block">Loan Tier</span>
                  <div className="text-4xl font-black italic tracking-tighter text-glow-teal">{simulationData.tier}</div>
                  <span className="text-xs font-bold text-accent-teal/60 block">Enhanced by high VCS</span>
                </div>
                <div className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-secondary block">Interest Basis</span>
                  <div className="text-4xl font-black italic tracking-tighter text-glow-cyan">{(simulationData.aprBps / 100).toFixed(2)}%</div>
                  <span className="text-xs font-bold text-accent-cyan/60 block">Annual Percentage Rate</span>
                </div>
              </div>

              <div className="p-8 rounded-[2rem] bg-white/[0.01] border border-white/5 space-y-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-secondary">Engine Log</h4>
                <div className="space-y-4 font-mono text-[11px]">
                  <div className="flex justify-between text-accent-teal/80">
                    <span>{'>'} VCS COMPUTE:</span>
                    <span>{simulationData.score} PTS</span>
                  </div>
                  <div className="flex justify-between text-secondary/60">
                    <span>{'>'} LTV CEILING:</span>
                    <span>{(simulationData.ltvBps / 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-secondary/60">
                    <span>{'>'} DPV DISCOUNT:</span>
                    <span>APPLIED (BSL-1.1)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <Card variant="solid" className="p-10 space-y-8 bg-gradient-to-b from-surface to-background border-accent-teal/20 shadow-[0_40px_100px_rgba(0,0,0,0.4)]">
                <div className="space-y-6">
                  <div className="text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Net Disbursement</span>
                    <div className="text-6xl font-black italic tracking-tighter mt-2">${simulationData.principal.toLocaleString()}</div>
                  </div>

                  <div className="space-y-4 pt-8">
                     <div className="flex justify-between text-sm">
                        <span className="text-secondary font-medium">Monthly Interest</span>
                        <span className="font-black italic text-accent-teal">${(simulationData.principal * (simulationData.aprBps/10000)/12).toFixed(2)}</span>
                     </div>
                     <div className="flex justify-between text-sm">
                        <span className="text-secondary font-medium">Repayment Terms</span>
                        <span className="font-black italic">Auto-Settling</span>
                     </div>
                     <div className="flex justify-between text-sm">
                        <span className="text-secondary font-medium">Risk Factor</span>
                        <span className="text-green-400 font-black italic">LOWEST</span>
                     </div>
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <button 
                  disabled={originateMutation.isPending}
                  onClick={handleOriginate}
                  className="w-full py-6 rounded-[2rem] bg-accent-teal text-background font-black uppercase tracking-tight hover:scale-[1.02] transition-all shadow-[0_20px_50px_rgba(46,190,181,0.3)] flex items-center justify-center gap-3 active:scale-95"
                >
                   {originateMutation.isPending ? (
                      <div className="w-5 h-5 border-2 border-background border-t-transparent rounded-full animate-spin" />
                   ) : (
                      <>
                        <ShieldCheck size={20} />
                        <span>Confirm & Disburse</span>
                      </>
                   )}
                </button>

                <p className="text-[10px] text-center text-secondary leading-relaxed px-4">
                  By executing, you authorize the locking of the selected vesting stream in the Vestra Smart Vault V4.
                </p>
              </Card>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            key="step3"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-xl mx-auto text-center space-y-12 py-12"
          >
            <div className="relative inline-block">
               <div className="absolute inset-0 bg-accent-teal/20 blur-3xl rounded-full scale-150 animate-pulse" />
               <div className="w-32 h-32 rounded-[2.5rem] bg-accent-teal flex items-center justify-center text-background relative z-10 shadow-[0_0_60px_rgba(46,190,181,0.3)]">
                 <CheckCircle2 size={64} />
               </div>
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl font-black italic tracking-tighter uppercase">Loan Executed</h1>
              <p className="text-secondary text-lg font-medium">
                Vestra Engine successful. Your credit line is now active and funds have been disbursed to your vault address. 
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <button onClick={() => window.location.href='/dashboard'} className="py-5 rounded-2xl bg-white/5 border border-white/10 font-black uppercase tracking-tight text-[10px] hover:bg-white/10 transition-all">
                  Go to Dashboard
               </button>
               <button onClick={() => setStep(1)} className="py-5 rounded-2xl bg-accent-teal/10 border border-accent-teal/20 font-black uppercase tracking-tight text-[10px] text-accent-teal transition-all hover:bg-accent-teal/20">
                  New Borrow line
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
