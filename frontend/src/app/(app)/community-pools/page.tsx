"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { 
  useAccount, 
  useChainId, 
  useWaitForTransactionReceipt, 
  useWriteContract,
  useReadContract
} from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Shield, Users, Zap, Coins, ArrowRight, Plus, RefreshCw, Loader2, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { AssetTable } from '@/components/ui/AssetTable';
import { MetricCard } from '@/components/ui/MetricCard';
import { getContract, lendingPoolAbi, usdcAbi } from '@/config/contracts';
import { api } from '@/utils/api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const USDC_DECIMALS = 6;

const STATE_COLORS: Record<string, string> = {
  FUNDRAISING: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10',
  ACTIVE: 'text-accent-teal border-accent-teal/30 bg-accent-teal/10',
  REFUNDING: 'text-accent-orange border-accent-orange/30 bg-accent-orange/10',
  CLOSED: 'text-secondary border-white/10 bg-white/5'
};

export default function CommunityPoolsPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const lendingPool = getContract(chainId, 'lendingPool');
  const usdc = getContract(chainId, 'usdc');

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [selectedPoolDetails, setSelectedPoolDetails] = useState<any>(null);

  // Form State
  const [createName, setCreateName] = useState('Community Builders Fund');
  const [createTarget, setCreateTarget] = useState('2000');
  const [createMax, setCreateMax] = useState('2500');
  const [createDeadlineHours, setCreateDeadlineHours] = useState('24');
  const [createBuildingWeight, setCreateBuildingWeight] = useState(true);

  const [approveAmount, setApproveAmount] = useState('1000');
  const [contributionAmount, setContributionAmount] = useState('500');
  const [buildingUnits, setBuildingUnits] = useState('100');
  const [rewardAmount, setRewardAmount] = useState('100');

  // Contract Interactions
  const { data: approveHash, writeContract: writeApprove, isPending: approvePending } = useWriteContract();
  const { data: actionHash, writeContract: writeAction, isPending: actionPending } = useWriteContract();

  const { isLoading: approveMining } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: actionMining, isSuccess: actionConfirmed } = useWaitForTransactionReceipt({ hash: actionHash });

  const loadPools = async () => {
    setLoading(true);
    try {
      const data = await api.fetchCommunityPools({ walletAddress: address });
      setItems(data || []);
      if (!selectedPoolId && data?.length) setSelectedPoolId(String(data[0].poolId));
    } catch (err: any) {
      toast.error("Failed to load community pools.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPools(); }, [address]);
  useEffect(() => { if (actionConfirmed) loadPools(); }, [actionConfirmed]);

  useEffect(() => {
    if (!selectedPoolId) {
        setSelectedPoolDetails(null);
        return;
    }
    const fetchDetails = async () => {
        try {
            const data = await api.fetchCommunityPool(selectedPoolId!, address);
            setSelectedPoolDetails(data);
        } catch {}
    };
    fetchDetails();
  }, [selectedPoolId, address, actionConfirmed]);

  const handleApprove = () => {
    if (!usdc || !lendingPool) return;
    writeApprove({
        address: usdc,
        abi: usdcAbi,
        functionName: 'approve',
        args: [lendingPool, parseUnits(approveAmount, USDC_DECIMALS)]
    });
  };

  const handleCreate = () => {
    if (!lendingPool) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(createDeadlineHours) * 3600);
    writeAction({
        address: lendingPool,
        abi: lendingPoolAbi as any,
        functionName: 'createCommunityPool',
        args: [
            createName,
            parseUnits(createTarget, USDC_DECIMALS),
            parseUnits(createMax, USDC_DECIMALS),
            deadline,
            createBuildingWeight
        ]
    });
  };

  const executeAction = (fn: string, args: any[]) => {
    if (!lendingPool || !selectedPoolId) return;
    writeAction({
        address: lendingPool,
        abi: lendingPoolAbi as any,
        functionName: fn,
        args: [BigInt(selectedPoolId), ...args]
    });
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter text-white flex items-center gap-3">
            <Users className="w-8 h-8 text-accent-cyan" />
            Social Lending
          </h1>
          <p className="text-xs text-secondary font-medium italic opacity-70 mt-1 max-w-xl">
            Syndicate capital with your community. Reach targets to activate protocol-wide lending and share automated rewards.
          </p>
        </div>
        <div className="flex gap-2">
            <div className="flex flex-col items-end">
                <span className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Global Ecosystem</span>
                <span className="text-sm font-mono font-black text-accent-cyan tracking-tighter">{items.length} ACTIVE POOLS</span>
            </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: List and Creation */}
        <div className="lg:col-span-2 space-y-8">
          <Card variant="glass" className="bg-surface/30 border border-white/5">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-black uppercase italic tracking-tighter">Community Registry</CardTitle>
                <button onClick={loadPools} className="p-2 rounded-xl bg-white/5 hover:border-accent-cyan transition-all">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                </button>
            </CardHeader>
            <CardContent>
                <AssetTable 
                    onRowClick={(item) => setSelectedPoolId(String(item.poolId))}
                    columns={[
                        { header: "Identity", accessorKey: (item) => (
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-black italic text-accent-cyan">#{item.poolId}</div>
                                <span className="font-black uppercase italic text-white tracking-widest text-[11px]">{item.name || 'Anonymous Pool'}</span>
                            </div>
                        )},
                        { header: "Status", accessorKey: (item) => (
                            <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black tracking-widest ${STATE_COLORS[item.stateLabel] || STATE_COLORS.CLOSED}`}>
                                {item.stateLabel}
                            </span>
                        )},
                        { header: "Progress", accessorKey: (item) => (
                            <div className="flex flex-col gap-1 w-32">
                                <div className="flex justify-between text-[9px] font-mono text-secondary">
                                    <span>{Math.round((Number(item.totalContributed) / Number(item.targetAmount)) * 100)}%</span>
                                    <span>${formatUnits(item.targetAmount, 6)}</span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-accent-cyan" style={{ width: `${Math.min(100, (Number(item.totalContributed) / Number(item.targetAmount)) * 100)}%` }} />
                                </div>
                            </div>
                        )}
                    ]}
                    data={items}
                    loading={loading}
                />
            </CardContent>
          </Card>

          <Card variant="glass" className="border-white/10 bg-surface/50">
            <CardHeader>
                <CardTitle className="text-xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                    <Plus className="w-5 h-5 text-accent-cyan" />
                    Initialize New Syndicate
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Syndicate Name</label>
                        <input className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-accent-cyan outline-none" value={createName} onChange={e => setCreateName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Target (USDC)</label>
                        <input className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-accent-cyan outline-none" value={createTarget} onChange={e => setCreateTarget(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Maximum Cap (USDC)</label>
                        <input className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white outline-none" value={createMax} onChange={e => setCreateMax(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Deadline (Hours)</label>
                        <input className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm font-mono text-white outline-none" value={createDeadlineHours} onChange={e => setCreateDeadlineHours(e.target.value)} />
                    </div>
                </div>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-accent-cyan/5 border border-accent-cyan/10">
                    <input type="checkbox" className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent-cyan" checked={createBuildingWeight} onChange={e => setCreateBuildingWeight(e.target.checked)} />
                    <div>
                        <div className="text-xs font-black uppercase text-accent-cyan tracking-widest">Weighted by Building Units</div>
                        <div className="text-[10px] text-secondary font-medium">Rewards will favor participants with larger on-chain footprints.</div>
                    </div>
                </div>
                <button 
                    onClick={handleCreate}
                    disabled={actionPending || actionMining}
                    className="w-full py-4 bg-accent-cyan text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all shadow-glow-cyan"
                >
                    {(actionPending || actionMining) ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Launch Community Pool'}
                </button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Actions and Detail */}
        <div className="space-y-8">
            <Card variant="glass" className="bg-surface/30 border border-white/5">
                <CardHeader>
                    <CardTitle className="text-sm font-black uppercase italic tracking-widest text-secondary flex items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Operation Center
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Approve Allowance</label>
                        <div className="flex gap-2">
                            <input className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs font-mono outline-none" value={approveAmount} onChange={e => setApproveAmount(e.target.value)} />
                            <button onClick={handleApprove} disabled={approvePending || approveMining} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-accent-cyan transition-all">
                                {approvePending || approveMining ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Auth'}
                            </button>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-white/5 space-y-6">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-50">Target Pool</span>
                            <span className="text-lg font-black italic uppercase tracking-tighter text-white">
                                {selectedPoolDetails ? `${selectedPoolDetails.name} (#${selectedPoolDetails.poolId})` : 'Select a Pool'}
                            </span>
                        </div>

                        {selectedPoolDetails && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] font-black text-secondary uppercase opacity-50">My Rewards</div>
                                        <div className="text-sm font-mono font-bold text-accent-teal">${formatUnits(selectedPoolDetails.pendingRewards || BigInt(0), 6)}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                                        <div className="text-[9px] font-black text-secondary uppercase opacity-50">Rewards Funded</div>
                                        <div className="text-sm font-mono font-bold text-white">${formatUnits(selectedPoolDetails.totalRewardFunded || BigInt(0), 6)}</div>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <input className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono outline-none text-accent-cyan" placeholder="CONTRIBUTION AMOUNT" value={contributionAmount} onChange={e => setContributionAmount(e.target.value)} />
                                    <input className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono outline-none" placeholder="BUILDING UNITS" value={buildingUnits} onChange={e => setBuildingUnits(e.target.value)} />
                                    <button onClick={() => executeAction('contributeToCommunityPool', [parseUnits(contributionAmount, 6), BigInt(buildingUnits)])} className="w-full py-3 bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan font-black uppercase tracking-widest rounded-xl hover:bg-accent-cyan hover:text-background transition-all text-[10px]">
                                        Contribute Capital
                                    </button>
                                </div>

                                <div className="space-y-3 pt-4 border-t border-white/5">
                                    <div className="text-[9px] font-black text-secondary uppercase opacity-50">Secondary Actions</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => executeAction('claimCommunityPoolRewards', [])} className="py-2.5 bg-accent-teal/10 border border-accent-teal/20 text-accent-teal font-black uppercase tracking-widest rounded-lg text-[9px] hover:bg-accent-teal hover:text-background transition-all">Claim Rewards</button>
                                        <button onClick={() => executeAction('claimCommunityPoolRefund', [])} className="py-2.5 bg-accent-orange/10 border border-accent-orange/20 text-accent-orange font-black uppercase tracking-widest rounded-lg text-[9px] hover:bg-accent-orange hover:text-background transition-all">Claim Refund</button>
                                    </div>
                                    <button onClick={() => executeAction('closeCommunityPool', [])} className="w-full py-2.5 bg-accent-red/10 border border-accent-red/20 text-accent-red font-black uppercase tracking-widest rounded-lg text-[9px] hover:bg-accent-red hover:text-white transition-all">Terminate Pool</button>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
