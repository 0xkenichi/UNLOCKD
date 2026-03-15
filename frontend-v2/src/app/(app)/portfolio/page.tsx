"use client";

import { useMemo } from "react";
import { 
  TrendingUp, 
  Wallet, 
  PieChart as PieChartIcon, 
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  ExternalLink,
  ShieldAlert,
  ShieldCheck
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

  const { data: usdcBalance, isLoading: usdcLoading } = useReadContract({
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

  // Fetch real loans from backend
  const { data: userLoans, isLoading: loansLoading } = useQuery({
    queryKey: ['userLoans', address],
    queryFn: () => (api as any).fetchLoans(address),
    enabled: !!address
  });

  const formattedUsdc = useMemo(() => {
    if (!usdcBalance) return "0.00";
    return (Number(usdcBalance) / 1e6).toFixed(2);
  }, [usdcBalance]);

  const activeVesting = useMemo(() => {
    const contracts = Array.isArray(vestedContracts) 
      ? vestedContracts 
      : (vestedContracts as any)?.items || [];
      
    return contracts.filter((item: any) => item.active).map((item: any) => ({
      asset: item.protocol || "Vested Token",
      protocol: item.chain || "Sepolia",
      quantity: item.quantity || "--",
      unlock: item.unlockTime ? new Date(item.unlockTime * 1000).toLocaleDateString() : "--",
      status: "Active",
      value: item.pv ? `$${(Number(item.pv) / 1e6).toFixed(2)}` : "--",
    }));
  }, [vestedContracts]);

  const activeLoans = useMemo(() => {
    const items = userLoans?.items || [];
    return items.map((loan: any) => ({
      id: loan.id,
      amount: `$${Number(loan.amount).toLocaleString()}`,
      apr: `${(loan.apr_bps / 100).toFixed(2)}%`,
      status: loan.status,
      date: new Date(loan.created_at).toLocaleDateString(),
      collateral: loan.collateral?.[0]?.source_id || "Vested Stream"
    }));
  }, [userLoans]);

  const totalDebt = useMemo(() => {
    const items = userLoans?.items || [];
    return items.reduce((acc: number, loan: any) => acc + Number(loan.amount), 0);
  }, [userLoans]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-display font-bold text-glow-teal">My Portfolio</h1>
        <p className="text-secondary mt-1">Unified view of your vested assets and credit positions.</p>
      </header>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Total Value Locked"
          value={vestedLoading ? "..." : `$${activeVesting.reduce((acc: number, item: any) => acc + Number(item.value.replace('$', '').replace(',', '')), 0).toLocaleString()}`}
          subValue="Vested assets valuation"
          trend="up"
          change={12.5}
          icon={<Wallet className="w-5 h-5 font-bold" />}
          glowColor="teal"
          className="bg-[#2EBEB5]/5 border-[#2EBEB5]/20"
        />
        <MetricCard
          label="Active Debt"
          value={loansLoading ? "..." : `$${totalDebt.toLocaleString()}`}
          subValue="Disbursed credit lines"
          trend={totalDebt > 0 ? "up" : "neutral"}
          icon={<ArrowUpRight className="w-5 h-5 font-bold" />}
          glowColor="red"
          className="bg-red-500/5 border-red-500/20"
        />
        <MetricCard
          label="Borrowing Power"
          value={vestedLoading ? "..." : `$${(activeVesting.reduce((acc: number, item: any) => acc + Number(item.value.replace('$', '').replace(',', '')), 0) * 0.65 - totalDebt).toLocaleString()}`}
          subValue="Available line of credit"
          trend="neutral"
          icon={<TrendingUp className="w-5 h-5 font-bold" />}
          glowColor="cyan"
          className="bg-accent-cyan/5 border-accent-cyan/20"
        />
        <MetricCard
          label="Trust Score"
          value="742"
          subValue="Vestra Protocol Health"
          trend="neutral"
          icon={<ShieldCheck className="w-5 h-5 font-bold" />}
          className="bg-white/5 border-white/10"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Asset Table */}
        <Card variant="solid">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Vesting Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <AssetTable
              columns={[
                { header: "Asset", accessorKey: "asset" },
                { header: "Protocol", accessorKey: "protocol" },
                { header: "Unlock Date", accessorKey: "unlock" },
                { 
                  header: "Value (USD)", 
                  accessorKey: "value", 
                  align: "right",
                  className: "text-accent-teal font-bold font-mono"
                },
              ]}
              data={activeVesting.length > 0 ? activeVesting : [
                { asset: "VSTR-LP", protocol: "Vestra", quantity: "12,500", value: "$10,500", unlock: "Dec 12, 2026", status: "Active" },
              ]}
            />
          </CardContent>
        </Card>

        {/* Loan Table */}
        <Card variant="solid">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Active Borrowings</CardTitle>
          </CardHeader>
          <CardContent>
            <AssetTable
              columns={[
                { header: "Amount", accessorKey: "amount" },
                { header: "APR", accessorKey: "apr" },
                { header: "Collateral", accessorKey: "collateral" },
                { header: "Date", accessorKey: "date" },
                { 
                  header: "Status", 
                  accessorKey: "status",
                  align: "right",
                  className: "text-accent-cyan font-bold uppercase text-[10px]"
                },
              ]}
              data={activeLoans.length > 0 ? activeLoans : [
                { amount: "No active loans", apr: "--", collateral: "--", date: "--", status: "--" }
              ]}
            />
          </CardContent>
        </Card>
      </div>

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
