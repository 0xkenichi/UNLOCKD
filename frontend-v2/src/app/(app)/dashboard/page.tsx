"use client";

import { motion } from "framer-motion";
import { 
  TrendingUp, 
  Activity, 
  Zap, 
  ShieldCheck, 
  ArrowUpRight, 
  ArrowDownRight,
  RefreshCcw,
  Globe,
  Fingerprint
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { MatrixReveal } from "@/components/stealth/MatrixReveal";
import { ZKShield } from "@/components/stealth/ZKShield";
import { useStealthMode } from "@/components/providers/stealth-provider";
import { DashboardHolo } from "@/components/dashboard/DashboardHolo";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { AssetTable } from "@/components/ui/AssetTable";
import { SovereignAssetCard } from "@/components/dashboard/SovereignAssetCard";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getContract, loanManagerAbi, usdcAbi } from "@/config/contracts";
import { api } from "@/utils/api";
import { useMemo, useEffect, useState } from "react";
import { DemoCenter } from "@/components/demo/DemoCenter";


export default function Dashboard() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { isStealthMode } = useStealthMode();
  const [unlockFilter, setUnlockFilter] = useState("");
  const [sizeFilter, setSizeFilter] = useState("");
  const [valuationFilter, setValuationFilter] = useState("");
  
  // On-chain data
  const loanManager = getContract(chainId, 'loanManager');
  const usdc = getContract(chainId, 'usdc');

  const { data: loanCount } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loanCount',
    query: { enabled: !!loanManager }
  });

  const { data: usdcBalance, isLoading: usdcLoading } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!usdc && !!address }
  });

  // Backend data
  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ['kpi'],
    queryFn: () => api.fetchKpi(24)
  });

  const { data: activity } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.fetchActivity()
  });

  const { data: userLoans, isLoading: loansLoading } = useQuery({
    queryKey: ['userLoans', address],
    queryFn: () => (api as any).fetchLoans(address),
    enabled: !!address
  });

  const { data: portfolio, isLoading: portfolioLoading, refetch: refetchPortfolio } = useQuery({
    queryKey: ['portfolio', address],
    queryFn: () => api.fetchPortfolio(address!),
    enabled: !!address
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['tvlHistory'],
    queryFn: () => api.fetchTvlHistory()
  });

  const { data: marketQuotes, isLoading: marketLoading } = useQuery({
    queryKey: ['marketQuotes'],
    queryFn: () => api.fetchMarketQuotes()
  });

  const { data: vestingData, isLoading: vestingLoading } = useQuery({
    queryKey: ['vestingAll'],
    queryFn: () => api.fetchVestingAll()
  });

  useEffect(() => {
    const handleRefresh = () => {
      refetchPortfolio();
    };
    window.addEventListener('refresh-portfolio', handleRefresh);
    return () => window.removeEventListener('refresh-portfolio', handleRefresh);
  }, [refetchPortfolio]);

  const totalDebt = useMemo(() => {
    const items = userLoans?.items || [];
    return items.reduce((acc: number, loan: any) => acc + Number(loan.amount), 0);
  }, [userLoans]);

  const formattedUsdc = useMemo(() => {
    if (!usdcBalance) return "0.00";
    return (Number(usdcBalance) / 1e6).toFixed(2);
  }, [usdcBalance]);

  const recentActivity = useMemo(() => {
    if (!activity?.items) return [];
    return activity.items.slice(0, 5).map((item: any) => ({
      activity: item.type === 'LoanCreated' ? 'New Loan' : item.type === 'LoanRepaid' ? 'Repayment' : 'Settlement',
      amount: item.amount || "--",
      status: "Confirmed",
      timestamp: new Date(item.timestamp).toLocaleTimeString(),
    }));
  }, [activity]);

  const marketData = useMemo(() => {
    if (!vestingData?.projects) return [];
    
    // Merge projects with events for a unified view
    const items = vestingData.projects.map((p: any) => {
      const event = vestingData.events?.find((e: any) => e.token_id === p.id);
      const metadata = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : (p.metadata || {});
      const fundraising = metadata.fundraising || {};
      
      return {
        id: p.id,
        asset: p.symbol || p.name,
        name: p.name,
        price: fundraising.token_price || "$0.00",
        quantity: event?.amount || "0",
        unlockDate: event?.occurrence_date || "TBA",
        valuation: fundraising.valuation || "N/A",
        trend: "neutral",
        category: p.category
      };
    });

    return items.filter((item: any) => {
      const matchesUnlock = !unlockFilter || item.unlockDate.includes(unlockFilter);
      const matchesSize = !sizeFilter || parseFloat(item.quantity) >= parseFloat(sizeFilter);
      const matchesValuation = !valuationFilter || item.valuation.includes(valuationFilter);
      return matchesUnlock && matchesSize && matchesValuation;
    });
  }, [vestingData, unlockFilter, sizeFilter, valuationFilter]);

  const primaryMetrics = useMemo(() => [
    {
      label: "Total Value Locked",
      value: <ZKShield variant="glitch">
               <MatrixReveal text={kpiLoading ? "..." : `$${(kpi?.growth?.tvlUsd || 42.8).toFixed(1)}M`}>
                 {kpiLoading ? "..." : `$${(kpi?.growth?.tvlUsd || 42.8).toFixed(1)}M`}
               </MatrixReveal>
             </ZKShield>,
      subValue: "+12.4% from last week",
      trend: "up" as const,
      icon: <Zap className="w-5 h-5" />,
      glowColor: "teal" as const,
      className: "redaction-text"
    },
    {
      label: "My Active Debt",
      value: <ZKShield variant="blur">
               <MatrixReveal text={loansLoading ? "..." : `$${totalDebt.toLocaleString()}`}>
                 {loansLoading ? "..." : `$${totalDebt.toLocaleString()}`}
               </MatrixReveal>
             </ZKShield>,
      subValue: `${userLoans?.items?.length || 0} active positions`,
      trend: (totalDebt > 0 ? "up" : "neutral") as "up" | "down" | "neutral",
      icon: <TrendingUp className="w-5 h-5" />,
      glowColor: (totalDebt > 0 ? "red" : "none") as "teal" | "cyan" | "red" | "none",
      className: "redaction-text"
    },
    {
      label: "Asset Inflow",
      value: <MatrixReveal text={kpiLoading ? "..." : `$${(kpi?.revenue?.total || 142.5).toFixed(1)}K`}>
               {kpiLoading ? "..." : `$${(kpi?.revenue?.total || 142.5).toFixed(1)}K`}
             </MatrixReveal>,
      subValue: "Net liquidity growth",
      trend: "up" as const,
      icon: <ShieldCheck className="w-5 h-5" />,
      glowColor: "cyan" as const,
      className: "redaction-text"
    },
    {
      label: "Global Market",
      value: <MatrixReveal text={kpi?.market?.globalTvl ? `$${(kpi.market.globalTvl / 1e12).toFixed(2)}T` : "$1.24T"}>
               {kpi?.market?.globalTvl ? `$${(kpi.market.globalTvl / 1e12).toFixed(2)}T` : "$1.24T"}
             </MatrixReveal>,
      subValue: "Live DeFi TVL (Llama)",
      trend: "up" as const,
      icon: <Globe className="w-5 h-5" />,
      glowColor: "cyan" as const,
      className: "redaction-text"
    },
    {
      label: "My Wallet (USDC)",
      value: <ZKShield variant="mask">
               <MatrixReveal text={`$${formattedUsdc}`}>{`$${formattedUsdc}`}</MatrixReveal>
             </ZKShield>,
      subValue: "Connected Wallet",
      trend: "neutral" as const,
      icon: <Fingerprint className="w-5 h-5" />,
      className: "redaction-text"
    }
  ], [kpiLoading, kpi, loansLoading, totalDebt, userLoans, formattedUsdc]);

  return (
    <div className={`space-y-8 pb-20 relative min-h-screen ${isStealthMode ? 'stealth-grid' : ''}`}>
      {isStealthMode && <div className="noise-overlay" />}
      
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10"
      >
        <div>
          <h1 className="text-5xl font-black tracking-tighter uppercase italic text-glow-teal redaction-text">Protocol Overview</h1>
          <p className="text-secondary mt-2 font-medium redaction-text opacity-70">Global credit health and platform metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-full bg-surface/80 backdrop-blur-md border border-white/5 flex items-center gap-3 text-xs shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-teal animate-pulse shadow-[0_0_10px_rgba(46,190,181,0.5)]" />
            <span className="text-secondary font-black uppercase tracking-widest text-[10px]">Mainnet Online</span>
          </div>
          <button className="p-3 rounded-2xl bg-surface/80 backdrop-blur-md border border-white/5 hover:border-accent-teal/50 hover:bg-accent-teal/10 transition-all group">
            <RefreshCcw className="w-4 h-4 text-secondary group-hover:text-accent-teal group-hover:rotate-180 transition-all duration-700" />
          </button>
        </div>
      </motion.header>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {primaryMetrics.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.8, y: 30, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            transition={{ 
              duration: 0.8, 
              delay: i * 0.1,
              ease: [0.22, 1, 0.36, 1]
            }}
            whileHover={{ scale: 1.05, y: -5, transition: { duration: 0.2 } }}
          >
            <MetricCard
              {...stat}
              className="h-full border border-white/5 hover:border-accent-teal/30 bg-surface/50 backdrop-blur-sm shadow-xl"
            />
          </motion.div>
        ))}
      </div>

      <DemoCenter />

      {/* 3D Timeline Section */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <DashboardHolo positions={[
          { title: "TGE Event", amount: "100,000 CRDT" },
          { title: "Cliff End", amount: "25,000 CRDT" },
          { title: "Final Unlock", amount: "50,000 CRDT" }
        ]} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* TVL Growth Chart */}
        <motion.div 
          className="lg:col-span-2"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <Card variant="glass" className="h-full border border-white/5 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-2xl font-black uppercase italic tracking-tighter">TVL Expansion</CardTitle>
                <p className="text-xs text-secondary mt-1 font-medium">Net protocol liquidity growth over 6 months.</p>
              </div>
              <div className="flex gap-2">
                {['1D', '1W', '1M', 'ALL'].map((period) => (
                  <button 
                    key={period}
                    className={`px-3 py-1.5 text-[10px] font-black tracking-widest rounded-lg border transition-all ${
                      period === '1M' ? 'bg-accent-teal/20 border-accent-teal text-accent-teal' : 'bg-white/5 border-white/10 text-secondary hover:border-white/30'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer>
                {chartLoading ? (
                  <div className="h-[300px] flex items-center justify-center text-secondary redaction-text">Loading historical data...</div>
                ) : (
                  <AreaChart data={chartData?.data || []}>
                  <defs>
                    <linearGradient id="colorTvl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2EBEB5" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#2EBEB5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />
                  <Tooltip />
                  <Area type="monotone" dataKey="tvl" stroke="#2EBEB5" strokeWidth={2} fillOpacity={1} fill="url(#colorTvl)" />
                </AreaChart>
                )}
              </ChartContainer>
            </CardContent>
          </Card>
        </motion.div>
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          <Card variant="glass" className="h-full border border-white/5 shadow-2xl">
            <CardHeader>
              <CardTitle className="text-2xl font-black uppercase italic tracking-tighter">Live Feed</CardTitle>
              <p className="text-xs text-secondary mt-1 font-medium">Live protocol events from the Vestra Engine.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {recentActivity.length > 0 ? recentActivity.map((item: any, i: number) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + (i * 0.05) }}
                  className="flex items-center justify-between group cursor-pointer p-2 rounded-xl hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-surface border border-white/5 group-hover:border-accent-teal/30 transition-colors`}>
                      <Activity className="w-4 h-4 text-accent-teal" />
                    </div>
                    <div>
                      <div className="text-sm font-bold">{item.activity}</div>
                      <div className="text-[10px] text-secondary font-black tracking-widest uppercase">{item.timestamp}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono font-bold text-accent-teal">{item.amount}</div>
                    <div className="text-[10px] text-accent-cyan font-black uppercase tracking-widest">{item.status}</div>
                  </div>
                </motion.div>
              )) : (
                <p className="text-xs text-secondary italic">No recent activity detected.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Sovereign Data Acquisition Layer */}
      {address && (
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black uppercase italic tracking-tighter text-glow-teal redaction-text">Sovereign Data Mirror</h2>
              <p className="text-xs text-secondary mt-1 font-medium opacity-70">Decentralized asset tracking & local replication active.</p>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface/50 border border-white/5">
                 <div className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-ping" />
                 <span className="text-[10px] font-black tracking-widest uppercase text-accent-cyan">Syncing Graph v3</span>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {portfolioLoading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="h-[200px] rounded-3xl bg-surface/20 animate-pulse border border-white/5" />
              ))
            ) : portfolio?.vested?.length > 0 ? (
              portfolio.vested.map((asset: any, i: number) => (
                <SovereignAssetCard key={i} asset={asset} />
              ))
            ) : (
              <div className="lg:col-span-3 p-12 rounded-3xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                <ShieldCheck className="w-12 h-12 text-secondary opacity-20 mb-4" />
                <p className="text-sm text-secondary font-medium opacity-50">No sovereign vesting streams discovered for this wallet.</p>
                <button className="mt-4 text-[10px] font-black uppercase tracking-widest text-accent-teal hover:text-white transition-colors">Report Missing Contract</button>
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* Market Overview Table */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8 }}
      >
        <Card variant="solid" className="border border-white/5 shadow-2xl bg-surface/30 backdrop-blur-md">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-black uppercase italic tracking-tighter text-glow-cyan">Tokenomist Market Intelligence</CardTitle>
              <p className="text-xs text-secondary mt-1 font-medium italic">Institutional-grade vesting data and unlock schedules.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Unlock Date</span>
                <input 
                  type="text" 
                  placeholder="2026-..." 
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:border-accent-teal outline-none transition-all w-32 font-mono"
                  value={unlockFilter}
                  onChange={(e) => setUnlockFilter(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Min Size</span>
                <input 
                  type="number" 
                  placeholder="0.00" 
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:border-accent-teal outline-none transition-all w-24 font-mono"
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Valuation</span>
                <input 
                  type="text" 
                  placeholder="Search..." 
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:border-accent-teal outline-none transition-all w-32 font-mono"
                  value={valuationFilter}
                  onChange={(e) => setValuationFilter(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <AssetTable
              columns={[
                { header: "Asset", accessorKey: "asset" },
                { header: "Price", accessorKey: "price", align: "right", className: "font-mono" },
                { header: "Quantity", accessorKey: "quantity", align: "right", className: "font-mono text-accent-cyan" },
                { header: "Unlock Date", accessorKey: "unlockDate", align: "right", className: "font-mono" },
                { header: "Valuation", accessorKey: "valuation", align: "right", className: "font-mono text-accent-teal" }
              ]}
              data={marketData}
              loading={vestingLoading}
            />
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
