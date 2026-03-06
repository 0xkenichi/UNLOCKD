// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { useMarketSimulation } from './useMarketSimulation.js';
import { formatUnits } from 'viem';
import { logSimulationEvent } from '../../utils/supabaseClient.js';

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
        interestRateBps,
        metrics,
        priceHistory,
    } = useMarketSimulation();

    // Local Simulation States
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

    useEffect(() => {
        if (!isRunning) startSimulation(1.0);
    }, []);

    // Derived Financial Metrics using MVP Logic
    const allocation = parseFloat(formatUnits(vestingContract?.allocation || '0', 6));
    const monthsToUnlock = durationMonths; // In this demo, duration is the time to unlock

    // Compute DPV and Borrow Limit
    const { dpv, borrowLimit, timeDiscount, volMultiplier } = computeDPV(
        allocation * (lockedPercentage / 100),
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
            token: vestingContract?.tokenName || "VEST",
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
            setStatus('LIQUIDATED');
            setIsFastForwarding(false);
        }
    }, [healthFactor]);

    // Simple interest accrual based on dynamic borrow APR
    useEffect(() => {
        if (!isRunning || debt === 0 || status !== 'ACTIVE') return;
        const interval = setInterval(() => {
            const ticInterest = (debt * (metrics.borrowApr / 365 / 24 / 60 / 20)); // Scaled for demo speed
            setAccruedInterest(prev => prev + ticInterest);
        }, 1000);
        return () => clearInterval(interval);
    }, [isRunning, debt, metrics.borrowApr, status]);

    const handleBorrow = () => {
        setDebt(borrowLimit);
        setWalletUSDC(prev => prev + borrowLimit);
        setDaysRemaining(DURATIONS[durationMonths].days);
        injectMarketImpact(-0.02, "Loan Originated (Slippage)");
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
        <div className="demo-v2-dashboard p-6 bg-black text-white min-h-screen">
            {/* Header / Metric Strip */}
            <div className="demo-v2-header flex flex-col md:flex-row justify-between items-center gap-4 mb-8 bg-slate-900/40 p-5 rounded-[2rem] border border-slate-800 backdrop-blur-md">
                <div className="role-switcher flex bg-black/60 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
                    <button className={`px-8 py-2.5 rounded-xl text-[10px] uppercase tracking-wider font-black transition-all ${view === 'BORROWER' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setView('BORROWER')}>Borrower</button>
                    <button className={`px-8 py-2.5 rounded-xl text-[10px] uppercase tracking-wider font-black transition-all ${view === 'LENDER' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-300'}`} onClick={() => setView('LENDER')}>Auction House</button>
                </div>

                <div className="flex flex-wrap justify-center gap-8 metrics-row">
                    <div className="text-center group">
                        <label className="text-[9px] text-slate-500 uppercase block mb-1 tracking-widest group-hover:text-blue-400 transition-colors">Borrow APR</label>
                        <span className="font-mono text-xl text-blue-400">{(metrics.borrowApr * 100).toFixed(2)}%</span>
                    </div>
                    <div className="text-center group">
                        <label className="text-[9px] text-slate-500 uppercase block mb-1 tracking-widest group-hover:text-emerald-400 transition-colors">Spot Price</label>
                        <span className="font-mono text-xl text-emerald-400">${metrics.currentPrice.toFixed(4)}</span>
                    </div>
                    <div className="text-center group">
                        <label className="text-[9px] text-slate-500 uppercase block mb-1 tracking-widest group-hover:text-purple-400 transition-colors">Utilization</label>
                        <span className="font-mono text-xl text-purple-400">{(metrics.utilization * 100).toFixed(1)}%</span>
                    </div>
                    <div className="hidden xl:flex bg-slate-800/50 px-4 py-2 rounded-xl text-[9px] font-black border border-slate-700 self-center tracking-widest items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                        BASE SEPOLIA
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {view === 'BORROWER' ? (
                    <>
                        <div className="lg:col-span-2 space-y-6">
                            {/* Live Market Chart */}
                            <div className="card-panel bg-slate-900/40 p-6 rounded-3xl border border-slate-800">
                                <h3 className="text-sm font-bold mb-4 flex items-center gap-2"><span className="w-2 h-2 bg-blue-500 rounded-full"></span> Live Market (ASI Monitored)</h3>
                                <div style={{ height: 300 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={priceHistory}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.3} />
                                            <XAxis dataKey="time" hide />
                                            <YAxis domain={['auto', 'auto']} orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} />
                                            <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={3} dot={false} isAnimationActive={false} />
                                            <ReferenceLine y={metrics.twap} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'TWAP', fill: '#f59e0b', fontSize: 10 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Chaos controls integrated here */}
                            <ChaosControls
                                currentPrice={metrics.currentPrice}
                                onPriceUpdate={(p) => updateSimulationPrice(p)}
                            />

                            {/* Wallet State */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                                    <p className="text-[10px] text-slate-500 uppercase">USDC Balance</p>
                                    <p className="text-xl font-mono">${walletUSDC.toLocaleString()}</p>
                                </div>
                                <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                                    <p className="text-[10px] text-slate-500 uppercase">Collateral Available</p>
                                    <p className="text-xl font-mono">{(totalCollateral - seizedTokensTotal - lockedTokens).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        <div className="demo-v2-right space-y-6">
                            <div className="card-panel bg-slate-900/80 p-6 rounded-3xl border border-slate-700 backdrop-blur-xl shadow-2xl">
                                <h3 className="text-sm font-bold mb-6 flex items-center justify-between">
                                    <span>Risk Brain Insights</span>
                                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30 uppercase">ASI Engine</span>
                                </h3>

                                <div className="space-y-4 mb-6">
                                    <div className="flex justify-between items-center p-3 bg-black/40 rounded-xl border border-slate-800">
                                        <span className="text-[10px] text-slate-500 uppercase">Est. DPV</span>
                                        <span className="font-mono text-blue-400">${dpv.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-black/40 rounded-xl border border-slate-800">
                                        <span className="text-[10px] text-slate-500 uppercase">Time Discount</span>
                                        <span className="font-mono text-slate-300">{(timeDiscount * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-black/40 rounded-xl border border-slate-800">
                                        <span className="text-[10px] text-slate-500 uppercase">Risk Haircut</span>
                                        <span className="font-mono text-orange-400">-{((1 - volMultiplier) * 100).toFixed(1)}%</span>
                                    </div>
                                </div>

                                <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-2xl mb-6">
                                    <p className="text-[9px] text-blue-400 font-bold uppercase mb-1">ASI Sentiment Analysis</p>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                                        <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${(metrics.sentiment + 1) * 50}%` }}></div>
                                    </div>
                                    <p className="text-[10px] text-slate-400 italic">"Current market volatility suggests conservative borrowing limits are optimal."</p>
                                </div>

                                {status === 'LIQUIDATED' ? (
                                    <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-center">
                                        <p className="text-red-400 text-xs font-bold mb-2">POSITION LIQUIDATED</p>
                                        <p className="text-[10px] text-slate-400 mb-4">Price drop triggered an automatic seizure of collateral to protect lenders.</p>
                                        <button className="w-full py-3 bg-red-600 rounded-xl text-xs font-bold" onClick={() => setStatus('ACTIVE')}>Reset Position</button>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-[10px] text-slate-500 uppercase">Lock Allocation</label>
                                                <span className="text-[10px] font-mono">{lockedPercentage}%</span>
                                            </div>
                                            <input type="range" className="w-full accent-blue-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer" min="0" max="100" value={lockedPercentage} onChange={e => setLockedPercentage(e.target.value)} disabled={debt > 0} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 uppercase block mb-2">Loan Duration</label>
                                            <select className="w-full bg-black border border-slate-700 p-3 rounded-xl text-xs font-mono focus:ring-1 focus:ring-blue-500 outline-none" value={durationMonths} onChange={e => setDurationMonths(e.target.value)} disabled={debt > 0}>
                                                {Object.entries(DURATIONS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-black/60 p-3 rounded-xl border border-slate-800 shadow-inner">
                                                <span className="text-[9px] text-slate-500 block uppercase mb-1">Debt + Interest</span>
                                                <span className="text-sm font-mono text-white">${totalDebt.toFixed(2)}</span>
                                            </div>
                                            <div className="bg-black/60 p-3 rounded-xl border border-slate-800 shadow-inner">
                                                <span className="text-[9px] text-slate-500 block uppercase mb-1">Health Factor</span>
                                                <span className={`text-sm font-mono ${healthFactor < 1.2 ? 'text-red-400 animate-pulse' : healthFactor < 1.5 ? 'text-orange-400' : 'text-emerald-400'}`}>
                                                    {healthFactor === Infinity ? '∞' : healthFactor.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="button-group space-y-3 pt-2">
                                            <button
                                                className="w-full py-4 bg-gradient-to-r from-blue-700 to-blue-600 rounded-2xl font-bold text-sm shadow-lg shadow-blue-900/20 hover:from-blue-600 hover:to-blue-500 disabled:opacity-30 transition-all active:scale-95"
                                                onClick={handleBorrow}
                                                disabled={debt > 0 || lockedPercentage < 5}
                                            >
                                                EXECUTE BORROW
                                            </button>
                                            <button
                                                className="w-full py-4 border border-slate-700 rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all active:scale-95"
                                                onClick={handleRepay}
                                                disabled={debt === 0}
                                            >
                                                REPAY COMPLETE
                                            </button>
                                        </div>
                                        {debt > 0 && (
                                            <div className="pt-2">
                                                <button className={`w-full py-2 rounded-lg text-[10px] font-bold transition-all ${isFastForwarding ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`} onClick={() => setIsFastForwarding(!isFastForwarding)}>
                                                    {isFastForwarding ? '⏸ PAUSE TIME SIM' : '⏩ FAST FORWARD (10x)'}
                                                </button>
                                                <p className="text-[8px] text-center text-slate-600 mt-2 uppercase tracking-tighter italic">Interest accrues in real-time based on utilization</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    /* LENDER VIEW: Discount Auction House */
                    <div className="lg:col-span-3 space-y-6">
                        <div className="card-panel bg-slate-900 p-8 rounded-[40px] border border-slate-800 min-h-[500px]">
                            <div className="flex justify-between items-center mb-8">
                                <h3 className="text-xl font-bold italic tracking-tighter uppercase">Discount Auction House</h3>
                                <div className="text-right">
                                    <p className="text-[10px] text-slate-500 uppercase">Buying Power</p>
                                    <p className="text-2xl font-mono text-emerald-400">${walletUSDC.toLocaleString()} USDC</p>
                                </div>
                            </div>

                            {auctionPool.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-800 rounded-3xl text-slate-600">
                                    <p className="text-sm font-bold uppercase tracking-widest">No Liquidated Assets</p>
                                    <p className="text-[10px]">When positions fail safety checks, they appear here at a 15% discount.</p>
                                </div>
                            ) : (
                                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {auctionPool.map(item => (
                                        <div key={item.id} className="bg-black p-6 rounded-[32px] border border-slate-800 hover:border-blue-500 transition-all">
                                            <div className="flex justify-between mb-4"><span className="bg-blue-600/20 text-blue-400 text-[9px] px-2 py-1 rounded font-bold border border-blue-500/30">{item.discount} DISCOUNT</span><span className="text-[9px] text-slate-600">ID: {item.id.slice(-6)}</span></div>
                                            <h4 className="text-lg font-bold mb-4">{item.amount.toLocaleString()} {item.token} Claims</h4>
                                            <div className="space-y-2 mb-6">
                                                <div className="flex justify-between text-[10px]"><span className="text-slate-500">Market Value</span><span className="line-through text-slate-600">${item.valuation.toFixed(2)}</span></div>
                                                <div className="flex justify-between text-sm"><span className="text-emerald-500 font-bold uppercase text-[10px]">Instant Purchase Price</span><span className="font-mono text-emerald-400">${item.buyNowPrice.toFixed(2)}</span></div>
                                            </div>
                                            <button className="w-full py-4 bg-emerald-600 rounded-2xl font-bold text-sm hover:bg-emerald-500" onClick={() => handleBuyFromAuction(item)}>Purchase Rights</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            <p className="text-center mt-12 text-[9px] text-slate-700 font-mono tracking-widest uppercase italic">Vestra Protocol // ASI-Monitored Stress Test Environment</p>
        </div>
    );
}