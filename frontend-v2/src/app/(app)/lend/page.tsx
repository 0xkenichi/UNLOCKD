"use client";

import { useMemo } from "react";
import { 
  Plus, 
  TrendingUp, 
  ShieldCheck, 
  Activity, 
  ArrowUpRight,
  Info,
  DollarSign,
  PieChart as PieChartIcon
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AssetTable } from "@/components/ui/AssetTable";
import { useAccount, useChainId, useReadContract, useWriteContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getContract, lendingPoolAbi } from "@/config/contracts";
import { api } from "@/utils/api";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { StakeModal } from "@/components/lend/StakeModal";
import { ZKShield } from "@/components/stealth/ZKShield";
import { useState } from "react";
import { formatUnits } from "viem";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from "recharts";

// Historical APY placeholder (can be expanded later with real historical data)

export default function Lend() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [isStakeModalOpen, setIsStakeModalOpen] = useState(false);

  // On-chain data
  const lendingPool = getContract(chainId, 'lendingPool');

  const { data: totalDeposits } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'totalDeposits',
    query: { enabled: !!lendingPool }
  });

  // Simplified: In a real app we'd fetch the count of stakes first or more robustly
  const { data: userStakes } = useReadContract({
    address: lendingPool,
    abi: lendingPoolAbi,
    functionName: 'userStakes',
    args: [address!, BigInt(0)],
    query: { enabled: !!address && !!lendingPool }
  });

  // Backend data
  const { data: poolsData, isLoading: poolsLoading } = useQuery({
    queryKey: ['pools'],
    queryFn: () => api.fetchPools()
  });

  const { data: yieldHistory, isLoading: yieldLoading } = useQuery({
    queryKey: ['yieldHistory'],
    queryFn: () => api.fetchYieldHistory()
  });

  const [faucetLoading, setFaucetLoading] = useState(false);

  const handleFaucet = async () => {
    if (!address) return;
    setFaucetLoading(true);
    try {
      await api.faucetUsdc(address);
      alert("Testnet USDC faucet transaction submitted!");
    } catch (err: any) {
      alert(err.message || "Faucet failed");
    } finally {
      setFaucetLoading(false);
    }
  };

  const formattedTotalSupplied = useMemo(() => {
    if (!totalDeposits) return "0.00";
    return (Number(totalDeposits) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2 });
  }, [totalDeposits]);

  const marketMetrics = useMemo(() => {
    if (!poolsData?.items || poolsData.items.length === 0) return { apy: "0.00", activeLenders: 0, health: "100" };
    const items = poolsData.items;
    const avgApy = items.reduce((acc: number, p: any) => acc + parseFloat(p.apy || "0"), 0) / items.length;
    const totalLenders = items.reduce((acc: number, p: any) => acc + (p.participantCount || 0), 0);
    return {
      apy: isNaN(avgApy) ? "0.00" : avgApy.toFixed(2),
      activeLenders: totalLenders,
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
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-glow-teal">Capital Markets</h1>
          <p className="text-secondary mt-1">Supply liquidity to verified vesting-collateralized pools.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleFaucet}
            disabled={faucetLoading || !address}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-secondary font-bold hover:bg-white/10 transition-all disabled:opacity-50"
          >
            {faucetLoading ? <Activity className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
            <span>Get Testnet USDC</span>
          </button>
          <button 
            onClick={() => setIsStakeModalOpen(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-accent-teal text-background font-bold hover:opacity-90 transition-all shadow-[0_0_20px_rgba(46,190,181,0.2)]"
          >
            <Plus className="w-5 h-5" />
            <span>New Stake</span>
          </button>
        </div>
      </header>

      {/* Market Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          label="Global TVL (Lending)"
          value={<ZKShield variant="glitch">{`$${formattedTotalSupplied}`}</ZKShield>}
          subValue="+4.2% from yesterday"
          trend="up"
          change={4.2}
          icon={<DollarSign className="w-5 h-5" />}
          glowColor="teal"
          className="bg-accent-teal/5 border-accent-teal/20"
        />
        <MetricCard
          label="Average Yield"
          value={<ZKShield variant="blur">{`${marketMetrics.apy}%`}</ZKShield>}
          subValue="Cross-protocol base APY"
          trend="up"
          change={0.15}
          icon={<TrendingUp className="w-5 h-5" />}
          className="bg-white/5 border-white/10"
        />
        <MetricCard
          label="Protocol Health"
          value={`${marketMetrics.health}%`}
          subValue="Collateralization Ratio"
          trend="neutral"
          icon={<ShieldCheck className="w-5 h-5" />}
          className="bg-accent-cyan/5 border-accent-cyan/20"
        />
        <MetricCard
          label="Active Lenders"
          value={marketMetrics.activeLenders.toString()}
          subValue={`Across ${poolsData?.items?.length || 0} pools`}
          trend="neutral"
          icon={<Activity className="w-5 h-5" />}
          className="bg-white/5 border-white/10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Yield History */}
        <Card className="lg:col-span-2" variant="glass">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Yield Performance</CardTitle>
              <p className="text-xs text-secondary mt-1">Historical APY for USDC lending pools.</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-white/10 text-xs">
              <span className="text-secondary">Market Avg:</span>
              <span className="text-accent-teal font-bold">{marketMetrics.apy}%</span>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer height={260}>
              {yieldLoading ? (
                <div className="h-full flex items-center justify-center text-secondary text-xs">Loading performance data...</div>
              ) : (
                <AreaChart data={yieldHistory?.data || []}>
                <defs>
                  <linearGradient id="yieldGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2EBEB5" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#2EBEB5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v: any) => `${v}%`} />
                <Tooltip />
                <Area type="monotone" dataKey="apy" stroke="#2EBEB5" strokeWidth={2} fill="url(#yieldGlow)" />
              </AreaChart>
              )}
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Global Strategy */}
        <Card variant="glass" className="bg-gradient-to-br from-accent-teal/5 to-transparent">
          <CardHeader>
            <CardTitle>Strategy Optimizer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 rounded-full border-4 border-accent-teal/30 border-t-accent-teal flex items-center justify-center relative">
                <span className="text-xl font-bold font-display">85%</span>
                <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-accent-teal text-background">
                  <PieChartIcon className="w-3 h-3" />
                </div>
              </div>
              <div>
                <h4 className="font-bold">Aggressive Yield</h4>
                <p className="text-xs text-secondary mt-1">Currently optimizing for maximum return across global VESTRA pools.</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-secondary">Est. Monthly Earn</span>
                <span className="font-bold text-accent-teal">$1,240.50</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-secondary">Real-time Gas Est.</span>
                <span className="font-bold">$2.41</span>
              </div>
            </div>

            <button className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 group">
              <span>View Active Assets</span>
              <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* My Positions */}
      {address && (
        <Card variant="solid" className="border-accent-teal/20">
          <CardHeader>
            <CardTitle className="text-accent-teal flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Your Active Stakes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AssetTable
              columns={[
                { header: "Principal", accessorKey: "principal" },
                { header: "APY", accessorKey: "apy", align: "right" },
                { header: "Ends In", accessorKey: "timeLeft", align: "right" },
                { header: "Accrued Yield", accessorKey: "yield", align: "right", className: "text-accent-teal" },
                { header: "Action", accessorKey: "action", align: "right" }
              ] as any}
              data={userStakes && userStakes[6] ? [
                {
                  principal: `${formatUnits(userStakes[0], 6)} USDC`,
                  apy: `${Number(userStakes[1])/100}%`,
                  timeLeft: `${Math.max(0, Math.floor((Number(userStakes[3]) - Date.now()/1000) / 86400))} Days`,
                  yield: <ZKShield variant="glitch">$42.85</ZKShield>, 
                  action: <div className="flex gap-2 justify-end">
                    <button className="px-3 py-1 rounded bg-accent-teal/10 text-accent-teal text-[10px] font-bold border border-accent-teal/20 hover:bg-accent-teal/20 transition-all">Harvest</button>
                    <button className="px-3 py-1 rounded bg-white/5 text-secondary text-[10px] font-bold border border-white/10 hover:bg-white/10 transition-all">Manage</button>
                  </div>
                }
              ] : []}
            />
          </CardContent>
        </Card>
      )}

      {/* Available Pools */}
      <Card variant="solid">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Verified Lending Pools</CardTitle>
            <p className="text-xs text-secondary mt-1">Direct access to risk-assessed capital markets.</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold text-secondary bg-white/5">USDC Only</button>
            <button className="px-3 py-1.5 rounded-lg border border-white/10 text-[10px] font-bold text-secondary">High Yield</button>
          </div>
        </CardHeader>
        <CardContent>
          <AssetTable
            columns={[
              { header: "Pool Name", accessorKey: "name" },
              { header: "Total Capacity", accessorKey: "capacity", align: "right" },
              { header: "Utilization", accessorKey: "utilization", align: "right" },
              { 
                header: "Base APY", 
                accessorKey: "apy", 
                align: "right",
                className: "text-accent-teal font-bold"
              },
              { 
                header: "Risk Profile", 
                accessorKey: (item: any) => (
                  <div className={`px-2 py-0.5 rounded-full text-[10px] inline-block border ${
                    item.risk === 'Low' ? 'bg-green-400/10 border-green-400/20 text-green-400' : 'bg-yellow-400/10 border-yellow-400/20 text-yellow-400'
                  }`}>
                    {item.risk}
                  </div>
                )
              },
              {
                header: "Action",
                accessorKey: (item: any) => (
                  <button className="text-xs font-bold text-accent-teal hover:underline px-4">
                    Supply
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
      />
    </div>
  );
}
