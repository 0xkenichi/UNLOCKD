"use client";

import { useMemo, useState, useEffect } from "react";
import { 
  Plus, 
  TrendingUp, 
  ShieldCheck, 
  Activity, 
  ArrowUpRight,
  DollarSign,
  PieChart as PieChartIcon
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AssetTable } from "@/components/ui/AssetTable";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getContract, lendingPoolAbi, usdcAbi } from "@/config/contracts";
import { api } from "@/utils/api";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { StakeModal } from "@/components/lend/StakeModal";
import { ZKShield } from "@/components/stealth/ZKShield";
import { formatUnits } from "viem";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from "recharts";
import { FlowInterestCounter } from "@/components/lend/FlowInterestCounter";

export default function Lend() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [isStakeModalOpen, setIsStakeModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // On-chain data
  const lendingPool = getContract(chainId, 'lendingPool');
  const usdc = getContract(chainId, 'usdc');

  const { data: totalDeposits, refetch: refetchTotal } = useReadContract({
    address: lendingPool as `0x${string}`,
    abi: lendingPoolAbi,
    functionName: 'totalDeposits',
    query: { enabled: !!lendingPool && lendingPool.toLowerCase() !== '0xfa515a43b9d010a398ff6a3253c1c7a9374f8c95' }
  });

  // Fallback for Safe Treasury TVL
  const { data: safeBalance, refetch: refetchSafe } = useReadContract({
    address: usdc as `0x${string}`,
    abi: usdcAbi as any,
    functionName: 'balanceOf',
    args: [lendingPool as `0x${string}`],
    query: { enabled: !!lendingPool && !!usdc && lendingPool.toLowerCase() === '0xfa515a43b9d010a398ff6a3253c1c7a9374f8c95' }
  });

  const { data: userStakesData, refetch: refetchUserStakes } = useReadContract({
    address: lendingPool as `0x${string}`,
    abi: lendingPoolAbi,
    functionName: 'userStakes',
    args: [address!, BigInt(0)],
    query: { enabled: !!address && !!lendingPool }
  });

  // Backend data
  const { data: poolsData } = useQuery({
    queryKey: ['pools'],
    queryFn: () => api.fetchPools()
  });

  const { data: yieldHistory, isLoading: yieldLoading } = useQuery({
    queryKey: ['yieldHistory'],
    queryFn: () => api.fetchYieldHistory()
  });

  const { data: depositsData, refetch: refetchDeposits } = useQuery({
    queryKey: ['deposits', address],
    queryFn: () => api.fetchDeposits(address!),
    enabled: !!address
  });

  const [faucetLoading, setFaucetLoading] = useState(false);

  const handleFaucet = async () => {
    if (!address) return;
    setFaucetLoading(true);
    try {
      await api.faucetUsdc(address);
    } catch (err: any) {
      console.error(err);
    } finally {
      setFaucetLoading(false);
    }
  };

  const formattedTotalSupplied = useMemo(() => {
    const val = (lendingPool.toLowerCase() === '0xfa515a43b9d010a398ff6a3253c1c7a9374f8c95') 
      ? safeBalance 
      : totalDeposits;
      
    if (!val) return "0.00";
    return (Number(val) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2 });
  }, [totalDeposits, safeBalance, lendingPool]);

  const marketMetrics = useMemo(() => {
    if (!poolsData?.items || poolsData.items.length === 0) return { apy: "0.00", health: "100" };
    const items = poolsData.items;
    const avgApy = items.reduce((acc: number, p: any) => acc + parseFloat(p.apy || "0"), 0) / items.length;
    return {
      apy: isNaN(avgApy) ? "0.00" : avgApy.toFixed(2),
      health: "99.9"
    };
  }, [poolsData]);

  const poolsList = useMemo(() => {
    if (!poolsData?.items) return [];
    return poolsData.items.map((pool: any) => ({
      name: pool.name || "USDC Term Pool",
      capacity: `$${(pool.capacity / 1e6).toLocaleString()}`,
      utilization: `${pool.utilization || 0}%`,
      apy: `${pool.apy || "5.4"}%`,
      risk: pool.riskScore || "Low",
      action: "Supply"
    }));
  }, [poolsData]);

  return (
    <div className="space-y-8 pb-32">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-6xl font-black uppercase tracking-tighter italic text-glow-teal redaction-text leading-none">Protocol Fuel</h1>
          <p className="text-secondary mt-2 font-medium opacity-60 tracking-tight">Deploy institutional-grade liquidity into high-LTV capital markets.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleFaucet}
            disabled={!mounted || faucetLoading || !address}
            className="flex items-center gap-2 px-6 py-4 rounded-xl bg-white/5 border border-white/10 text-secondary font-black uppercase tracking-widest text-[9px] hover:bg-white/10 transition-all disabled:opacity-50"
          >
            {faucetLoading ? <Activity className="w-4 h-4 animate-spin text-accent-teal" /> : <DollarSign className="w-4 h-4 text-accent-gold" />}
            <span>Liquidity Faucet</span>
          </button>
          <button 
            onClick={() => setIsStakeModalOpen(true)}
            className="flex items-center gap-2 px-10 py-4 rounded-xl bg-accent-teal text-background font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all shadow-[0_0_30px_rgba(46,190,181,0.4)]"
          >
            <Plus className="w-5 h-5" />
            <span>Deposit for Yield</span>
          </button>
        </div>
      </header>

      {/* Market Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Sovereign TVL"
          value={<ZKShield variant="glitch">{`$${formattedTotalSupplied}`}</ZKShield>}
          subValue="On-chain protocol liquidity"
          trend="up"
          change={4.2}
          icon={<DollarSign className="w-5 h-5" />}
          glowColor="teal"
          className="border border-white/5 bg-surface/40 backdrop-blur-xl"
        />
        <MetricCard
          label="Discovery Yield"
          value={<ZKShield variant="blur">{`${marketMetrics.apy}%`}</ZKShield>}
          subValue="Vesting-backed base rate"
          trend="up"
          change={0.15}
          icon={<TrendingUp className="w-5 h-5" />}
          glowColor="cyan"
          className="border border-white/5 bg-surface/40 backdrop-blur-xl"
        />
        <MetricCard
          label="System Solvency"
          value={`${marketMetrics.health}%`}
          subValue="Collateral-to-Debt Ratio"
          trend="neutral"
          icon={<ShieldCheck className="w-5 h-5" />}
          glowColor="gold"
          className="border border-white/5 bg-surface/40 backdrop-blur-xl"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Yield History */}
        <Card className="lg:col-span-2 border-white/5 bg-surface/30 px-6 py-4" variant="glass">
          <CardHeader className="flex flex-row items-center justify-between p-0 mb-8">
            <div>
              <CardTitle className="text-2xl font-black uppercase italic tracking-tighter">Fuel Dynamics</CardTitle>
              <p className="text-[10px] text-secondary/50 font-mono mt-1">REAL-TIME YIELD PERFORMANCE TRACKING [BLOCKS: ACTIVE]</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ChartContainer height={300}>
              {yieldLoading ? (
                <div className="h-full flex items-center justify-center text-secondary text-xs uppercase tracking-widest animate-pulse">Establishing data link...</div>
              ) : (
                <AreaChart data={yieldHistory?.data || []}>
                  <defs>
                    <linearGradient id="yieldGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2EBEB5" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2EBEB5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff20" fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke="#ffffff20" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v: any) => `${v}%`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0C1117', border: '1px solid #ffffff10', borderRadius: '8px', fontSize: '10px' }}
                    itemStyle={{ color: '#2EBEB5' }}
                  />
                  <Area type="monotone" dataKey="apy" stroke="#2EBEB5" strokeWidth={3} fill="url(#yieldGlow)" animationDuration={2000} />
                </AreaChart>
              )}
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Global Strategy */}
        <Card variant="glass" className="bg-gradient-to-br from-accent-gold/5 via-transparent to-transparent border-white/5">
          <CardHeader>
            <CardTitle className="text-xl font-bold uppercase tracking-tight">Strategy Node</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
              <Card variant="glass" className="p-8 space-y-4">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] text-secondary/40">
                  <span>Target Yield</span>
                  <div className="w-2 h-2 rounded-full bg-accent-teal shadow-glow-teal animate-pulse" />
                </div>
                <div className="text-4xl font-black italic tracking-tighter text-accent-teal">
                  <ZKShield variant="glitch">12.4%</ZKShield>
                </div>
                <p className="text-[10px] font-medium text-secondary/40 uppercase tracking-widest leading-relaxed">
                  Blended algorithmic rate across V4 vaults.
                </p>
              </Card>
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="relative">
                <div className="w-24 h-24 rounded-full border-2 border-accent-gold/10 border-t-accent-gold animate-spin-slow flex items-center justify-center">
                  <span className="text-2xl font-black font-display text-accent-gold italic tracking-tighter">85%</span>
                </div>
                <div className="absolute -bottom-1 -right-1 p-2 rounded-full bg-accent-gold text-background shadow-lg">
                  <PieChartIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="space-y-1">
                <h4 className="font-black uppercase italic tracking-tighter text-sm">Aggressive Yield Curve</h4>
                <p className="text-[10px] text-secondary/60 font-medium">Optimizing liquidity across recursive capital pools.</p>
              </div>
            </div>
            
            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="flex justify-between items-end">
                <span className="text-[10px] text-secondary font-black uppercase tracking-widest opacity-40">Monthly Velocity</span>
                <span className="font-mono text-lg font-bold text-accent-gold tracking-tighter">$1,240.50</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-[10px] text-secondary font-black uppercase tracking-widest opacity-40">Network Latency</span>
                <span className="font-mono text-xs font-bold text-accent-cyan">2.4ms</span>
              </div>
            </div>

            <button className="w-full py-4 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2 group">
              <span>View Active Nodes</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-accent-cyan" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Sovereign Stakes */}
      {mounted && address && (
        <Card variant="solid" className="border-accent-teal/10 bg-surface/20">
          <CardHeader>
            <CardTitle className="text-accent-teal flex items-center gap-2 text-xl font-black uppercase italic tracking-tighter p-4">
              <ShieldCheck className="w-6 h-6" />
              Active Fuel Deposits
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 border-t border-white/5">
            <AssetTable
              columns={[
                { header: "Principal", accessorKey: "principal" },
                { header: "Yield (APY)", accessorKey: "apy", align: "right" },
                { header: "Maturity", accessorKey: "timeLeft", align: "right" },
                { header: "Flowing Interest", accessorKey: "yield", align: "right" },
                { header: "Operations", accessorKey: "action", align: "right" }
              ] as any}
              data={(() => {
                const results = [];
                // Add on-chain stakes if they exist
                if (userStakesData && userStakesData[0] > 0n) {
                  results.push({
                    principal: <span className="font-mono font-bold text-sm tracking-tighter">{formatUnits(userStakesData[0] as bigint, 6)} USDC</span>,
                    apy: <span className="font-black italic text-accent-cyan">{Number(userStakesData[3])/100}%</span>,
                    timeLeft: (
                      <span className="text-[10px] font-bold uppercase" suppressHydrationWarning>
                        {Math.max(0, Math.floor((Number(userStakesData[2]) - Date.now()/1000) / 86400))} Days
                      </span>
                    ),
                    yield: <FlowInterestCounter principal={userStakesData[0] as bigint} apyBps={Number(userStakesData[3])} lastClaimTime={Number(userStakesData[4])} />, 
                    action: <div className="flex gap-2 justify-end">
                      <button className="px-4 py-2 rounded-lg bg-accent-teal/10 text-accent-teal text-[9px] font-black uppercase tracking-widest border border-accent-teal/20 hover:bg-accent-teal/20 transition-all">Harvest</button>
                      <button className="px-4 py-2 rounded-lg bg-white/5 text-secondary text-[9px] font-black uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all">Command</button>
                    </div>
                  });
                }
                // Add backend deposits if they exist
                if (depositsData?.items) {
                  depositsData.items.forEach((dep: any) => {
                    results.push({
                      principal: (
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-sm tracking-tighter">${Number(dep.amount).toLocaleString()} USDC</span>
                          <span className="text-[8px] opacity-40 uppercase">Term Deposit</span>
                        </div>
                      ),
                      apy: <span className="font-black italic text-accent-cyan">{Number(dep.apy_bps || 0)/100}%</span>,
                      timeLeft: (
                        <span className="text-[10px] font-bold uppercase">
                          {dep.duration_days} Days
                        </span>
                      ),
                      yield: <span className="text-accent-teal font-mono text-xs">Generating...</span>,
                      action: (
                        <div className="flex gap-2 justify-end">
                          <button className="px-4 py-2 rounded-lg bg-white/5 text-secondary text-[9px] font-black uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all">Withdraw</button>
                        </div>
                      )
                    });
                  });
                }
                return results;
              })()}
            />
          </CardContent>
        </Card>
      )}

      {/* Available Pools */}
      <Card variant="solid" className="bg-surface/10 border-white/5">
        <CardHeader className="flex flex-row items-center justify-between p-6">
          <div>
            <CardTitle className="text-xl font-black uppercase italic tracking-tighter p-0 leading-none">Capital Markets</CardTitle>
            <p className="text-[10px] text-secondary/40 font-mono mt-1">DIRECT ON-CHAIN ASSET LIQUIDITY NODES</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded-lg border border-white/5 text-[9px] font-black uppercase tracking-widest text-secondary bg-white/5">Liquidity Nodes</button>
            <button className="px-3 py-2 rounded-lg border border-white/5 text-[9px] font-black uppercase tracking-widest text-secondary/30">History</button>
          </div>
        </CardHeader>
        <CardContent className="p-0 border-t border-white/5">
          <AssetTable
            columns={[
              { header: "Node Name", accessorKey: "name" },
              { header: "Full Capacity", accessorKey: "capacity", align: "right" },
              { header: "Active Ratio", accessorKey: "utilization", align: "right" },
              { 
                header: "Yield APY", 
                accessorKey: "apy", 
                align: "right",
                className: "text-accent-teal font-black italic"
              },
              { 
                header: "Risk Tier", 
                accessorKey: (item: any) => (
                  <div className={`px-2 py-1 rounded border ${
                    item.risk === 'Low' ? 'bg-accent-teal/5 border-accent-teal/10 text-accent-teal' : 'bg-accent-gold/5 border-accent-gold/10 text-accent-gold'
                  } text-[9px] font-black uppercase tracking-tighter`}>
                    {item.risk}
                  </div>
                )
              },
              {
                header: "Command",
                accessorKey: (item: any) => (
                  <button className="text-[10px] font-black uppercase tracking-widest text-accent-cyan hover:glow-cyan px-4">
                    Supply Capital
                  </button>
                )
              }
            ] as any}
            data={poolsList}
          />
        </CardContent>
      </Card>
      
      <StakeModal 
        isOpen={isStakeModalOpen} 
        onClose={() => setIsStakeModalOpen(false)} 
        chainId={chainId} 
        onSuccess={() => {
          refetchTotal();
          refetchSafe();
          refetchUserStakes();
        }}
      />
    </div>
  );
}
