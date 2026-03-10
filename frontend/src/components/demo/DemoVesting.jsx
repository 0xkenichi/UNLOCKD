// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import React, { useState, useEffect } from 'react';
import { parseUnits, decodeEventLog } from 'viem';
import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient, useAccount } from 'wagmi';
import { getContractAddress, demoFaucetAbi } from '../../utils/contracts.js';

export default function DemoVesting({ onComplete }) {
    const chainId = useChainId();
    const publicClient = usePublicClient();
    const { isConnected } = useAccount();

    const [tokenName, setTokenName] = useState('Vestra Governance');
    const [tokenSymbol, setTokenSymbol] = useState('VSTR');
    const [allocation, setAllocation] = useState('1000000');
    const [duration, setDuration] = useState('12');
    const [isMinting, setIsMinting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const demoFaucetAddress = getContractAddress(chainId, 'demoFaucet');

    const { data: hash, writeContractAsync } = useWriteContract();
    const { isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

    const handleCreateVesting = async () => {
        if (!isConnected) {
            setErrorMsg('Wallet not connected! (Check connection or toggle Simulator)');
            return;
        }
        if (!demoFaucetAddress) {
            setErrorMsg('DemoFaucet contract not found on this network.');
            return;
        }

        try {
            setIsMinting(true);
            setErrorMsg('');

            const allocUnits = parseUnits(allocation, 18); // MockVestraToken is 18 decimals

            await writeContractAsync({
                address: demoFaucetAddress,
                abi: demoFaucetAbi,
                functionName: 'mintDemoPosition',
                args: [allocUnits, BigInt(duration)],
            });
        } catch (err) {
            console.error('Minting failed:', err);
            setErrorMsg(err.shortMessage || err.message || 'Transaction failed');
            setIsMinting(false);
        }
    };

    useEffect(() => {
        if (isSuccess && receipt) {
            // Find DemoPositionMinted event
            let collateralId = null;
            let vestingContract = null;

            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === demoFaucetAddress.toLowerCase()) {
                        const decoded = decodeEventLog({
                            abi: demoFaucetAbi,
                            data: log.data,
                            topics: log.topics
                        });

                        if (decoded.eventName === 'DemoPositionMinted') {
                            vestingContract = decoded.args.vestingContract;
                            collateralId = decoded.args.collateralId.toString();
                        }
                    }
                } catch (e) {
                    // ignore other logs
                }
            }

            setIsMinting(false);
            onComplete({
                tokenName,
                tokenSymbol,
                allocation: parseUnits(allocation, 18).toString(),
                duration,
                address: vestingContract || '0xabc123...mockVesting',
                collateralId: collateralId
            });
        }
    }, [isSuccess, receipt, demoFaucetAddress, onComplete, tokenName, tokenSymbol, allocation, duration]);

    return (
        <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-[2.5rem] backdrop-blur-xl shadow-2xl max-w-lg mx-auto">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-2 text-white">Issue Vested Collateral</h2>
            <p className="text-xs text-slate-500 mb-8 uppercase tracking-widest font-mono">Step 2: Asset Initialization</p>

            {errorMsg && (
                <div className="mb-4 p-3 bg-red-900/40 border border-red-500/50 rounded-xl text-red-200 text-xs text-center uppercase tracking-widest">
                    {errorMsg}
                </div>
            )}

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

                {isMinting && hash && (
                    <div className="text-[10px] text-blue-400 text-center uppercase tracking-widest mt-2 bg-blue-900/20 py-2 rounded-lg">
                        Processing on-chain...
                    </div>
                )}

                <button
                    className="w-full py-5 bg-gradient-to-r from-blue-700 to-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-blue-900/20 hover:from-blue-600 hover:to-indigo-500 transition-all active:scale-95 disabled:opacity-50 mt-4"
                    onClick={handleCreateVesting}
                    disabled={isMinting}
                >
                    {isMinting ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                            Deploying...
                        </span>
                    ) : 'Mint Vested Collateral'}
                </button>
            </div>
        </div>
    );
}
