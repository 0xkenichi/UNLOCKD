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
  Globe
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { AssetTable } from "@/components/ui/AssetTable";
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
import { useMemo } from "react";

const chartData = [
  { name: "Jan", tvl: 4000 },
  { name: "Feb", tvl: 7500 },
  { name: "Mar", tvl: 12000 },
  { name: "Apr", tvl: 18500 },
  { name: "May", tvl: 24000 },
  { name: "Jun", tvl: 28400 },
];

export default function Dashboard() {
  const { address } = useAccount();
  const chainId = useChainId();
  
  // On-chain data
  const loanManager = getContract(chainId, 'loanManager');
  const usdc = getContract(chainId, 'usdc');

  const { data: loanCount } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loanCount',
    query: { enabled: !!loanManager }
  });

  const { data: usdcBalance } = useReadContract({
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

  const marketData = [
    { asset: "USDC", price: "$1.00", volume: "$1.2M", apy: "4.2%", trend: "up" },
    { asset: "VSTR", price: "$0.84", volume: "$450K", apy: "12.5%", trend: "up" },
    { asset: "ETH", price: "$2,840", volume: "$8.4M", apy: "3.1%", trend: "down" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-glow-teal">Protocol Overview</h1>
          <p className="text-secondary mt-1">Global credit health and platform metrics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-full bg-surface border border-white/10 flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-accent-teal animate-pulse" />
            <span className="text-secondary font-medium">Mainnet Active</span>
          </div>
          <button className="p-2 rounded-xl bg-surface border border-white/10 hover:border-accent-teal/50 transition-colors">
            <RefreshCcw className="w-4 h-4 text-secondary" />
          </button>
        </div>
      </header>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Total Value Locked"
          value={kpiLoading ? "..." : `$${(kpi?.growth?.tvlUsd || 42.8).toFixed(1)}M`}
          subValue="+12.4% from last week"
          indicator="up"
          percentage="+12.4%"
          icon={<Zap className="w-5 h-5" />}
          glow="teal"
        />
        <MetricCard
          label="Active Loans"
          value={loanCount ? loanCount.toString() : "0"}
          subValue={`${kpi?.credit?.loansCreated || 8} created last 24h`}
          indicator="neutral"
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <MetricCard
          label="Protocol Revenue"
          value={kpiLoading ? "..." : `$${(kpi?.revenue?.total || 142.5).toFixed(1)}K`}
          subValue="+5.2% yield agg"
          indicator="up"
          percentage="+5.2%"
          icon={<ShieldCheck className="w-5 h-5" />}
          glow="cyan"
        />
        <MetricCard
          label="My Wallet (USDC)"
          value={`${formattedUsdc}`}
          subValue="Connected Wallet"
          indicator="neutral"
          icon={<Globe className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* TVL Growth Chart */}
        <Card className="lg:col-span-2" variant="glass">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>TVL Expansion</CardTitle>
              <p className="text-xs text-secondary mt-1">Net protocol liquidity growth over 6 months.</p>
            </div>
            <div className="flex gap-2">
              {['1D', '1W', '1M', 'ALL'].map((period) => (
                <button 
                  key={period}
                  className={`px-3 py-1 text-[10px] rounded-lg border transition-all ${
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
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorTvl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2EBEB5" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#2EBEB5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#ffffff40" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#ffffff40" 
                  fontSize={10} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `$${val/1000}k`}
                />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="tvl" 
                  stroke="#2EBEB5" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorTvl)" 
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <p className="text-xs text-secondary mt-1">Live updates from the Vestra Engine.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {recentActivity.length > 0 ? recentActivity.map((item, i) => (
              <div key={i} className="flex items-center justify-between group cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-surface border border-white/5 group-hover:border-accent-teal/30 transition-colors`}>
                    <Activity className="w-4 h-4 text-accent-teal" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{item.activity}</div>
                    <div className="text-[10px] text-secondary">{item.timestamp}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono">{item.amount}</div>
                  <div className="text-[10px] text-accent-teal">{item.status}</div>
                </div>
              </div>
            )) : (
              <p className="text-xs text-secondary italic">No recent activity found.</p>
            )}
            <button className="w-full py-2.5 mt-4 rounded-xl bg-white/5 border border-white/5 text-xs text-secondary hover:bg-white/10 hover:text-foreground transition-all">
              View All History
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Market Overview Table */}
      <Card variant="solid">
        <CardHeader>
          <CardTitle>Market Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <AssetTable
            columns={[
              { header: "Asset", accessor: "asset" },
              { header: "Price", accessor: "price", align: "right" },
              { header: "24h Volume", accessor: "volume", align: "right" },
              { 
                header: "Current APY", 
                accessor: "apy", 
                align: "right",
                className: "text-accent-teal font-medium"
              },
              {
                header: "Trend",
                accessor: "trend",
                align: "right",
                render: (val) => (
                  <div className={`flex items-center justify-end gap-1 ${val === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                    {val === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingUp className="w-3 h-3 rotate-180" />}
                    <span className="text-xs capitalize">{val}</span>
                  </div>
                )
              }
            ]}
            data={marketData}
          />
        </CardContent>
      </Card>
    </div>
  );
}
