"use client";

import { useMemo, useState } from "react";
import { 
  Zap, 
  ShieldCheck, 
  Clock, 
  ArrowRight,
  Calculator,
  Info,
  ChevronRight,
  CheckCircle2
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AssetTable } from "@/components/ui/ AssetTable";
import { useAccount, useChainId } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api";

export default function Borrow() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [selectedCollateral, setSelectedCollateral] = useState<any>(null);
  const [borrowAmount, setBorrowAmount] = useState("");

  // Fetch vested contracts for collateral selection
  const { data: vestedContracts, isLoading: vestedLoading } = useQuery({
    queryKey: ['vestedContracts', address],
    queryFn: () => api.fetchVestedContracts({ walletAddress: address }),
    enabled: !!address
  });

  const collateralOptions = useMemo(() => {
    if (!vestedContracts) return [];
    return vestedContracts.filter((item: any) => item.active).map((item: any) => ({
      id: item.loanId || item.collateralId,
      asset: item.protocol || "Vested Token",
      value: `$${(Number(item.pv || 0) / 1e6).toFixed(2)}`,
      unlock: item.unlockTime ? new Date(item.unlockTime * 1000).toLocaleDateString() : "--",
      ltv: "65%",
      available: `$${(Number(item.pv || 0) * 0.65 / 1e6).toFixed(2)}`,
      raw: item
    }));
  }, [vestedContracts]);

  const maxBorrow = useMemo(() => {
    if (!selectedCollateral) return 0;
    return Number(selectedCollateral.raw.pv || 0) * 0.65 / 1e6;
  }, [selectedCollateral]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="text-center space-y-2">
        <h1 className="text-4xl font-display font-bold text-glow-teal">Borrow Against Vesting</h1>
        <p className="text-secondary max-w-2xl mx-auto">
          Unlock instant liquidity from your future token unlocks without selling. 
          Premium credit lines powered by Vestra Engine.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Configuration */}
        <div className="lg:col-span-2 space-y-8">
          {/* Step 1: Select Collateral */}
          <Card variant="glass">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent-teal/20 flex items-center justify-center text-accent-teal font-bold border border-accent-teal/30">1</div>
              <div>
                <CardTitle>Select Vesting Collateral</CardTitle>
                <p className="text-xs text-secondary mt-0.5">Choose an active vesting stream to use as collateral.</p>
              </div>
            </CardHeader>
            <CardContent>
              {vestedLoading ? (
                <div className="py-12 text-center text-secondary italic">Scanning for vested assets...</div>
              ) : collateralOptions.length > 0 ? (
                <div className="space-y-3">
                  {collateralOptions.map((option: any) => (
                    <div 
                      key={option.id}
                      onClick={() => setSelectedCollateral(option)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer group flex items-center justify-between ${
                        selectedCollateral?.id === option.id 
                          ? 'bg-accent-teal/10 border-accent-teal shadow-[0_0_20px_rgba(46,190,181,0.1)]' 
                          : 'bg-white/5 border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg bg-surface border transition-colors ${
                          selectedCollateral?.id === option.id ? 'border-accent-teal/50' : 'border-white/10 group-hover:border-white/20'
                        }`}>
                          <ShieldCheck className={`w-5 h-5 ${selectedCollateral?.id === option.id ? 'text-accent-teal' : 'text-secondary'}`} />
                        </div>
                        <div>
                          <div className="font-bold">{option.asset}</div>
                          <div className="text-[10px] text-secondary">Unlocks {option.unlock}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-accent-teal">{option.value}</div>
                        <div className="text-[10px] text-secondary">Est. Value</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center border border-dashed border-white/10 rounded-xl bg-white/5">
                  <p className="text-secondary text-sm">No active vesting contracts found for this wallet.</p>
                  <button className="mt-4 text-xs text-accent-teal hover:underline font-bold">Import Custom Contract</button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Loan Terms */}
          <Card variant="glass" className={!selectedCollateral ? "opacity-50 pointer-events-none transition-opacity" : ""}>
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent-teal/20 flex items-center justify-center text-accent-teal font-bold border border-accent-teal/30">2</div>
              <div>
                <CardTitle>Configure Loan Terms</CardTitle>
                <p className="text-xs text-secondary mt-0.5">Determine your borrowing amount and duration.</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-end px-1">
                  <label className="text-sm font-medium text-secondary">Borrow Amount (USDC)</label>
                  <div className="text-xs text-secondary">Max: <span className="text-foreground font-mono">{maxBorrow.toFixed(2)}</span></div>
                </div>
                <div className="relative group">
                  <input 
                    type="number"
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface border border-white/10 rounded-2xl p-6 text-2xl font-display font-bold outline-none focus:border-accent-teal/50 transition-all placeholder:text-white/10"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 font-display text-lg font-bold text-white/20 group-focus-within:text-accent-teal/40 transition-colors">USDC</div>
                </div>
                <div className="flex gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <button 
                      key={pct}
                      onClick={() => selectedCollateral && setBorrowAmount((maxBorrow * pct / 100).toFixed(2))}
                      className="flex-1 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-secondary hover:bg-white/10 transition-all hover:border-white/25"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-surface border border-white/5 space-y-1">
                  <div className="text-[10px] text-secondary uppercase font-bold tracking-wider">Interest Rate</div>
                  <div className="text-lg font-bold text-glow-teal">4.5% APR</div>
                  <div className="text-[10px] text-secondary">Floating basis + margin</div>
                </div>
                <div className="p-4 rounded-xl bg-surface border border-white/5 space-y-1">
                  <div className="text-[10px] text-secondary uppercase font-bold tracking-wider">Loan Duration</div>
                  <div className="text-lg font-bold">{selectedCollateral ? 'Until Unlock' : '--'}</div>
                  <div className="text-[10px] text-secondary">Auto-settling at cliff</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Loan Summary & Action */}
        <div className="space-y-6">
          <Card variant="solid" className="sticky top-24 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-teal to-accent-cyan" />
            <CardHeader>
              <CardTitle className="text-lg">Loan Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pb-2">
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Collateral Value</span>
                  <span className="font-mono font-medium">{selectedCollateral?.value || "$0.00"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Borrow Amount</span>
                  <span className="font-mono font-medium">{borrowAmount ? `$${Number(borrowAmount).toLocaleString()}` : "$0.00"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary">Origination Fee (0.5%)</span>
                  <span className="font-mono font-medium">{borrowAmount ? `$${(Number(borrowAmount) * 0.005).toLocaleString()}` : "$0.00"}</span>
                </div>
                <div className="h-px bg-white/10 my-2" />
                <div className="flex justify-between items-center group cursor-help">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold">Health Factor</span>
                    <Info className="w-3 h-3 text-secondary" />
                  </div>
                  <span className={`text-lg font-bold font-mono ${!borrowAmount ? 'text-secondary' : Number(borrowAmount) > maxBorrow * 0.9 ? 'text-red-400' : 'text-accent-teal'}`}>
                    {selectedCollateral ? (maxBorrow / (Number(borrowAmount) || 1)).toFixed(2) : "--"}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                <div className="flex items-center gap-2 text-xs text-accent-teal">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Verified by MeTTabrain V2</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-secondary">
                  <Clock className="w-3 h-3" />
                  <span>Execution speed: ~12s</span>
                </div>
              </div>

              <button 
                disabled={!selectedCollateral || !borrowAmount || Number(borrowAmount) <= 0 || Number(borrowAmount) > maxBorrow}
                className="w-full py-4 rounded-2xl bg-accent-teal text-background font-bold text-lg hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-[0_4px_20px_rgba(46,190,181,0.3)] group"
              >
                <div className="flex items-center justify-center gap-2">
                  <span>Confirm Loan</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
              
              <p className="text-[10px] text-center text-secondary px-4">
                By confirming, you agree to the Vestra Protocol Smart Loan terms and conditions.
              </p>
            </CardContent>
          </Card>

          <Card variant="glass" className="bg-gradient-to-br from-accent-cyan/5 to-transparent border-accent-cyan/20">
            <CardContent className="p-4 flex items-start gap-3">
              <Calculator className="w-5 h-5 text-accent-cyan mt-1" />
              <div>
                <h4 className="text-sm font-bold">Yield Optimization</h4>
                <p className="text-xs text-secondary mt-1">
                  Borrowing against your vest allows you to maintain protocol exposure while accessing capital for high-yield opportunities.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* More info section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12">
        {[
          { icon: Zap, title: "Instant Liquidity", desc: "No manual credit checks. Your on-chain vesting contract is your credit score." },
          { icon: ShieldCheck, title: "Non-Custodial", desc: "Vestra never takes custody of your tokens. Positions are managed by trustless Smart Vaults." },
          { icon: Clock, title: "Zero Monthly Payments", desc: "Interest accumulates within the loan and is settled automatically upon token unlock." }
        ].map((item, i) => (
          <div key={i} className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-accent-teal border border-white/10">
              <item.icon className="w-5 h-5" />
            </div>
            <h3 className="font-bold">{item.title}</h3>
            <p className="text-sm text-secondary leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
