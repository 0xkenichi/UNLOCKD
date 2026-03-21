"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { 
  useAccount, 
  useChainId, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt,
  useSignTypedData
} from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { toast } from 'react-hot-toast';
import { Zap, ShieldCheck, ArrowRight, Coins, Loader2 } from 'lucide-react';
import { getContract, loanManagerAbi, usdcAbi } from '@/config/contracts';
import { api } from '@/utils/api';
import { makeRelayerAuth } from '@/utils/privacy';

const USDC_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const RepayActions = ({ initialLoanId = '', isStealthMode = false }) => {
    const { address } = useAccount();
    const chainId = useChainId();
    const { signTypedDataAsync } = useSignTypedData();

    const [loanId, setLoanId] = useState(initialLoanId || '0');
    const [repayAmount, setRepayAmount] = useState('50');
    const [isRelayerBusy, setIsRelayerBusy] = useState(false);

    const loanManager = getContract(chainId, 'loanManager');
    const usdc = getContract(chainId, 'usdc');

    const repayUnits = useMemo(() => {
        try {
            return parseUnits(repayAmount, USDC_DECIMALS);
        } catch {
            return BigInt(0);
        }
    }, [repayAmount]);

    // Data Fetching
    const { data: loan } = useReadContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'loans',
        args: [BigInt(loanId || 0)],
        query: { enabled: !!loanManager && !!loanId }
    });

    const { data: isPrivateLoan } = useReadContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'isPrivateLoan',
        args: [BigInt(loanId || 0)],
        query: { enabled: !!loanManager && !!loanId }
    });

    const { data: privateLoan } = useReadContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'privateLoans',
        args: [BigInt(loanId || 0)],
        query: { enabled: !!loanManager && !!loanId && !!isPrivateLoan }
    });

    const { data: allowance } = useReadContract({
        address: usdc,
        abi: usdcAbi,
        functionName: 'allowance',
        args: address && loanManager ? [address, loanManager] : undefined,
        query: { enabled: !!usdc && !!loanManager && !!address }
    });

    const { data: usdcBalance } = useReadContract({
        address: usdc,
        abi: usdcAbi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        query: { enabled: !!usdc && !!address }
    });

    // Contract Writes
    const { data: approveHash, writeContract: writeApprove, isPending: isApprovePending } = useWriteContract();
    const { data: repayHash, writeContract: writeRepay, isPending: isRepayPending } = useWriteContract();

    const { isLoading: isApproveMining, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });
    const { isLoading: isRepayMining, isSuccess: repayConfirmed } = useWaitForTransactionReceipt({ hash: repayHash });

    useEffect(() => {
        if (approveConfirmed) toast.success('Allowance updated!');
        if (repayConfirmed) {
            toast.success('Repayment successful!');
            window.dispatchEvent(new Event('refresh-portfolio'));
        }
    }, [approveConfirmed, repayConfirmed]);

    const effectiveTotalDue = useMemo(() => {
        const principal = isPrivateLoan ? privateLoan?.[1] : loan?.[1];
        const interest = isPrivateLoan ? privateLoan?.[2] : loan?.[2];
        return (principal || BigInt(0)) + (interest || BigInt(0));
    }, [isPrivateLoan, privateLoan, loan]);

    const handleApprove = () => {
        if (!usdc || !loanManager) return;
        writeApprove({
            address: usdc,
            abi: usdcAbi,
            functionName: 'approve',
            args: [loanManager, repayUnits]
        });
    };

    const handleRepay = async () => {
        if (isStealthMode && isPrivateLoan) {
            setIsRelayerBusy(true);
            try {
                const vault = privateLoan?.[0] || ZERO_ADDRESS;
                const payload = { loanId: String(loanId), amount: repayUnits.toString() };
                const auth = makeRelayerAuth({
                    chainId,
                    verifyingContract: loanManager,
                    user: address!,
                    vault,
                    action: 'repay-private-loan',
                    payload
                });
                const signature = await signTypedDataAsync(auth.typedData);
                const result = await api.repayLoan({
                    ...payload,
                    signature,
                    nonce: auth.nonce,
                    issuedAt: auth.issuedAt,
                    expiresAt: auth.expiresAt,
                    payloadHash: auth.payloadHash
                } as any);
                if (result.success) {
                    toast.success('Private repayment submitted to relayer');
                    window.dispatchEvent(new Event('refresh-portfolio'));
                }
            } catch (err: any) {
                toast.error(err.message || 'Relayer repayment failed');
            } finally {
                setIsRelayerBusy(false);
            }
            return;
        }

        if (!loanManager) return;
        writeRepay({
            address: loanManager,
            abi: loanManagerAbi as any,
            functionName: 'repayLoan',
            args: [BigInt(loanId), repayUnits]
        });
    };

    return (
        <Card variant="glass" className="border border-white/5 bg-surface/30 backdrop-blur-md shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                    <CardTitle className="text-xl font-black uppercase italic tracking-tighter text-accent-cyan flex items-center gap-2">
                        <Zap className="w-5 h-5" />
                        Repay Live Loan
                    </CardTitle>
                    <p className="text-[10px] text-secondary font-medium italic opacity-70">
                        {isStealthMode ? 'Private mode: relayed actions via ZKShield vault.' : 'Direct settlement from connected wallet.'}
                    </p>
                </div>
                <div className="flex gap-2">
                     <span className="px-2 py-0.5 rounded-full border border-accent-cyan/30 text-[10px] font-black tracking-widest text-accent-cyan">USDC</span>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-black text-secondary tracking-widest">Loan ID</label>
                        <input 
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent-cyan outline-none font-mono" 
                            value={loanId}
                            onChange={(e) => setLoanId(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-black text-secondary tracking-widest">Amount (USDC)</label>
                        <input 
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent-cyan outline-none font-mono text-accent-cyan" 
                            value={repayAmount}
                            onChange={(e) => setRepayAmount(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary opacity-50">Total Due</div>
                        <div className="text-sm font-mono font-bold text-white">${formatUnits(effectiveTotalDue, USDC_DECIMALS)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary opacity-50">Allowance</div>
                        <div className="text-sm font-mono font-bold text-accent-teal">${formatUnits(allowance || BigInt(0), USDC_DECIMALS)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary opacity-50">Wallet</div>
                        <div className="text-sm font-mono font-bold text-accent-cyan">${formatUnits(usdcBalance || BigInt(0), USDC_DECIMALS)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary opacity-50">Status</div>
                        <div className="text-sm font-bold text-accent-teal">{(isPrivateLoan ? privateLoan?.[6] : loan?.[6]) ? 'ACTIVE' : 'INACTIVE'}</div>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button 
                        onClick={handleApprove}
                        disabled={isApprovePending || isApproveMining || (allowance || BigInt(0)) >= repayUnits}
                        className="flex-1 py-4 bg-surface border border-white/10 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
                    >
                        {isApprovePending || isApproveMining ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Approve
                    </button>
                    <button 
                        onClick={handleRepay}
                        disabled={isRepayPending || isRepayMining || isRelayerBusy || repayUnits === BigInt(0)}
                        className="flex-1 py-4 bg-accent-cyan text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-glow-cyan disabled:opacity-30"
                    >
                        {isRepayPending || isRepayMining || isRelayerBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        Repay
                    </button>
                </div>
            </CardContent>
        </Card>
    );
};
