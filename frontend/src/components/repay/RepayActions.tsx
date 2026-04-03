"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { 
  useAccount, 
  useChainId, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt
} from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { toast } from 'react-hot-toast';
import { 
  Zap, 
  ShieldCheck, 
  ArrowRight, 
  Coins, 
  Loader2, 
  RefreshCw, 
  CreditCard,
  Lock,
  Wallet
} from 'lucide-react';
import { getContract, loanManagerAbi, usdcAbi } from '@/config/contracts';

const USDC_DECIMALS = 6;
const ASSETS = [
  { symbol: 'USDC', address: '0xfc02c9a40d847da372fa8ee05346e3c38c1a8c14', decimals: 6 },
  { symbol: 'ETH',  address: '0x0000000000000000000000000000000000000000', decimals: 18 },
  { symbol: 'WBTC', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', decimals: 8 }
];

export const RepayActions = ({ initialLoanId = '' }) => {
    const { address } = useAccount();
    const chainId = useChainId();

    const [loanId, setLoanId] = useState(initialLoanId || '1');
    const [repayAmount, setRepayAmount] = useState('');
    const [repayMode, setRepayMode] = useState<'FULL' | 'PARTIAL' | 'ASSET'>('FULL');
    const [selectedAsset, setSelectedAsset] = useState(ASSETS[0]);

    const loanManager = getContract(chainId, 'loanManager');
    const usdc = getContract(chainId, 'usdc');

    // --- Data Fetching ---
    const { data: loan, refetch: refetchLoan } = useReadContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'loans',
        args: [BigInt(loanId || 0)],
        query: { enabled: !!loanManager && !!loanId }
    });

    const { data: totalDue, refetch: refetchQuote } = useReadContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'quoteRepayment',
        args: [BigInt(loanId || 0)],
        query: { enabled: !!loanManager && !!loanId }
    });

    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: usdc,
        abi: usdcAbi,
        functionName: 'allowance',
        args: address && loanManager ? [address, loanManager] : undefined,
        query: { enabled: !!usdc && !!loanManager && !!address }
    });

    // --- Contract Writes ---
    const { data: approveHash, writeContract: writeApprove, isPending: isApprovePending } = useWriteContract();
    const { data: repayHash, writeContract: writeRepay, isPending: isRepayPending } = useWriteContract();
    const { data: vPayHash, writeContract: writeVPay, isPending: isVPayPending } = useWriteContract();

    const { isLoading: isApproveMining, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });
    const { isLoading: isRepayMining, isSuccess: repayConfirmed } = useWaitForTransactionReceipt({ hash: repayHash });
    const { isLoading: vPayMining, isSuccess: vPayConfirmed } = useWaitForTransactionReceipt({ hash: vPayHash });

    useEffect(() => {
        if (approveConfirmed) {
            toast.success('USDC Allowance updated');
            refetchAllowance();
        }
        if (repayConfirmed || vPayConfirmed) {
            toast.success(repayConfirmed ? 'Repayment successful!' : 'Vestra Pay status updated');
            refetchLoan();
            refetchQuote();
            window.dispatchEvent(new Event('refresh-portfolio'));
        }
    }, [approveConfirmed, repayConfirmed, vPayConfirmed]);

    // --- Handlers ---
    const handleApprove = () => {
        if (!usdc || !loanManager) return;
        writeApprove({
            address: usdc,
            abi: usdcAbi,
            functionName: 'approve',
            args: [loanManager, parseUnits('1000000', 6)]
        });
    };

    const handleAction = async () => {
        if (!loanManager) return;

        if (repayMode === 'FULL') {
            writeRepay({
                address: loanManager,
                abi: loanManagerAbi as any,
                functionName: 'repay',
                args: [BigInt(loanId)]
            });
        } else if (repayMode === 'PARTIAL') {
            writeRepay({
                address: loanManager,
                abi: loanManagerAbi as any,
                functionName: 'repayPartial',
                args: [BigInt(loanId), parseUnits(repayAmount, USDC_DECIMALS)]
            });
        } else if (repayMode === 'ASSET') {
            writeRepay({
                address: loanManager,
                abi: loanManagerAbi as any,
                functionName: 'settleWithAsset',
                args: [BigInt(loanId), selectedAsset.address as `0x${string}`, parseUnits(repayAmount, selectedAsset.decimals)]
            });
        }
    };

    const toggleVestraPay = () => {
        if (!loanManager) return;
        writeVPay({
            address: loanManager,
            abi: loanManagerAbi as any,
            functionName: 'authorizeVestraPay',
            args: [BigInt(loanId), !loan?.[7]] // vestraPayEnabled is at index 7
        });
    };

    const isRepayVisible = (loan?.[6]); // active is at index 6

    return (
        <Card variant="glass" className="border border-white/5 bg-surface/30 backdrop-blur-md shadow-2xl overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent-cyan/10 blur-[80px] -mr-16 -mt-16 pointer-events-none" />
            
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-white/5">
                <div>
                    <CardTitle className="text-xl font-black uppercase italic tracking-tighter text-accent-cyan flex items-center gap-2">
                        <Zap className="w-5 h-5 fill-accent-cyan" />
                        Settlement Hub
                    </CardTitle>
                    <p className="text-[10px] text-secondary font-medium italic opacity-70">
                        Select repayment strategy for active loan positions.
                    </p>
                </div>
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                    {['FULL', 'PARTIAL', 'ASSET'].map((mode) => (
                        <button
                            key={mode}
                            onClick={() => setRepayMode(mode as any)}
                            className={`px-3 py-1 text-[10px] font-black tracking-widest rounded-lg transition-all ${
                                repayMode === mode ? 'bg-accent-cyan text-background' : 'text-white/50 hover:text-white'
                            }`}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
                {/* Status Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary tracking-widest mb-1">Total Due</div>
                        <div className="text-sm font-mono font-bold text-white">${formatUnits(totalDue || 0n, USDC_DECIMALS)}</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary tracking-widest mb-1">Principal</div>
                        <div className="text-sm font-mono font-bold text-white/70">${formatUnits(loan?.[2] || 0n, USDC_DECIMALS)}</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary tracking-widest mb-1">Vestra Pay</div>
                        <button 
                            onClick={toggleVestraPay}
                            disabled={vPayMining || isVPayPending}
                            className={`text-sm font-bold flex items-center gap-2 ${loan?.[7] ? 'text-accent-cyan' : 'text-white/30'}`}
                        >
                            {loan?.[7] ? <RefreshCw className="w-3 h-3 animate-spin-slow" /> : <Lock className="w-3 h-3" />}
                            {loan?.[7] ? 'ENABLED' : 'DISABLED'}
                        </button>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary tracking-widest mb-1">Status</div>
                        <div className={`text-sm font-bold ${isRepayVisible ? 'text-accent-teal' : 'text-white/20'}`}>
                            {isRepayVisible ? 'ACTIVE' : 'SETTLED'}
                        </div>
                    </div>
                </div>

                {/* Input Area */}
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] uppercase font-black text-secondary tracking-widest flex items-center gap-2">
                                <CreditCard className="w-3 h-3" /> Loan ID
                            </label>
                            <input 
                                className="w-full bg-surface border border-white/10 rounded-2xl px-4 py-4 text-sm focus:border-accent-cyan outline-none font-mono text-white transition-all shadow-inner" 
                                value={loanId}
                                onChange={(e) => setLoanId(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        {repayMode !== 'FULL' && (
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-black text-secondary tracking-widest flex items-center gap-2">
                                    <Coins className="w-3 h-3" /> {repayMode === 'ASSET' ? 'Asset Amount' : 'USDC Amount'}
                                </label>
                                <div className="relative">
                                    <input 
                                        className="w-full bg-surface border border-white/10 rounded-2xl px-4 py-4 text-sm focus:border-accent-cyan outline-none font-mono text-accent-cyan transition-all" 
                                        value={repayAmount}
                                        onChange={(e) => setRepayAmount(e.target.value)}
                                        placeholder="0.00"
                                    />
                                    {repayMode === 'ASSET' && (
                                        <select 
                                            value={selectedAsset.symbol}
                                            onChange={(e) => setSelectedAsset(ASSETS.find(a => a.symbol === e.target.value)!)}
                                            className="absolute right-2 top-2 bottom-2 bg-white/5 border border-white/10 rounded-xl px-2 text-[10px] font-black text-white outline-none"
                                        >
                                            {ASSETS.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                                        </select>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Card */}
                {repayMode === 'PARTIAL' && (
                    <div className="p-4 rounded-2xl bg-accent-cyan/5 border border-accent-cyan/10 flex items-start gap-4">
                        <ShieldCheck className="w-5 h-5 text-accent-cyan flex-shrink-0" />
                        <div>
                            <div className="text-[10px] font-black text-accent-cyan uppercase tracking-widest">Interest-First Model</div>
                            <p className="text-[11px] text-accent-cyan/70 font-medium">Your payment will clear accrued interest first, then reduce principal. VCS score will be updated upon settlement.</p>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-4">
                    <button 
                        onClick={handleApprove}
                        disabled={isApprovePending || isApproveMining || (allowance || 0n) > parseUnits('1000', 6)}
                        className="flex-1 py-5 bg-surface border border-white/10 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-30 text-xs"
                    >
                        {isApprovePending || isApproveMining ? <Loader2 className="w-4 h-4 animate-spin text-accent-cyan" /> : <Wallet className="w-4 h-4" />}
                        { (allowance || 0n) > parseUnits('1000', 6) ? 'USDC Authorized' : 'Authorize USDC'}
                    </button>
                    <button 
                        onClick={handleAction}
                        disabled={isRepayPending || isRepayMining || !isRepayVisible}
                        className="flex-1 py-5 bg-accent-cyan text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-glow-cyan disabled:opacity-30 text-xs"
                    >
                        {isRepayPending || isRepayMining ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        {repayMode === 'FULL' ? 'Settle Full' : repayMode === 'PARTIAL' ? 'Pay Partial' : 'Settle via Asset'}
                    </button>
                </div>
            </CardContent>
        </Card>
    );
};
