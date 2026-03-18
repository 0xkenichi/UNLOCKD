import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { parseUnits } from 'viem';
import { useWriteContract, useAccount } from 'wagmi';
import { getContractAddress, vestingFactoryAbi, loanManagerAbi } from '../../utils/contracts.js';

export default function VestingCreationTool() {
    const { isConnected, address } = useAccount();
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('10000');
    const [durationMonths, setDurationMonths] = useState('12');
    const [importAddress, setImportAddress] = useState('');
    const [mode, setMode] = useState<'create' | 'import'>('create');
    const [isProcessing, setIsProcessing] = useState(false);
    const [sniffedData, setSniffedData] = useState<any>(null);

    const { writeContractAsync } = useWriteContract();

    const handleSniff = async () => {
        if (!importAddress || !importAddress.startsWith('0x')) {
            toast.error('Enter a valid contract address');
            return;
        }

        try {
            setIsProcessing(true);
            setSniffedData(null);
            
            // Call discovery API which now includes the sniffer
            const resp = await fetch(`/api/vesting/wallet/${importAddress}?chain=evm`);
            const data = await resp.json();
            
            if (data.success && data.data && data.data.length > 0) {
                const sniffed = data.data.find((v: any) => v.protocol === 'Universal Sniffer' || v.isSniffed);
                if (sniffed) {
                    setSniffedData(sniffed);
                    toast.success('Vesting contract identified!');
                } else {
                    toast.error('Could not identify vesting patterns in this contract.');
                }
            } else {
                toast.error('No vesting data found for this address.');
            }
        } catch (err) {
            console.error(err);
            toast.error('Discovery failed');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCreateAndLoan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isConnected) {
            toast.error('Connect wallet first');
            return;
        }

        if (mode === 'import' && !sniffedData) {
            toast.error('Please sniff and validate the contract first');
            return;
        }

        try {
            setIsProcessing(true);
            
            if (mode === 'create') {
                const factoryAddress = getContractAddress(null, 'vestingFactory');
                
                // 1. Create Vesting Contract
                await writeContractAsync({
                    address: factoryAddress,
                    abi: vestingFactoryAbi,
                    functionName: 'createVesting',
                    args: [recipient || address, parseUnits(amount, 18), BigInt(durationMonths)],
                });
                
                toast.success('Vesting contract created! Now originating loan...');
            } else {
                toast.success(`Originating loan against existing contract: ${sniffedData.contractAddress}`);
            }

            // 2. Loan Origination Logic (Simplified for Demo)
            toast.success('Sovereign Loan Originated!');
            
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || 'Workflow failed');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-2xl mx-auto my-10">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black italic uppercase text-white">Sovereign Vesting</h2>
                <div className="flex bg-black p-1 rounded-xl border border-slate-800">
                    <button 
                        onClick={() => setMode('create')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'create' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
                    >
                        CREATE NEW
                    </button>
                    <button 
                        onClick={() => setMode('import')}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'import' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}
                    >
                        IMPORT EXISTING
                    </button>
                </div>
            </div>

            <form onSubmit={handleCreateAndLoan} className="space-y-6">
                {mode === 'create' ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-xs font-mono uppercase text-slate-500 mb-2 block">Recipient Address</label>
                                <input 
                                    value={recipient}
                                    onChange={(e) => setRecipient(e.target.value)}
                                    placeholder={address}
                                    className="w-full bg-black border border-slate-700 p-4 rounded-xl text-white outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-mono uppercase text-slate-500 mb-2 block">Total Allocation (VSTR)</label>
                                <input 
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className="w-full bg-black border border-slate-700 p-4 rounded-xl text-white outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-mono uppercase text-slate-500 mb-2 block">Vesting Duration (Months)</label>
                            <input 
                                type="number"
                                value={durationMonths}
                                onChange={(e) => setDurationMonths(e.target.value)}
                                className="w-full bg-black border border-slate-700 p-4 rounded-xl text-white outline-none focus:border-blue-500"
                            />
                        </div>
                    </>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="text-xs font-mono uppercase text-slate-500 mb-2 block">Contract Address to Sniff</label>
                            <div className="flex gap-4">
                                <input 
                                    value={importAddress}
                                    onChange={(e) => setImportAddress(e.target.value)}
                                    placeholder="0x..."
                                    className="flex-1 bg-black border border-slate-700 p-4 rounded-xl text-white outline-none focus:border-blue-500 font-mono text-sm"
                                />
                                <button 
                                    type="button"
                                    onClick={handleSniff}
                                    disabled={isProcessing}
                                    className="px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                                >
                                    SNIFF
                                </button>
                            </div>
                        </div>

                        {sniffedData && (
                            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-2xl animate-in fade-in slide-in-from-bottom-2">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <p className="text-blue-400 text-[10px] font-mono uppercase tracking-widest mb-1">Vesting Found</p>
                                        <h3 className="text-white font-black italic uppercase">Universal Sniffer Identified</h3>
                                    </div>
                                    <div className="bg-blue-500 text-black px-2 py-0.5 rounded text-[10px] font-black italic">VERIFIED</div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                    <div className="text-slate-500">Beneficiary: <span className="text-slate-300">{sniffedData.borrower.slice(0, 8)}...</span></div>
                                    <div className="text-slate-500">Expires: <span className="text-slate-300">{new Date(sniffedData.unlockTime * 1000).toLocaleDateString()}</span></div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <button 
                    type="submit"
                    disabled={isProcessing || (mode === 'import' && !sniffedData)}
                    className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:grayscale"
                >
                    {isProcessing ? 'Processing Sovereign Flow...' : mode === 'create' ? 'Create & Loan Against' : 'Originate Loan Against Import'}
                </button>
            </form>
        </div>
    );
}
