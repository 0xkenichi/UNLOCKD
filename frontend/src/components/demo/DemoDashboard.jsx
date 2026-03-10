// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import React, { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useMarketSimulation } from './useMarketSimulation.js';
import { formatUnits, parseUnits } from 'viem';
import { logSimulationEvent } from '../../utils/supabaseClient.js';
import DecryptedViewportText from '../common/DecryptedViewportText.jsx';
import { CONTRACTS, loanManagerAbi } from '../../utils/contracts.js';

const DURATIONS = {
    1: { label: '1 Month', days: 30, premiumBps: 50 },
    3: { label: '3 Months', days: 90, premiumBps: 150 },
    6: { label: '6 Months', days: 180, premiumBps: 300 },
    12: { label: '1 Year', days: 365, premiumBps: 700 }
};

// ── SUB-COMPONENT: Chaos Controls ───────────────────────────────────────────
const ChaosControls = ({ currentPrice, onPriceUpdate }) => {
    const [isProcessing, setIsProcessing] = useState(false);

    const handleBlackSwan = async () => {
        setIsProcessing(true);
        const oldPrice = currentPrice;
        const newPrice = oldPrice * 0.80;

        onPriceUpdate(newPrice);

        await logSimulationEvent('MARKET_GAP', {
            event_type: "BLACK_SWAN",
            price_before: oldPrice.toFixed(4),
            price_after: newPrice.toFixed(4),
            delta: (newPrice - oldPrice).toFixed(4),
            severity: "CRITICAL"
        });
        setTimeout(() => setIsProcessing(false), 1000);
    };

    const handleWhaleTrade = async () => {
        setIsProcessing(true);
        const oldPrice = currentPrice;
        const newPrice = oldPrice * 1.15;

        onPriceUpdate(newPrice);

        await logSimulationEvent('MARKET_GAP', {
            event_type: "FLASH_PUMP",
            price_before: oldPrice.toFixed(4),
            price_after: newPrice.toFixed(4),
            delta: (newPrice - oldPrice).toFixed(4),
            severity: "HIGH"
        });
        setTimeout(() => setIsProcessing(false), 1000);
    };

    return (
        <div className="p-4 bg-slate-900/80 border border-slate-700 rounded-xl backdrop-blur-md shadow-2xl mt-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                ASI Chaos Engine
            </h3>
            <div className="grid grid-cols-2 gap-3">
                <button
                    disabled={isProcessing}
                    onClick={handleBlackSwan}
                    className="group relative overflow-hidden px-4 py-3 bg-red-950/20 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-900/40 transition-all active:scale-95 disabled:opacity-50"
                >
                    <span className="relative z-10 font-mono text-[10px] font-bold">EXECUTE BLACK SWAN</span>
                </button>
                <button
                    disabled={isProcessing}
                    onClick={handleWhaleTrade}
                    className="group relative overflow-hidden px-4 py-3 bg-blue-950/20 border border-blue-500/50 text-blue-400 rounded-lg hover:bg-blue-900/40 transition-all active:scale-95 disabled:opacity-50"
                >
                    <span className="relative z-10 font-mono text-[10px] font-bold">INJECT WHALE TRADE</span>
                </button>
            </div>
        </div>
    );
};

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function DemoDashboard({ vestingContract }) {
    const {
        isRunning,
        startSimulation,
        injectMarketImpact,
        updateSimulationPrice,
        computeDPV,
        interestRateBps,
        metrics,
        priceHistory,
    } = useMarketSimulation();

    // Local Simulation States
    const { address } = useAccount();
    const [view, setView] = useState('BORROWER');
    const [lockedPercentage, setLockedPercentage] = useState(0);
    const [walletUSDC, setWalletUSDC] = useState(12000);
    const [debt, setDebt] = useState(0);
    const [status, setStatus] = useState('ACTIVE');
    const [accruedInterest, setAccruedInterest] = useState(0);
    const [auctionPool, setAuctionPool] = useState([]);
    const [seizedTokensTotal, setSeizedTokensTotal] = useState(0);
    const [durationMonths, setDurationMonths] = useState(1);
    const [daysRemaining, setDaysRemaining] = useState(30);
    const [isFastForwarding, setIsFastForwarding] = useState(false);
    const [isPrivacyEnabled, setIsPrivacyEnabled] = useState(true);

    const [portfolio, setPortfolio] = useState({ liquid: [], vested: [], loading: false });
    const [selectedVest, setSelectedVest] = useState(null);

    const chainId = useChainId();
    const contractAddresses = CONTRACTS[chainId] || CONTRACTS[11155111]; // Fallback to Sepolia

    const { data: hash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
    const { isLoading: isTxLoading, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({ hash });

    const fetchPortfolio = async () => {
        if (!address) return;
        setPortfolio(prev => ({ ...prev, loading: true }));
        try {
            const url = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
            const res = await fetch(`${url}/api/portfolio/${address}`);
            if (res.ok) {
                const data = await res.json();
                setPortfolio({ liquid: data.liquid || [], vested: data.vested || [], loading: false });

                if (data.vested && data.vested.length > 0 && !selectedVest) {
                    setSelectedVest(data.vested[0]);
                }

                const usdc = (data.liquid || []).find(t => t.symbol.includes('USDC'));
                if (usdc && !debt) {
                    setWalletUSDC(Number(usdc.formattedBalance));
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setPortfolio(prev => ({ ...prev, loading: false }));
        }
    };

    useEffect(() => {
        fetchPortfolio();
    }, [address]);

    useEffect(() => {
        if (isTxSuccess) {
            fetchPortfolio();
            // In a real app we'd also poll the indexer for the new loanId
            // but for the demo we'll just show the success state locally
        }
    }, [isTxSuccess]);

    useEffect(() => {
        if (!isRunning) startSimulation(1.0);
    }, []);

    // Derived Financial Metrics using MVP Logic
    const allocation = parseFloat(formatUnits(vestingContract?.allocation || '0', 6));
    const monthsToUnlock = durationMonths;

    const activeQuantity = address && selectedVest
        ? Number(selectedVest.formattedLocked)
        : allocation * (lockedPercentage / 100);

    // Compute DPV and Borrow Limit
    const { dpv, borrowLimit, timeDiscount, volMultiplier } = computeDPV(
        activeQuantity,
        metrics.safetyPrice,
        monthsToUnlock,
        0.5 // Default sigma for demo
    );

    const totalDebt = debt + accruedInterest;
    const healthFactor = totalDebt > 0 ? (dpv * 0.8) / totalDebt : Infinity;

    // ── Liquidation & Auction Logic ──────────────────────────────────────────
    const addToAuction = (amount, originalBorrower) => {
        const discountPrice = metrics.currentPrice * 0.85; // 15% discount
        setAuctionPool(prev => [{
            id: `auc_${Date.now()}`,
            token: vestingContract?.tokenSymbol || "VEST",
            amount,
            valuation: amount * metrics.currentPrice,
            buyNowPrice: amount * discountPrice,
            discount: "15%",
            borrower: originalBorrower
        }, ...prev]);
    };

    useEffect(() => {
        if (status !== 'ACTIVE' || debt === 0) return;
        if (healthFactor < 1.0) {
            addToAuction(allocation * (lockedPercentage / 100), 'DemoUser');
            setSeizedTokensTotal(prev => prev + (allocation * (lockedPercentage / 100)));
            setDebt(0);
            setAccruedInterest(0);
            setStatus('LIQUIDATED');
            setIsFastForwarding(false);
        }
    }, [healthFactor]);

    useEffect(() => {
        if (!isRunning || debt === 0 || status !== 'ACTIVE') return;
        const interval = setInterval(() => {
            const multiplier = isFastForwarding ? 10 : 1;
            const ticInterest = (debt * (metrics.borrowApr / 365 / 24 / 60 / 60)) * multiplier;
            setAccruedInterest(prev => prev + ticInterest);
        }, 1000);
        return () => clearInterval(interval);
    }, [isRunning, debt, metrics.borrowApr, status, isFastForwarding]);

    const handleBorrow = () => {
        if (address && selectedVest) {
            // Real On-Chain Borrowing
            const collateralId = BigInt(Math.floor(Date.now() / 1000)); // Simple unique ID
            const amount = parseUnits(Math.floor(borrowLimit).toString(), 6);
            const duration = BigInt(durationMonths * 30); // Approximate days

            writeContract({
                address: contractAddresses.loanManager,
                abi: loanManagerAbi,
                functionName: 'createLoan',
                args: [collateralId, selectedVest.vestingContract, amount, duration]
            });

            // Optimistic update for UI feel (debt set but disabled until tx success)
            setDebt(borrowLimit);
            setDaysRemaining(DURATIONS[durationMonths].days);
            injectMarketImpact(-0.02, "Loan Originated (Slippage)");
        } else {
            // Sandbox/Mock Borrow
            setDebt(borrowLimit);
            setWalletUSDC(prev => prev + borrowLimit);
            setDaysRemaining(DURATIONS[durationMonths].days);
            injectMarketImpact(-0.02, "Loan Originated (Slippage)");
        }
    };

    const handleFaucet = () => {
        if (!address) return alert("Connect wallet first");
        writeContract({
            address: contractAddresses.usdc,
            abi: ["function mint(address to, uint256 amount) public"],
            functionName: 'mint',
            args: [address, parseUnits("10000", 6)] // 10k USDC
        });
    };

    const handleRepay = () => {
        setWalletUSDC(prev => prev - totalDebt);
        setDebt(0);
        setAccruedInterest(0);
        setIsFastForwarding(false);
    };

    const handleBuyFromAuction = (item) => {
        if (walletUSDC < item.buyNowPrice) return alert("Insufficient USDC");
        setWalletUSDC(prev => prev - item.buyNowPrice);
        setAuctionPool(prev => prev.filter(a => a.id !== item.id));
        logSimulationEvent('auction_purchase', { item_id: item.id, profit: item.valuation - item.buyNowPrice });
        injectMarketImpact(0.01, `Protocol bad debt cleared via Auction Purchase`);
    };

    return (
        <div className={`command-center-layout p-4 lg:p-8 bg-black/95 text-white min-h-[90vh] selection:bg-blue-500/30`}>
            {/* ── TOP NAVIGATION & GLOBAL METRICS ───────────────────────────────── */}
            <div className="flex flex-col xl:flex-row justify-between items-stretch gap-6 mb-10">
                <div className="flex items-center gap-4 bg-slate-900/40 p-2 rounded-2xl border border-white/5 backdrop-blur-md">
                    <div className="px-6 flex flex-col justify-center border-r border-white/10 mr-2 min-w-[140px] text-center">
                        <span className="brand-waveforms text-3xl">VESTRA</span>
                    </div>
                    <button
                        className={`flex-1 xl:flex-none px-10 py-3 rounded-xl text-[11px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${view === 'BORROWER' ? 'bg-blue-600 shadow-lg shadow-blue-500/40 text-white' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                        onClick={() => setView('BORROWER')}
                    >
                        Operations
                    </button>
                    <button
                        className={`flex-1 xl:flex-none px-10 py-3 rounded-xl text-[11px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${view === 'LENDER' ? 'bg-blue-600 shadow-lg shadow-blue-500/40 text-white' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                        onClick={() => setView('LENDER')}
                    >
                        Auction
                        {auctionPool.length > 0 && <span className="ml-2 w-2 h-2 bg-red-500 rounded-full inline-block animate-pulse"></span>}
                    </button>
                    <div className="w-[1px] h-6 bg-white/10 mx-2 hidden xl:block"></div>
                    <button
                        className={`flex-1 xl:flex-none px-6 py-3 rounded-xl text-[10px] uppercase tracking-[0.2em] font-bold transition-all duration-300 border ${isPrivacyEnabled ? 'border-blue-500/50 text-blue-400 bg-blue-500/5' : 'border-white/10 text-slate-500 hover:text-white'}`}
                        onClick={() => setIsPrivacyEnabled(!isPrivacyEnabled)}
                        title="Toggle Stealth Privacy Mode"
                    >
                        {isPrivacyEnabled ? 'Stealth ON' : 'Stealth OFF'}
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                    <div className="stat-card p-4 flex flex-col justify-center items-center text-center">
                        <span className="stat-label text-[10px] mb-1">Borrow APR</span>
                        <DecryptedViewportText text={`${(metrics.borrowApr * 100).toFixed(2)}%`} decryptedClass="font-decrypted text-blue-400 text-2xl" encryptedClass="font-encrypted text-blue-900 text-2xl" />
                    </div>
                    <div className="stat-card p-4 flex flex-col justify-center items-center text-center border-l-0">
                        <span className="stat-label text-[10px] mb-1">Spot Price</span>
                        <DecryptedViewportText text={`$${metrics.currentPrice.toFixed(4)}`} decryptedClass="font-decrypted text-emerald-400 text-2xl" encryptedClass="font-encrypted text-emerald-900 text-2xl" />
                    </div>
                    <div className="stat-card p-4 flex flex-col justify-center items-center text-center">
                        <span className="stat-label text-[10px] mb-1">Utilization</span>
                        <DecryptedViewportText text={`${(metrics.utilization * 100).toFixed(1)}%`} decryptedClass="font-decrypted text-purple-400 text-2xl" encryptedClass="font-encrypted text-purple-900 text-2xl" />
                    </div>
                    <div className="stat-card p-4 flex flex-col justify-center items-center text-center relative group">
                        <span className="stat-label text-[10px] mb-1">Wallet USDC</span>
                        <DecryptedViewportText text={`$${walletUSDC.toLocaleString()}`} decryptedClass="font-decrypted text-slate-200 text-2xl" encryptedClass="font-encrypted text-slate-700 text-2xl" />

                        {address && (
                            <button
                                onClick={handleFaucet}
                                disabled={isWritePending || isTxLoading}
                                className="absolute -bottom-2 opacity-0 group-hover:opacity-100 transition-all bg-emerald-500 hover:bg-emerald-400 text-white text-[8px] font-black px-3 py-1 rounded-full shadow-lg z-20"
                            >
                                {isWritePending || isTxLoading ? 'MINTING...' : 'FAUCET +10K'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {view === 'BORROWER' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* ── LEFT ZONE: MARKET SURVEILLANCE ───────────────────────────── */}
                    <div className="lg:col-span-3 space-y-6">
                        <div className="holo-card p-0 overflow-hidden border-slate-800/50 bg-slate-900/20">
                            <div className="px-5 py-4 border-bottom border-slate-800/50 flex items-center justify-between">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping"></span>
                                    Live Stream
                                </h3>
                                <span className="text-[9px] stealth-hud text-slate-600">VOL: HIGH</span>
                            </div>
                            <div className="h-[240px] w-full p-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={priceHistory}>
                                        <CartesianGrid strokeDasharray="2 2" vertical={false} stroke="#1e293b" />
                                        <XAxis dataKey="time" hide />
                                        <YAxis domain={['auto', 'auto']} hide />
                                        <Tooltip
                                            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '10px' }}
                                            itemStyle={{ color: '#3b82f6' }}
                                        />
                                        <Line type="stepAfter" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        <ReferenceLine y={metrics.twap} stroke="#64748b" strokeDasharray="3 3 opacity-50" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="px-5 py-4 bg-blue-500/5 border-t border-slate-800/50">
                                <div className="flex justify-between text-[10px] mb-1">
                                    <span className="text-slate-500 uppercase tracking-wider">TWAP (ASI)</span>
                                    <span className="text-blue-400 font-mono">${metrics.twap.toFixed(4)}</span>
                                </div>
                                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 transition-all duration-1000"
                                        style={{ width: `${Math.min(100, Math.max(0, (metrics.currentPrice / metrics.twap) * 50))}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>

                        <ChaosControls
                            currentPrice={metrics.currentPrice}
                            onPriceUpdate={(p) => updateSimulationPrice(p)}
                        />
                    </div>

                    {/* ── CENTER ZONE: OPERATIONAL CORE ────────────────────────────── */}
                    <div className="lg:col-span-6">
                        <div className="glass-panel p-8 rounded-[2.5rem] border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent shadow-2xl relative overflow-hidden">
                            {/* Visual Background Accent */}
                            <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-600/10 blur-[100px] rounded-full"></div>

                            <header className="mb-10 text-center">
                                <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-2 italic brand-typewriter">Capital Access</h2>
                                <p className="text-[10px] text-slate-500 uppercase tracking-[0.4em]">Precision Lending // No Liquidation by Maturity</p>
                            </header>

                            {status === 'LIQUIDATED' ? (
                                <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                                    <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center mb-4">
                                        <span className="text-4xl text-red-500 font-black">!</span>
                                    </div>
                                    <h4 className="text-2xl font-black uppercase text-red-400">Position Liquidated</h4>
                                    <p className="text-slate-400 text-[11px] max-w-xs uppercase leading-loose tracking-widest">
                                        The Risk Management Engine has seized your collateral due to a critical Health Factor breach.
                                    </p>
                                    <button
                                        className="px-12 py-4 bg-red-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-500 transition-all shadow-xl shadow-red-900/30"
                                        onClick={() => { setStatus('ACTIVE'); setDebt(0); setAccruedInterest(0); }}
                                    >
                                        Initiate Reset
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-10">
                                    {/* Collateral Selection */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end mb-2 px-1">
                                            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-black flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full animate-pulse ${address ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                                {address ? 'Live Portfolio Sync' : 'Simulated Portfolio Data'}
                                            </label>
                                            {!address && <span className="text-[13px] text-blue-400 font-bold anti-pattern-text">{lockedPercentage}%</span>}
                                        </div>

                                        {!address ? (
                                            <div className="p-4 border border-slate-800 rounded-xl bg-slate-900/50">
                                                <div className="text-center mb-4">
                                                    <p className="text-[10px] text-slate-500 uppercase">Wallet Disconnected: Viewing Sandbox Data</p>
                                                </div>
                                                <div className="relative group">
                                                    <input
                                                        type="range"
                                                        className="w-full accent-blue-500 h-2 bg-slate-800/50 rounded-lg appearance-none cursor-pointer border border-white/5"
                                                        min="0" max="100"
                                                        value={lockedPercentage}
                                                        onChange={e => setLockedPercentage(e.target.value)}
                                                        disabled={debt > 0}
                                                    />
                                                    <div className="flex justify-between mt-2">
                                                        <span className="text-[9px] text-slate-700 font-mono">MIN: 0%</span>
                                                        <span className="text-[9px] text-slate-700 font-mono">MAX: 100%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : portfolio.loading ? (
                                            <div className="p-8 border border-slate-800 rounded-xl bg-slate-900/50 flex flex-col items-center justify-center space-y-3">
                                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Scanning On-Chain Vesting Contracts...</p>
                                            </div>
                                        ) : portfolio.vested.length === 0 ? (
                                            <div className="p-8 border border-slate-800 rounded-xl bg-slate-900/50 text-center">
                                                <p className="text-[10px] text-slate-500 uppercase mb-2 font-black tracking-widest">No Active Vesting Assets Found</p>
                                                <p className="text-[10px] text-slate-600">You must hold vested or locked tokens to access protocol liquidity.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {portfolio.vested.map((vest, idx) => (
                                                    <div
                                                        key={idx}
                                                        onClick={() => !debt && setSelectedVest(vest)}
                                                        className={`p-4 border rounded-xl flex items-center justify-between cursor-pointer transition-all ${selectedVest?.vestingContract === vest.vestingContract ? 'border-blue-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-600'} ${debt > 0 ? 'opacity-50 pointer-events-none' : ''}`}
                                                    >
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-emerald-400 font-black uppercase text-sm">{Number(vest.formattedLocked).toLocaleString()} {vest.symbol}</span>
                                                                <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-widest border border-blue-500/20">Locked</span>
                                                            </div>
                                                            <p className="text-[9px] text-slate-500 font-mono">{vest.vestingContract}</p>
                                                        </div>
                                                        <div className="flex flex-col items-end">
                                                            {selectedVest?.vestingContract === vest.vestingContract && (
                                                                <span className="text-[10px] font-black tracking-widest uppercase text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded">Selected</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Stats */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl backdrop-blur-sm group hover:border-blue-500/30 transition-all">
                                            <label className="text-[9px] text-slate-500 uppercase block mb-2 tracking-wider group-hover:text-slate-400">Locked Asset</label>
                                            <DecryptedViewportText
                                                text={address && selectedVest ? selectedVest.symbol : (vestingContract?.tokenSymbol || "VEST")}
                                                decryptedClass="font-decrypted text-white text-lg truncate"
                                                encryptedClass="font-encrypted text-slate-700 text-lg truncate"
                                            />
                                        </div>
                                        <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl backdrop-blur-sm group hover:border-blue-500/30 transition-all">
                                            <label className="text-[9px] text-slate-500 uppercase block mb-2 tracking-wider group-hover:text-slate-400">Duration</label>
                                            <DecryptedViewportText text={`${durationMonths}M`} decryptedClass="font-decrypted text-white text-lg" encryptedClass="font-encrypted text-slate-700 text-lg" />
                                        </div>
                                        <div className="bg-white/[0.02] border border-white/5 p-5 rounded-2xl backdrop-blur-sm group hover:border-blue-500/30 transition-all">
                                            <label className="text-[9px] text-slate-500 uppercase block mb-2 tracking-wider group-hover:text-slate-400">Loan Health</label>
                                            <DecryptedViewportText
                                                text={healthFactor === Infinity ? '0.00' : healthFactor.toFixed(2)}
                                                decryptedClass={`font-decrypted text-lg ${healthFactor < 1.3 ? 'text-red-400' : healthFactor < 1.6 ? 'text-orange-400' : 'text-emerald-400'}`}
                                                encryptedClass="font-encrypted text-slate-700 text-lg"
                                            />
                                        </div>
                                    </div>

                                    {/* Primary Actions */}
                                    <div className="space-y-4 pt-4">
                                        {debt === 0 ? (
                                            <button
                                                disabled={activeQuantity === 0 || isWritePending || isTxLoading}
                                                className="w-full py-6 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:grayscale relative overflow-hidden"
                                                onClick={handleBorrow}
                                            >
                                                {(isWritePending || isTxLoading) && (
                                                    <div className="absolute inset-0 bg-blue-600 flex items-center justify-center">
                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-3"></div>
                                                        <span className="animate-pulse">PROCESSING LOAN...</span>
                                                    </div>
                                                )}
                                                1-CLICK BORROW: ${(borrowLimit).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC
                                            </button>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-4">
                                                <button
                                                    className="py-6 bg-white/5 border border-white/10 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:bg-white/10 transition-all"
                                                    onClick={handleRepay}
                                                >
                                                    Repay Capital
                                                </button>
                                                <button
                                                    className={`py-6 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest transition-all border ${isFastForwarding ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'}`}
                                                    onClick={() => setIsFastForwarding(!isFastForwarding)}
                                                >
                                                    {isFastForwarding ? 'Pause Time' : 'Time Warp 10x'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {debt > 0 && (
                                        <div className="flex items-center justify-between p-4 bg-blue-500/5 rounded-2xl border border-blue-500/20">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-slate-500 uppercase font-mono mb-1">Live Accrual (USDC)</span>
                                                <span className="text-xl text-white tracking-tighter italic">-${accruedInterest.toFixed(4)}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[9px] text-blue-400 bg-blue-400/10 px-2 py-1 rounded font-black uppercase">Active Loan</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── RIGHT ZONE: RISK INTELLIGENCE ────────────────────────────── */}
                    <div className="lg:col-span-3 space-y-6">
                        <div className="blue-glow-card p-6 rounded-3xl border border-blue-500/20 bg-blue-900/10 backdrop-blur-xl">
                            <h3 className="text-[11px] font-black uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                                <span className="text-blue-400">Risk Intelligence</span>
                                <span className="text-[8px] border border-blue-500/40 px-1.5 py-0.5 rounded text-blue-300">ASI ACTIVE</span>
                            </h3>

                            <div className="space-y-5">
                                <div className="flex justify-between items-center group">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">Est. DPV</span>
                                    <DecryptedViewportText text={`$${dpv.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} decryptedClass="font-decrypted text-blue-400 text-sm" encryptedClass="font-encrypted text-slate-600 text-sm" />
                                </div>
                                <div className="flex justify-between items-center group">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">Time Bias</span>
                                    <DecryptedViewportText text={`${(timeDiscount * 100).toFixed(1)}%`} decryptedClass="font-decrypted text-slate-300 text-sm" encryptedClass="font-encrypted text-slate-600 text-sm" />
                                </div>
                                <div className="flex justify-between items-center group">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">Risk Cut</span>
                                    <DecryptedViewportText text={`-${((1 - volMultiplier) * 100).toFixed(1)}%`} decryptedClass="font-decrypted text-orange-400 text-sm" encryptedClass="font-encrypted text-slate-600 text-sm" />
                                </div>

                                <hr className="border-slate-800/50 my-4" />

                                <div className="risk-insight-panel">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Market Sentiment</span>
                                    </div>
                                    <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mb-3">
                                        <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${(metrics.sentiment + 1) * 50}%` }}></div>
                                    </div>
                                    <p className="text-[10px] text-slate-500 italic leading-relaxed">
                                        "Vol-weighted assessment suggests premium liquidity depth. Loan stability remains within Omega-grade parameters."
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="stat-card p-5 border-slate-800 bg-slate-900/10">
                            <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-4">Collateral Details</h4>
                            <div className="space-y-3">
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-500">Seized Assets</span>
                                    <span className="font-mono text-red-500">${seizedTokensTotal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-[11px]">
                                    <span className="text-slate-500">Months Left</span>
                                    <span className="font-mono">{daysRemaining / 30}M</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* ── AUCTION VIEW: REDESIGNED ───────────────────────────────────── */
                <div className="fade-in">
                    <div className="glass-panel p-10 rounded-[3rem] border-white/5 bg-slate-900/20 min-h-[60vh]">
                        <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
                            <div>
                                <h2 className="text-4xl font-black italic uppercase tracking-tighter mb-2 italic">Liquidity Clearing</h2>
                                <p className="text-[10px] text-slate-500 uppercase tracking-[0.4em] font-mono">Secondary Market // 15% Standard Discount</p>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 px-8 py-4 rounded-2xl flex flex-col items-end">
                                <span className="text-[10px] text-emerald-500 uppercase font-black tracking-widest mb-1">Buying Power</span>
                                <span className="text-3xl font-mono text-white">${walletUSDC.toLocaleString()} USDC</span>
                            </div>
                        </div>

                        {auctionPool.length === 0 ? (
                            <div className="h-[40vh] flex flex-col items-center justify-center border-2 border-dashed border-slate-800/50 rounded-[2.5rem] text-slate-700 bg-black/20">
                                <span className="text-6xl mb-4 opacity-20">⚡</span>
                                <p className="text-xs font-black uppercase tracking-[0.3em]">No Assets in Distress</p>
                                <p className="text-[10px] mt-2 max-w-xs text-center leading-relaxed">
                                    When market triggers reach liquidation thresholds, seized collateral will be listed here for immediate settlement.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {auctionPool.map(item => (
                                    <div key={item.id} className="stat-card p-0 overflow-hidden border-slate-800 bg-white/[0.02] hover:border-emerald-500/50 transition-all duration-300 group">
                                        <div className="bg-emerald-500/10 px-6 py-3 border-b border-emerald-500/20 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{item.discount} Bounty</span>
                                            <span className="text-[9px] text-slate-500">{item.id.slice(-6)}</span>
                                        </div>
                                        <div className="p-8 space-y-6">
                                            <div>
                                                <h4 className="text-xl font-black uppercase mb-1 tracking-tighter">
                                                    {item.amount.toLocaleString()} {item.token}
                                                </h4>
                                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">Future Claims Rights</p>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between text-[11px] items-center">
                                                    <span className="text-slate-500 uppercase">Valuation</span>
                                                    <span className="text-slate-500 line-through font-mono">${item.valuation.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-sm items-center">
                                                    <span className="text-emerald-400 uppercase font-black text-[10px] tracking-wider">Settlement</span>
                                                    <span className="text-2xl font-mono text-white tracking-tighter">${item.buyNowPrice.toFixed(2)}</span>
                                                </div>
                                            </div>

                                            <button
                                                className="w-full py-5 bg-emerald-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-900/20 active:scale-95"
                                                onClick={() => handleBuyFromAuction(item)}
                                            >
                                                EXECUTE SETTLEMENT
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <footer className="mt-16 pt-8 border-t border-slate-900 flex flex-col items-center gap-4">
                <div className="flex gap-12">
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                        <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Base Sepolia Node Alpha</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                        <span className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">ASI Intelligence Active</span>
                    </div>
                </div>
                <p className="text-[9px] text-slate-800 font-mono tracking-[0.5em] uppercase">Vestra Protocol // Stress Simulation v2.0</p>
            </footer>

            <style dangerouslySetInnerHTML={{
                __html: `
                .command-center-layout {
                    animation: fadeIn 1s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .glass-panel {
                    backdrop-filter: blur(40px);
                }
                .blue-glow-card {
                    box-shadow: inset 0 0 40px rgba(59, 130, 246, 0.05);
                }
                .fade-in {
                    animation: fadeIn 0.5s ease-out;
                }
            `}} />
        </div>
    );
}