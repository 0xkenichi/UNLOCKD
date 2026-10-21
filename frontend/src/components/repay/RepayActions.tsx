"use client";

import React, { useEffect } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt
} from 'wagmi';
import { formatUnits } from 'viem';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { toast } from 'react-hot-toast';
import {
  Zap,
  ShieldCheck,
  ArrowRight,
  Coins,
  Loader2,
  CreditCard,
  Wallet,
  Gift
} from 'lucide-react';
import { loanManagerAbi, usdcAbi } from '@/config/contracts';
import { useContracts } from '@/hooks/useVestraContracts';
import { useLoanData, LOAN_STATUS, LOAN_STATUS_LABELS } from '@/hooks/useLoanData';
import { parseUsdc } from '@/lib/utils';

const USDC_DECIMALS = 6;

/**
 * Full-repayment buffer. Debt keeps accruing between the read and the transaction,
 * so we pass a little more than debtOf(); LoanManager.repay() caps the payment at the
 * live debt and only transfers that amount, so the buffer is never charged.
 */
const withAccrualBuffer = (debt: bigint) => debt + debt / 1000n + 1n; // +0.1%

type RepayActionsProps = {
    loanId: string;
    onLoanIdChange: (id: string) => void;
    isStealthMode?: boolean;
};

export const RepayActions = ({ loanId, onLoanIdChange }: RepayActionsProps) => {
    const { address } = useAccount();
    const contracts = useContracts();

    const [repayAmount, setRepayAmount] = React.useState('');
    const [repayMode, setRepayMode] = React.useState<'FULL' | 'PARTIAL'>('FULL');

    const loanManager = contracts.loanManager;
    const parsedId = /^\d+$/.test(loanId) ? BigInt(loanId) : null;

    // --- Data Fetching ---
    const { loan, status, debt, refetch: refetchLoan } = useLoanData(parsedId);

    const { data: usdcAddress } = useReadContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'usdc',
    });
    const usdc = (usdcAddress as `0x${string}` | undefined) ?? contracts.usdc;

    const { data: myLoans } = useReadContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'loansOf',
        args: address ? [address] : undefined,
        query: { enabled: !!address }
    });

    const { data: claimable, refetch: refetchClaimable } = useReadContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'claimable',
        args: address ? [address] : undefined,
        query: { enabled: !!address }
    });

    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: usdc,
        abi: usdcAbi,
        functionName: 'allowance',
        args: address ? [address, loanManager] : undefined,
        query: { enabled: !!address }
    });

    const isActive  = status === LOAN_STATUS.ACTIVE;
    const isAuction = status === LOAN_STATUS.AUCTION;
    const isRepayable = isActive || isAuction;

    // During an auction only a full repayment is accepted (it cancels the auction).
    const mode = isAuction ? 'FULL' : repayMode;
    const amountToSend = mode === 'FULL' ? withAccrualBuffer(debt) : parseUsdc(repayAmount);
    const needsApproval = (allowance ?? 0n) < amountToSend;

    // --- Contract Writes ---
    const { data: approveHash, writeContract: writeApprove, isPending: isApprovePending } = useWriteContract();
    const { data: repayHash, writeContract: writeRepay, isPending: isRepayPending } = useWriteContract();
    const { data: claimHash, writeContract: writeClaim, isPending: isClaimPending } = useWriteContract();

    const { isLoading: isApproveMining, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });
    const { isLoading: isRepayMining, isSuccess: repayConfirmed } = useWaitForTransactionReceipt({ hash: repayHash });
    const { isLoading: isClaimMining, isSuccess: claimConfirmed } = useWaitForTransactionReceipt({ hash: claimHash });

    useEffect(() => {
        if (approveConfirmed) {
            toast.success('USDC Allowance updated');
            refetchAllowance();
        }
    }, [approveConfirmed, refetchAllowance]);

    useEffect(() => {
        if (repayConfirmed) {
            toast.success('Repayment successful!');
            refetchLoan();
            refetchAllowance();
            window.dispatchEvent(new Event('refresh-portfolio'));
        }
    }, [repayConfirmed, refetchLoan, refetchAllowance]);

    useEffect(() => {
        if (claimConfirmed) {
            toast.success('Surplus claimed');
            refetchClaimable();
        }
    }, [claimConfirmed, refetchClaimable]);

    // --- Handlers ---
    const handleApprove = () => {
        if (amountToSend === 0n) return;
        writeApprove({
            address: usdc,
            abi: usdcAbi,
            functionName: 'approve',
            args: [loanManager, amountToSend]
        });
    };

    const handleRepay = () => {
        if (parsedId === null || amountToSend === 0n) return;
        writeRepay({
            address: loanManager,
            abi: loanManagerAbi,
            functionName: 'repay',
            args: [parsedId, amountToSend]
        }, {
            onError: (err: any) => toast.error(err?.shortMessage || 'Repayment failed')
        });
    };

    const handleClaim = () => {
        writeClaim({
            address: loanManager,
            abi: loanManagerAbi,
            functionName: 'claim',
        });
    };

    const fmt = (v: bigint) => Number(formatUnits(v, USDC_DECIMALS)).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const principal = loan?.principal ?? 0n;
    const interest = debt > principal ? debt - principal : 0n;

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
                        Repay in full to release your stream NFT, or pay down part of the debt.
                    </p>
                </div>
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                    {(['FULL', 'PARTIAL'] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setRepayMode(m)}
                            disabled={isAuction && m === 'PARTIAL'}
                            className={`px-3 py-1 text-[10px] font-black tracking-widest rounded-lg transition-all disabled:opacity-30 ${
                                mode === m ? 'bg-accent-cyan text-background' : 'text-white/50 hover:text-white'
                            }`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
                {/* Status Bar */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary tracking-widest mb-1">Total Due</div>
                        <div className="text-sm font-mono font-bold text-white">${fmt(debt)}</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary tracking-widest mb-1">Principal</div>
                        <div className="text-sm font-mono font-bold text-white/70">${fmt(principal)}</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary tracking-widest mb-1">Interest</div>
                        <div className="text-sm font-mono font-bold text-white/70">${fmt(interest)}</div>
                    </div>
                    <div className="p-3 rounded-2xl bg-white/5 border border-white/5">
                        <div className="text-[10px] uppercase font-black text-secondary tracking-widest mb-1">Status</div>
                        <div className={`text-sm font-bold ${isActive ? 'text-accent-teal' : isAuction ? 'text-accent-red' : 'text-white/20'}`}>
                            {LOAN_STATUS_LABELS[status] ?? 'UNKNOWN'}
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
                                onChange={(e) => onLoanIdChange(e.target.value)}
                                placeholder="1"
                            />
                            {myLoans && myLoans.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                    {myLoans.map((id) => (
                                        <button
                                            key={id.toString()}
                                            onClick={() => onLoanIdChange(id.toString())}
                                            className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono text-secondary hover:text-white"
                                        >
                                            #{id.toString()}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {mode === 'PARTIAL' && (
                            <div className="space-y-1">
                                <label className="text-[10px] uppercase font-black text-secondary tracking-widest flex items-center gap-2">
                                    <Coins className="w-3 h-3" /> USDC Amount
                                </label>
                                <input
                                    className="w-full bg-surface border border-white/10 rounded-2xl px-4 py-4 text-sm focus:border-accent-cyan outline-none font-mono text-accent-cyan transition-all"
                                    value={repayAmount}
                                    onChange={(e) => setRepayAmount(e.target.value)}
                                    placeholder="0.00"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Info Card */}
                {mode === 'PARTIAL' && (
                    <div className="p-4 rounded-2xl bg-accent-cyan/5 border border-accent-cyan/10 flex items-start gap-4">
                        <ShieldCheck className="w-5 h-5 text-accent-cyan flex-shrink-0" />
                        <div>
                            <div className="text-[10px] font-black text-accent-cyan uppercase tracking-widest">Interest-First</div>
                            <p className="text-[11px] text-accent-cyan/70 font-medium">Your payment clears accrued interest first, then reduces principal. The NFT is released only when the debt reaches zero.</p>
                        </div>
                    </div>
                )}
                {isAuction && (
                    <div className="p-4 rounded-2xl bg-accent-red/5 border border-accent-red/20 text-[11px] text-secondary">
                        This loan is in liquidation. Repaying the full debt now cancels the auction and returns your NFT.
                    </div>
                )}
                {mode === 'FULL' && isRepayable && (
                    <p className="text-[10px] text-secondary/60 italic">
                        Sends up to ${fmt(amountToSend)} (debt + 0.1% accrual buffer). Only the live debt is charged.
                    </p>
                )}

                {/* Actions */}
                <div className="flex gap-4">
                    <button
                        onClick={handleApprove}
                        disabled={isApprovePending || isApproveMining || !needsApproval || amountToSend === 0n}
                        className="flex-1 py-5 bg-surface border border-white/10 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-30 text-xs"
                    >
                        {isApprovePending || isApproveMining ? <Loader2 className="w-4 h-4 animate-spin text-accent-cyan" /> : <Wallet className="w-4 h-4" />}
                        {!needsApproval && amountToSend > 0n ? 'USDC Authorized' : 'Authorize USDC'}
                    </button>
                    <button
                        onClick={handleRepay}
                        disabled={isRepayPending || isRepayMining || !isRepayable || needsApproval || amountToSend === 0n}
                        className="flex-1 py-5 bg-accent-cyan text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-glow-cyan disabled:opacity-30 text-xs"
                    >
                        {isRepayPending || isRepayMining ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                        {mode === 'FULL' ? 'Settle Full' : 'Pay Partial'}
                    </button>
                </div>

                {/* Liquidation surplus */}
                {(claimable ?? 0n) > 0n && (
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-accent-teal/5 border border-accent-teal/20">
                        <div className="text-[11px] text-secondary">
                            <span className="font-black text-accent-teal uppercase tracking-widest mr-2">Auction Surplus</span>
                            ${fmt(claimable ?? 0n)} USDC is claimable from a liquidated loan.
                        </div>
                        <button
                            onClick={handleClaim}
                            disabled={isClaimPending || isClaimMining}
                            className="px-4 py-2 rounded-xl bg-accent-teal text-background text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-30"
                        >
                            {isClaimPending || isClaimMining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Gift className="w-3 h-3" />}
                            Claim
                        </button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
