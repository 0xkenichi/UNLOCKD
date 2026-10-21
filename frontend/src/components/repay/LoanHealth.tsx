"use client";

import React from 'react';
import Link from 'next/link';
import { formatUnits } from 'viem';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { useLoanData, LOAN_STATUS, LOAN_STATUS_LABELS } from '@/hooks/useLoanData';

const MAX_UINT = 2n ** 256n - 1n;

/** Health factor, maturity and liquidation status for a loan, read from LoanManager. */
export const LoanHealth = ({ loanId }: { loanId: string }) => {
    const parsedId = /^\d+$/.test(loanId) ? BigInt(loanId) : null;
    const { loan, status, healthFactorBps, isLiquidatable, gracePeriod } = useLoanData(parsedId);

    const hf = healthFactorBps === undefined || healthFactorBps === MAX_UINT
        ? null
        : Number(healthFactorBps) / 10_000;
    const maturity = loan ? Number(loan.maturity) : 0;
    const liquidatableAfter = maturity ? new Date((maturity + Number(gracePeriod)) * 1000) : null;

    const hfColor = hf === null ? 'text-white/40' : hf >= 1.5 ? 'text-accent-teal' : hf >= 1 ? 'text-amber-400' : 'text-accent-red';

    return (
        <Card variant="glass" className="border border-white/5 bg-surface/30 backdrop-blur-md shadow-2xl h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-xl font-black uppercase italic tracking-tighter text-accent-teal">
                    Loan Health
                </CardTitle>
                <p className="text-[10px] text-secondary font-medium italic opacity-50">
                    Liquidation value × threshold ÷ debt. Below 1.0 the loan can be auctioned.
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-end justify-between">
                    <span className="text-[10px] uppercase font-black text-secondary tracking-widest">Health Factor</span>
                    <span className={`text-3xl font-mono font-black ${hfColor}`}>
                        {status === LOAN_STATUS.ACTIVE ? (hf === null ? '—' : hf.toFixed(2)) : '—'}
                    </span>
                </div>
                <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-secondary">Status</span>
                        <span className="font-bold text-white">{LOAN_STATUS_LABELS[status]}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-secondary">Maturity</span>
                        <span className="font-mono text-white">{maturity ? new Date(maturity * 1000).toLocaleDateString() : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-secondary">Liquidatable after</span>
                        <span className="font-mono text-white">{liquidatableAfter ? liquidatableAfter.toLocaleDateString() : '—'}</span>
                    </div>
                    {loan && (
                        <div className="flex justify-between">
                            <span className="text-secondary">Collateral</span>
                            <span className="font-mono text-white">
                                {Number(formatUnits(loan.quantity, 18)).toLocaleString()} tokens · stream #{loan.streamId.toString()}
                            </span>
                        </div>
                    )}
                </div>
                {isLiquidatable && (
                    <div className="p-3 rounded-xl bg-accent-red/10 border border-accent-red/20 text-[11px] text-accent-red">
                        This loan is liquidatable now. Repay in full, or anyone can start an auction on the{' '}
                        <Link href="/auctions" className="underline">Auctions</Link> page.
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
