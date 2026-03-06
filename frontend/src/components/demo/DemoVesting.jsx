// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import React, { useState } from 'react';
import { parseUnits } from 'viem';

export default function DemoVesting({ onComplete }) {
    const [tokenName, setTokenName] = useState('Vestra Governance');
    const [tokenSymbol, setTokenSymbol] = useState('VSTR');
    const [allocation, setAllocation] = useState('1000000');
    const [duration, setDuration] = useState('12');
    const [isMinting, setIsMinting] = useState(false);

    const handleCreateVesting = async () => {
        setIsMinting(true);
        setTimeout(() => {
            setIsMinting(false);
            onComplete({
                tokenName,
                tokenSymbol,
                allocation: parseUnits(allocation, 6).toString(),
                duration,
                address: '0xabc123...mockVesting'
            });
        }, 1500);
    };

    return (
        <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-[2.5rem] backdrop-blur-xl shadow-2xl max-w-lg mx-auto">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2 text-white">Issue Vested Collateral</h2>
            <p className="text-xs text-slate-500 mb-8 uppercase tracking-widest font-mono">Step 2: Asset Initialization</p>

            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                        <label className="text-[10px] text-slate-500 uppercase block mb-2 tracking-widest">Token Name</label>
                        <input
                            type="text"
                            value={tokenName}
                            onChange={e => setTokenName(e.target.value)}
                            className="w-full bg-black/60 border border-slate-800 p-3 rounded-xl text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                    <div className="form-group">
                        <label className="text-[10px] text-slate-500 uppercase block mb-2 tracking-widest">Symbol</label>
                        <input
                            type="text"
                            value={tokenSymbol}
                            onChange={e => setTokenSymbol(e.target.value)}
                            className="w-full bg-black/60 border border-slate-800 p-3 rounded-xl text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label className="text-[10px] text-slate-500 uppercase block mb-2 tracking-widest">Total Allocation</label>
                    <div className="relative">
                        <input
                            type="number"
                            value={allocation}
                            onChange={e => setAllocation(e.target.value)}
                            className="w-full bg-black/60 border border-slate-800 p-3 rounded-xl text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none transition-all pl-8"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-[10px]">$</span>
                    </div>
                </div>

                <div className="form-group">
                    <label className="text-[10px] text-slate-500 uppercase block mb-2 tracking-widest">Vesting Period (Months)</label>
                    <input
                        type="number"
                        value={duration}
                        onChange={e => setDuration(e.target.value)}
                        className="w-full bg-black/60 border border-slate-800 p-3 rounded-xl text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    />
                </div>

                <button
                    className="w-full py-5 bg-gradient-to-r from-blue-700 to-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-blue-900/20 hover:from-blue-600 hover:to-indigo-500 transition-all active:scale-95 disabled:opacity-50 mt-4"
                    onClick={handleCreateVesting}
                    disabled={isMinting}
                >
                    {isMinting ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                            Deploying to Base Sepolia...
                        </span>
                    ) : 'Mint Vested Collateral'}
                </button>
            </div>
        </div>
    );
}
