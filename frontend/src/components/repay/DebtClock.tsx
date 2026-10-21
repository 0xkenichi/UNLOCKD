"use client";

import React from 'react';
import { formatUnits } from 'viem';
import { Canvas } from '@react-three/fiber';
import HoloCard from '@/components/ui/HoloCard';
import { Torus } from '@react-three/drei';
import { useLoanData, LOAN_STATUS } from '@/hooks/useLoanData';

/** Live interest accrued on a loan: LoanManager.debtOf(loanId) − principal, at the floating rate. */
export const DebtClock = ({ loanId }: { loanId: string }) => {
    const parsedId = /^\d+$/.test(loanId) ? BigInt(loanId) : null;
    const { loan, debt, rateBps, status } = useLoanData(parsedId);

    const principal = loan?.principal ?? 0n;
    const interest = debt > principal ? debt - principal : 0n;
    const maturity = loan ? new Date(Number(loan.maturity) * 1000) : null;

    const handleRepay = () => {
        const target = document.getElementById('repay-actions');
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <HoloCard distort={0.4} className="h-full">
            <div className="flex flex-col h-full justify-between">
                <div className="space-y-1">
                    <h3 className="text-xl font-black uppercase italic tracking-tighter text-white">Debt Clock</h3>
                    <p className="text-[10px] text-secondary font-medium italic opacity-70">
                        {status === LOAN_STATUS.ACTIVE
                            ? `Accruing at ${(Number(rateBps) / 100).toFixed(2)}% variable APR${maturity ? ` · matures ${maturity.toLocaleDateString()}` : ''}`
                            : status === LOAN_STATUS.AUCTION
                                ? 'Interest stopped when the auction started.'
                                : 'Select an active loan to see accrued interest.'}
                    </p>
                </div>

                <div className="flex-grow flex items-center justify-center py-4">
                    <div className="w-48 h-48 relative">
                        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                            <ambientLight intensity={0.7} />
                            <pointLight position={[10, 10, 10]} intensity={250} />
                            <Torus args={[1.2, 0.25, 32, 64]} rotation={[0.5, 0.5, 0]}>
                                <meshStandardMaterial
                                    color="#2EBEB5"
                                    emissive="#1f3b5a"
                                    roughness={0.1}
                                    metalness={1}
                                />
                            </Torus>
                        </Canvas>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[10px] font-black uppercase tracking-widest text-accent-teal/50">Interest Accrued</span>
                            <span className="text-2xl font-mono font-black text-white">
                                ${Number(formatUnits(interest, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleRepay}
                    className="w-full py-4 bg-accent-teal text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all shadow-glow-teal mt-4"
                >
                    Repay
                </button>
            </div>
        </HoloCard>
    );
};
