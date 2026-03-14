"use client";

import { useMemo } from "react";
import { 
  TrendingUp, 
  Wallet, 
  PieChart as PieChartIcon, 
  Calendar,
  ArrowUpRight,
  ExternalLink,
  ShieldAlert
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
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ResponsiveContainer
} from "recharts";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getContract, loanManagerAbi, usdcAbi } from "@/config/contracts";
import { api } from "@/utils/api";

const performanceData = [
  { name: "Mon", value: 45000 },
  { name: "Tue", value: 52000 },
  { name: "Wed", value: 48000 },
  { name: "Thu", value: 61000 },
  { name: "Fri", value: 59000 },
  { name: "Sat", value: 68000 },
  { name: "Sun", value: 72400 },
];

const allocationData = [
  { name: "Locked VSTR", value: 45, color: "#2EBEB5" },
  { name: "Vested USDC", value: 25, color: "#40E0FF" },
  { name: "Liquidity Pools", value: 20, color: "#1E2A44" },
  { name: "Staked Assets", value: 10, color: "#ffffff20" },
];

const unlockData = [
  { month: "Jul", amount: 12000 },
  { month: "Aug", amount: 15000 },
  { month: "Sep", amount: 8000 },
  { month: "Oct", amount: 22000 },
  { month: "Nov", amount: 18000 },
  { month: "Dec", amount: 12000 },
];

export default function Portfolio() {
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

  // Fetch vested contracts from backend
  const { data: vestedContracts, isLoading: vestedLoading } = useQuery({
    queryKey: ['vestedContracts', address],
    queryFn: () => api.fetchVestedContracts({ walletAddress: address }),
    enabled: !!address
  });

  const formattedUsdc = useMemo(() => {
    if (!usdcBalance) return "0.00";
    return (Number(usdcBalance) / 1e6).toFixed(2);
  }, [usdcBalance]);

  const activeLoans = useMemo(() => {
    if (!vestedContracts) return [];
    return vestedContracts.filter((item: any) => item.active).map((item: any, idx: number) => ({
      asset: item.protocol || "Vested Token",
      protocol: item.chain || "Sepolia",
      quantity: item.quantity || "--",
      unlock: item.unlockTime ? new Date(item.unlockTime * 1000).toLocaleDateString() : "--",
      status: "Active",
      value: item.pv ? `$${(Number(item.pv) / 1e6).toFixed(2)}` : "--",
    }));
  }, [vestedContracts]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-display font-bold text-glow-teal">My Portfolio</h1>
        <p className="text-secondary mt-1">Unified view of your vested assets and credit positions.</p>
      </header>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Total Portfolio Value"
          value={`$${formattedUsdc}`}
          subValue="+8.2% vs last month"
          indicator="up"
          percentage="+8.2%"
          icon={<Wallet className="w-5 h-5" />}
          glow="teal"
        />
        <MetricCard
          label="Vested Collateral"
          value={vestedLoading ? "..." : `$${(activeLoans.length * 1500).toLocaleString()}`}
          subValue="Locked in 4 protocols"
          indicator="neutral"
          icon={<PieChartIcon className="w-5 h-5" />}
        />
        <MetricCard
          label="Available Liquidity"
          value="$24,500"
          subValue="Borrowable against vest"
          indicator="up"
          percentage="+1.5%"
          icon={<TrendingUp className="w-5 h-5" />}
          glow="cyan"
        />
        <MetricCard
          label="Health Factor"
          value="2.84"
          subValue="Liquidation risk: Low"
          indicator="neutral"
          icon={<ShieldAlert className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance Chart */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Portfolio Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer>
              <AreaChart data={performanceData}>
                <defs>
                  <linearGradient id="performanceGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#40E0FF" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#40E0FF" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#40E0FF" strokeWidth={2} fill="url(#performanceGlow)" />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Asset Allocation */}
        <Card variant="glass">
          <CardHeader>
            <CardTitle>Asset Allocation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col md:flex-row items-center justify-around gap-8">
            <div className="h-[200px] w-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocationData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {allocationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-4">
              {allocationData.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <div className="text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-secondary ml-auto">{item.value}%</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Asset Table */}
      <Card variant="solid">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Vesting Positions</CardTitle>
          <button className="text-xs text-accent-teal hover:underline flex items-center gap-1">
            Browse Market <ExternalLink className="w-3 h-3" />
          </button>
        </CardHeader>
        <CardContent>
          <AssetTable
            columns={[
              { header: "Asset", accessor: "asset" },
              { header: "Protocol", accessor: "protocol" },
              { header: "Quantity", accessor: "quantity", align: "right" },
              { header: "Estimated Value", accessor: "value", align: "right" },
              { header: "Unlock Date", accessor: "unlock", align: "right" },
              { 
                header: "Status", 
                accessor: "status",
                render: (val) => (
                  <div className="px-2 py-0.5 rounded-full bg-accent-teal/10 border border-accent-teal/20 text-[10px] text-accent-teal inline-block">
                    {val}
                  </div>
                )
              }
            ]}
            data={activeLoans.length > 0 ? activeLoans : [
              { asset: "VSTR-LP", protocol: "Vestra", quantity: "12,500", value: "$10,500", unlock: "Dec 12, 2026", status: "Active" },
              { asset: "ASI", protocol: "ASI Chain", quantity: "85,000", value: "$42,000", unlock: "Jan 15, 2027", status: "Active" },
            ]}
          />
        </CardContent>
      </Card>

      {/* Projection Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card variant="glass" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vesting Unlock Projection</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer>
              <BarChart data={unlockData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="month" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v/1000}k`} />
                <Tooltip />
                <Bar dataKey="amount" fill="#2EBEB5" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
        
        <Card variant="glass" className="flex flex-col justify-center items-center text-center space-y-4 p-8">
          <div className="w-16 h-16 rounded-full bg-accent-teal/20 flex items-center justify-center border border-accent-teal/30">
            <Calendar className="w-8 h-8 text-accent-teal" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Next Major Unlock</h3>
            <p className="text-secondary text-sm mt-1">Prepare your liquidity strategy.</p>
          </div>
          <div className="text-3xl font-display font-bold text-glow-cyan">July 14, 2026</div>
          <p className="text-xs text-secondary">VSTR Global TGE Cliff End</p>
          <button className="w-full py-3 rounded-xl bg-accent-teal text-background font-bold text-sm hover:opacity-90 transition-all mt-4">
            Optimize Strategy
          </button>
        </Card>
      </div>
    </div>
  );
}
