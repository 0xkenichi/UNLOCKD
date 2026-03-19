'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { 
  Play, 
  RefreshCw, 
  Layers, 
  TrendingUp, 
  Users, 
  Lock, 
  Zap, 
  ShieldCheck,
  Search,
  ChevronRight,
  Plus,
  Trash2
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

// Types
interface Allocation {
  id: string;
  name: string;
  amount: number;
  cliffMonths: number;
  totalDurationMonths: number;
  network: string;
  custodyMode: 'managed' | 'self';
  projectName?: string;
}

// Global Market Constants
const GLOBAL_VESTED_TOTAL = 1.35; // Trillion
const CAT1_LIVE = 1.0;
const CAT2_UNLAUNCHED = 0.35;

interface PricePoint {
  time: number;
  price: number;
}

interface Agent {
  id: number;
  bias: number; // -1 (bearish) to 1 (bullish)
  aggression: number; // 0 to 1
  balance: number;
}

const NETWORKS = ['Ethereum', 'Solana', 'Base', 'Vestra Protocol', 'Arbitrum'];

import { useAccount, useWriteContract, useChainId, useWaitForTransactionReceipt } from 'wagmi';
import { api } from '@/utils/api';
import { demoFaucetAbi, getContract } from '@/config/contracts';
import { sepolia } from 'viem/chains';
import { toast } from 'react-hot-toast';

export default function AdvancedSimulator() {
  const { address } = useAccount();
  const [allocations, setAllocations] = useState<Allocation[]>([
    { id: '1', name: 'Seed Founder', amount: 1000000, cliffMonths: 6, totalDurationMonths: 48, network: 'Ethereum', custodyMode: 'self' }
  ]);
  const [activeAllocId, setActiveAllocId] = useState('1');
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentPrice, setCurrentPrice] = useState(1.00);
  const [generationHash, setGenerationHash] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const activeAlloc = useMemo(() => 
    allocations.find(a => a.id === activeAllocId) || allocations[0]
  , [allocations, activeAllocId]);

  const { data: receipt } = useWaitForTransactionReceipt({
    hash: generationHash as `0x${string}`,
  });

  useEffect(() => {
    if (receipt && activeAlloc.projectName && activeAlloc.network === 'Vestra Protocol') {
      // Associate name in backend
      // We use the tx hash as a reference if it's the first time
      api.associateVestingName(receipt.transactionHash, activeAlloc.projectName)
        .then(() => {
            toast.success(`Project "${activeAlloc.projectName}" assigned!`);
            window.dispatchEvent(new CustomEvent('refresh-portfolio'));
        })
        .catch(err => console.error("Naming failed:", err));
    }
  }, [receipt, activeAlloc.projectName, activeAlloc.network]);

  // Calculations based on modes
  const ltvRatio = activeAlloc.custodyMode === 'managed' ? 0.55 : 0.40;
  const netValueMul = activeAlloc.custodyMode === 'managed' ? 0.85 : 0.72;

  // Initialize Price Simulation
  const startSimulation = () => {
    setIsSimulating(true);
    setPriceHistory([{ time: 0, price: 1.00 }]);
    setCurrentPrice(1.00);
    
    // Create 50 agents
    const newAgents: Agent[] = Array.from({ length: 50 }).map((_, i) => ({
      id: i,
      bias: (Math.random() * 2) - 1,
      aggression: Math.random(),
      balance: Math.random() * 1000
    }));
    setAgents(newAgents);
  };

  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setPriceHistory(prev => {
        const last = prev[prev.length - 1];
        if (prev.length > 50) {
            setIsSimulating(false);
            return prev;
        }

        // Agent behavior logic
        let sentiment = 0;
        agents.forEach(agent => {
          // Add some randomness to bias
          const drift = (Math.random() * 0.2) - 0.1;
          sentiment += (agent.bias + drift) * agent.aggression;
        });

        // Price change based on collective sentiment + random noise
        const volatility = 0.05;
        const change = (sentiment / agents.length) * volatility + ((Math.random() * 0.04) - 0.02);
        const nextPrice = Math.max(0.1, last.price * (1 + change));
        
        setCurrentPrice(nextPrice);
        return [...prev, { time: last.time + 1, price: nextPrice }];
      });
    }, 150);

    return () => clearInterval(interval);
  }, [isSimulating, agents]);

  const generateContract = async () => {
    if (!address) {
      alert("Please connect your wallet to deploy mock vesting.");
      return;
    }
    
    const hash = '0x' + Math.random().toString(16).slice(2, 42);
    setGenerationHash(hash);
    
    try {
      // Map network to a symbol for the demo
      const symbol = activeAlloc.network === 'Solana' ? 'SOL' : 
                     (activeAlloc.network === 'Ethereum' ? 'ETH' : 
                     (activeAlloc.network === 'Base' ? 'USDC' : 'VCS'));
                     
      await api.generateVesting({
        wallet: address,
        symbol: symbol,
        amount: activeAlloc.amount.toString()
      });
      
      // Dispatch event to refresh portfolio and other pages
      window.dispatchEvent(new CustomEvent('refresh-portfolio'));
      window.dispatchEvent(new CustomEvent('refresh-loans'));
    } catch (err: any) {
      console.error("Failed to generate vesting:", err);
      alert(err.message || "Failed to persist vesting to backend");
    }
    
    setTimeout(() => setGenerationHash(null), 5000);
  };

  const handleOnChainDeploy = async () => {
    if (!address) {
        toast.error("Please connect your wallet first");
        return;
    }

    setIsDeploying(true);
    try {
        const faucetAddress = getContract(chainId || sepolia.id, 'demoFaucet');
        if (!faucetAddress || faucetAddress === '0x0000000000000000000000000000000000000000') {
            throw new Error("DemoFaucet not configured for this chain.");
        }

        const tx = await writeContractAsync({
            address: faucetAddress,
            abi: demoFaucetAbi,
            functionName: 'mintDemoPosition',
            args: [
                BigInt(activeAlloc.amount), 
                BigInt(activeAlloc.totalDurationMonths),
                BigInt(activeAlloc.cliffMonths)
            ],
        });

        setGenerationHash(tx);
        toast.success("Transaction submitted to Sepolia!");

        // Associate name in backend if provided
        if (activeAlloc.projectName) {
            // We'll trust the discovery scanner to find the address, 
            // but we can register the intent for this user.
            // For now, we'll wait for confirmation UI-side.
        }

        // Trigger refresh
        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('refresh-portfolio'));
        }, 5000);

    } catch (err: any) {
        console.error(err);
        toast.error(err.message || "Failed to deploy on-chain");
    } finally {
        setIsDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06080A] text-white p-6 md:p-12 overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent-teal/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent-cyan/10 blur-[100px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-accent-teal/10 border border-accent-teal/20 rounded-xl flex items-center justify-center">
                <Layers className="text-accent-teal w-5 h-5" />
              </div>
              <h1 className="text-3xl font-black uppercase tracking-tighter italic">Vestra Engine V2</h1>
            </div>
            <p className="text-secondary tracking-[0.15em] uppercase text-[10px] font-black">Advanced Risk Modeling • ${GLOBAL_VESTED_TOTAL}T Locked Inventory</p>
          </div>

          <div className="flex items-center gap-3">
             <button 
                onClick={startSimulation}
                disabled={isSimulating}
                className="px-6 py-3 bg-accent-teal text-background font-black uppercase text-xs tracking-widest rounded-xl hover:bg-accent-cyan transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(46,190,181,0.2)] disabled:opacity-50"
              >
                {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run Full Simulation
             </button>
             <button 
                onClick={handleOnChainDeploy}
                disabled={isDeploying || !address}
                className="px-6 py-3 bg-accent-cyan text-background font-black uppercase text-xs tracking-widest rounded-xl hover:bg-accent-teal transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(64,224,255,0.2)] disabled:opacity-50"
             >
                {isDeploying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Deploy to Sepolia
             </button>
             <button 
                onClick={generateContract}
                className="px-6 py-3 bg-white/5 border border-white/10 text-white font-black uppercase text-xs tracking-widest rounded-xl hover:bg-white/10 transition-all"
             >
                Quick Mock
             </button>
          </div>
        </header>

        <div className="grid grid-cols-12 gap-8">
          {/* Allocation Editor */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-accent-teal">Allocation Editor</h3>
                <button 
                    onClick={() => {
                        const id = Math.random().toString(36).slice(2, 9);
                        setAllocations([...allocations, { id, name: 'New Contributor', amount: 500000, cliffMonths: 0, totalDurationMonths: 24, network: 'Solana', custodyMode: 'self' }]);
                        setActiveAllocId(id);
                    }}
                    className="p-1.5 bg-accent-teal/10 rounded-lg hover:bg-accent-teal/20 transition-all"
                >
                    <Plus className="w-4 h-4 text-accent-teal" />
                </button>
              </div>

              <div className="space-y-4 mb-8 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                {allocations.map(alloc => (
                  <div 
                    key={alloc.id}
                    onClick={() => setActiveAllocId(alloc.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                        activeAllocId === alloc.id ? 'bg-accent-teal/10 border-accent-teal/30' : 'bg-white/5 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div>
                        <p className={`text-xs font-bold ${activeAllocId === alloc.id ? 'text-accent-teal' : 'text-gray-300'}`}>{alloc.name}</p>
                        <p className="text-[10px] text-gray-500">{alloc.amount.toLocaleString()} Tokens • {alloc.network}</p>
                    </div>
                    {allocations.length > 1 && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setAllocations(allocations.filter(a => a.id !== alloc.id)); if(activeAllocId === alloc.id) setActiveAllocId(allocations[0].id); }}
                            className="p-1.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-6 pt-6 border-t border-white/5">
                <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-white/5 mb-2">
                    <button 
                        onClick={() => setAllocations(prev => prev.map(a => a.id === activeAllocId ? {...a, custodyMode: 'self'} : a))}
                        className={`py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeAlloc.custodyMode === 'self' ? 'bg-white/10 text-white shadow-inner' : 'text-gray-500'}`}
                    >
                        Self-Custody
                    </button>
                    <button 
                        onClick={() => setAllocations(prev => prev.map(a => a.id === activeAllocId ? {...a, custodyMode: 'managed'} : a))}
                        className={`py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeAlloc.custodyMode === 'managed' ? 'bg-accent-teal/20 text-accent-teal shadow-inner border border-accent-teal/20' : 'text-gray-500'}`}
                    >
                        Managed
                    </button>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-secondary">Project Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Seed Funding A"
                    value={activeAlloc.projectName || ''} 
                    onChange={(e) => setAllocations(prev => prev.map(a => a.id === activeAllocId ? {...a, projectName: e.target.value} : a))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-teal/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-secondary">Token Amount</label>
                  <input 
                    type="number" 
                    value={activeAlloc.amount} 
                    onChange={(e) => setAllocations(prev => prev.map(a => a.id === activeAllocId ? {...a, amount: Number(e.target.value)} : a))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-teal/50"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-secondary">Cliff (Months)</label>
                        <input 
                            type="number" 
                            value={activeAlloc.cliffMonths} 
                            onChange={(e) => setAllocations(prev => prev.map(a => a.id === activeAllocId ? {...a, cliffMonths: Number(e.target.value)} : a))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-teal/50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-secondary">Duration (Months)</label>
                        <input 
                            type="number" 
                            value={activeAlloc.totalDurationMonths} 
                            onChange={(e) => setAllocations(prev => prev.map(a => a.id === activeAllocId ? {...a, totalDurationMonths: Number(e.target.value)} : a))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-teal/50"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-secondary">Deployment Network</label>
                  <select 
                    value={activeAlloc.network}
                    onChange={(e) => setAllocations(prev => prev.map(a => a.id === activeAllocId ? {...a, network: e.target.value} : a))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-teal/50 appearance-none"
                  >
                    {NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="glass-card p-6 bg-accent-teal/5 border-accent-teal/10">
                <div className="flex items-center gap-3 mb-4">
                    <TrendingUp className="text-accent-teal w-4 h-4" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-accent-teal">Engine DPV Output</h3>
                </div>
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <p className="text-[10px] font-black uppercase text-secondary mb-1">Estimated Net Value</p>
                        <p className="text-3xl font-black text-white">${(activeAlloc.amount * currentPrice * netValueMul).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase text-accent-cyan">Max Borrow (Safe)</p>
                        <p className="text-lg font-black text-accent-cyan">${(activeAlloc.amount * currentPrice * ltvRatio).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-gray-500 italic">
                        <span>LTV Cap: {Math.round(ltvRatio * 100)}%</span>
                        <span>Safety Mode: {activeAlloc.custodyMode.toUpperCase()}</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-accent-teal" style={{ width: `${netValueMul * 100}%` }} />
                    </div>
                </div>
            </div>
          </div>

          {/* Market Simulator */}
          <div className="col-span-12 lg:col-span-8 space-y-8">
            <div className="glass-card p-8 h-[500px] flex flex-col">
              <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-accent-cyan">Market Price Simulator</h3>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">Stochastic Model • 50 Active Trading Agents</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase text-secondary">Live Price</p>
                        <p className={`text-2xl font-black transition-colors ${priceHistory.length > 1 && currentPrice > priceHistory[priceHistory.length - 2]?.price ? 'text-green-400' : 'text-red-400'}`}>
                            ${currentPrice.toFixed(2)}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black uppercase text-secondary">Volatility</p>
                        <p className="text-2xl font-black">24.2%</p>
                    </div>
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceHistory}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#40E0FF" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#40E0FF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis 
                        dataKey="time" 
                        hide 
                    />
                    <YAxis 
                        domain={['auto', 'auto']} 
                        orientation="right" 
                        stroke="rgba(255,255,255,0.2)"
                        fontSize={10}
                        fontWeight="bold"
                        tickFormatter={(v) => `$${v.toFixed(2)}`}
                    />
                    <Tooltip 
                        contentStyle={{ background: '#0A0E1A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px' }}
                        itemStyle={{ color: '#40E0FF', fontWeight: 'bold' }}
                    />
                    <Area 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#40E0FF" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorPrice)" 
                        animationDuration={150}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8">
                <div className="glass-card p-6">
                    <h3 className="text-[10px] font-black uppercase text-secondary tracking-widest mb-6 flex items-center gap-2">
                        <Users className="w-4 h-4 text-accent-teal" />
                        Agent Distribution
                    </h3>
                    <div className="grid grid-cols-10 gap-2">
                        {agents.map(agent => (
                            <div 
                                key={agent.id}
                                className={`h-1.5 rounded-full transition-all duration-500 ${
                                    agent.bias > 0.3 ? 'bg-green-400' : 
                                    agent.bias < -0.3 ? 'bg-red-400' : 'bg-gray-600'
                                }`}
                                style={{ opacity: 0.3 + (agent.aggression * 0.7) }}
                            />
                        ))}
                    </div>
                    <div className="mt-4 flex justify-between text-[8px] font-black uppercase tracking-widest text-gray-500">
                        <span>50 Agents Active</span>
                        <span className="text-accent-teal">Random Walk Simulation</span>
                    </div>
                </div>

                <div className="glass-card p-6 bg-accent-cyan/5 border-accent-cyan/10">
                    <div className="flex items-center gap-3 mb-6">
                         <Zap className="text-accent-cyan w-4 h-4" />
                         <h3 className="text-xs font-black uppercase tracking-widest text-accent-cyan">Repayment Analytics</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Effective Interest (APR)</span>
                            <span className={`text-sm font-black ${activeAlloc.custodyMode === 'managed' ? 'text-accent-teal' : 'text-white'}`}>
                                {activeAlloc.custodyMode === 'managed' ? '4.5%' : '8.2%'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Managed Bonus</span>
                            <span className="text-sm font-black text-accent-cyan">
                                {activeAlloc.custodyMode === 'managed' ? '+$12,500' : '$0'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg border border-white/5">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Repayment Path</span>
                            <span className="text-sm font-black text-white">
                                {activeAlloc.custodyMode === 'managed' ? 'Auto-Settled (H-1)' : 'Manual Escrow'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center mt-2 px-1">
                             <div className="flex items-center gap-2">
                                <ShieldCheck className="w-3 h-3 text-accent-teal" />
                                <span className="text-[10px] font-bold text-accent-teal uppercase">Solvency Check</span>
                             </div>
                             <span className="text-[10px] font-bold text-gray-500 italic">Passed</span>
                        </div>
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deployment Animation Overlay */}
      <AnimatePresence>
        {generationHash && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-6 pointer-events-none"
            >
                <div className="bg-[#0A0E1A] border border-accent-teal/30 p-8 rounded-3xl shadow-[0_0_50px_rgba(46,190,181,0.2)] max-w-md w-full text-center relative pointer-events-auto">
                    <div className="w-20 h-20 bg-accent-teal/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="text-accent-teal w-10 h-10 animate-pulse" />
                    </div>
                    <h2 className="text-xl font-black uppercase tracking-tighter mb-2">Contract Immutable</h2>
                    <p className="text-xs text-secondary font-medium mb-6">Allocation successfully hashed and pinned to IPFS registry.</p>
                    <div className="bg-black/40 p-4 rounded-xl border border-white/10 flex items-center justify-between mb-4">
                        <span className="text-[10px] font-mono text-gray-500 overflow-hidden text-ellipsis whitespace-nowrap">{generationHash}</span>
                        <div className="px-2 py-0.5 rounded bg-accent-teal/20 text-accent-teal text-[8px] font-black uppercase">Active</div>
                    </div>
                    <div className="mt-8 pt-8 border-t border-white/5 flex flex-col md:flex-row gap-4">
                       <Link href="/borrow" className="flex-1">
                          <button className="w-full py-3 bg-accent-teal text-background font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-accent-cyan transition-all">
                             Go to Borrow
                          </button>
                       </Link>
                       <button onClick={() => setGenerationHash(null)} className="flex-1 py-3 bg-white/5 text-gray-400 font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-white/10 transition-all">
                          Dismiss
                       </button>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .glass-card {
            background: rgba(22, 27, 34, 0.5);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 20px;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.8);
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(46, 190, 181, 0.2);
            border-radius: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(46, 190, 181, 0.4);
        }
      `}</style>
    </div>
  );
}
