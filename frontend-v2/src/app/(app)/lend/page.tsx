'use client';

import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseUnits, formatUnits } from 'viem';
import { useContracts } from '@/hooks/useVestraContracts';
import { LENDING_POOL_ABI } from '@/abis/LendingPool';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { ERC20_ABI } from '@/abis/ERC20';
import { GlassCard } from '@/components/ui/GlassCard';
import { TxButton } from '@/components/ui/TxButton';
import { MetricCard } from '@/components/ui/MetricCard';
import { DurationSelector } from '@/components/lend/DurationSelector';
import { LenderPositions } from '@/components/lend/LenderPositions';
import { cn, formatUsd } from '@/lib/utils';
import { api } from '@/utils/api';
import toast from 'react-hot-toast';

// Duration options matching LendingPool constants
const DURATION_OPTIONS = [
  { label: '30 days',  seconds: 30  * 86400, multiplierBps: 10_000 },
  { label: '90 days',  seconds: 90  * 86400, multiplierBps: 11_500 },
  { label: '1 year',   seconds: 365 * 86400, multiplierBps: 13_000 },
  { label: '3 years',  seconds: 1095* 86400, multiplierBps: 15_000 },
];

export default function LendPage() {
  const { address, isConnected } = useAccount();
  const contracts = useContracts();
  const queryClient = useQueryClient();

  const [amount,   setAmount]   = useState('');
  const [depositType, setDepositType] = useState<'VARIABLE' | 'FIXED'>('VARIABLE');
  const [duration, setDuration] = useState(DURATION_OPTIONS[0]);

  // ─── Direct Lending Data ───────────────────────────────────────────────────
  const { data: openClaims } = useQuery({
    queryKey: ['open-claims'],
    queryFn: () => api.fetchOpenVestingClaims(),
  });

  // ─── Pool Stats ─────────────────────────────────────────────────────────────
  const { data: totalDeposits } = useReadContract({
    address:      contracts.lendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'totalDeposits',
  });
  const { data: totalBorrowed } = useReadContract({
    address:      contracts.lendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'totalBorrowed',
  });
  const { data: variableApyBps } = useReadContract({
    address:      contracts.lendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'getVariableApyBps',
  });
  const { data: availableLiquidity } = useReadContract({
    address:      contracts.lendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'availableLiquidity',
  });
  const { data: usdcBalance } = useReadContract({
    address:      contracts.usdc,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [address!],
    query:        { enabled: !!address },
  });

  // ─── Derived Stats ──────────────────────────────────────────────────────────
  const displayVariableApy = variableApyBps ? Number(variableApyBps) : 450;
  const fixedApy = duration.label === '30 days' ? 800 : duration.label === '60 days' ? 1000 : 1200;
  const effectiveApy = depositType === 'VARIABLE' ? displayVariableApy : fixedApy;

  const utilization  = totalDeposits && totalBorrowed
    ? Number(totalBorrowed) / Number(totalDeposits)
    : 0;

  // ─── Actions ────────────────────────────────────────────────────────────────
  const { writeContract: approve } = useWriteContract();
  const { writeContract: deposit } = useWriteContract();
  const { writeContract: lendToClaim } = useWriteContract();

  const handleDeposit = useCallback(() => {
    if (!amount) return;
    deposit({
      address:      contracts.lendingPool,
      abi:          LENDING_POOL_ABI,
      functionName: 'deposit',
      args:         [
        parseUnits(amount, 6), 
        depositType === 'VARIABLE' ? 0 : 1, 
        depositType === 'VARIABLE' ? 0 : BigInt(duration.seconds / 86400)
      ],
    });
  }, [amount, depositType, duration, deposit, contracts]);

  const handleLendToClaim = (collateralId: string, lendAmount: string) => {
    lendToClaim({
      address: contracts.loanManager,
      abi: LOAN_MANAGER_ABI,
      functionName: 'lendToClaim',
      args: [BigInt(collateralId), parseUnits(lendAmount, 6)],
    });
  };

  return (
    <main className="min-h-screen bg-[#0D0F0E] px-4 py-12 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-10 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display text-[#E8E6DF] font-medium redaction-text">
            Lend & Earn
          </h1>
          <p className="text-[#9C9A92] mt-2 text-sm max-w-md">
            Choose between liquid variable yield or higher fixed returns by locking assets or lending directly to borrowers.
          </p>
        </div>
        <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setDepositType('VARIABLE')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              depositType === 'VARIABLE' ? "bg-[#1D9E75] text-white shadow-lg shadow-[#1D9E75]/20" : "text-[#9C9A92] hover:text-[#E8E6DF]"
            )}
          >
            Variable
          </button>
          <button
            onClick={() => setDepositType('FIXED')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              depositType === 'FIXED' ? "bg-[#1D9E75] text-white shadow-lg shadow-[#1D9E75]/20" : "text-[#9C9A92] hover:text-[#E8E6DF]"
            )}
          >
            Fixed
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <MetricCard label="Total TVL" value={formatUsd(Number(totalDeposits || 0n) / 1e6)} />
        <MetricCard 
          label="Variable APY" 
          value={`${(displayVariableApy / 100).toFixed(2)}%`} 
          status="success"
        />
        <MetricCard label="Utilization" value={`${(utilization * 100).toFixed(1)}%`} />
        <MetricCard label="Available" value={formatUsd(Number(availableLiquidity || 0n) / 1e6)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Deposit Panel */}
        <div className="lg:col-span-1">
          <GlassCard className="h-full border-[#1D9E75]/20 bg-gradient-to-b from-white/[0.05] to-transparent">
            <h2 className="text-[#E8E6DF] font-medium text-lg mb-6 redaction-text uppercase tracking-widest">
              {depositType === 'VARIABLE' ? 'Liquid Staking' : 'Locked Yield'}
            </h2>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-[#9C9A92]">Input Amount (USDC)</span>
                  <span className="text-[#5DCAA5]">Bal: {formatUsd(Number(usdcBalance || 0n) / 1e6)}</span>
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-[#0D0F0E] border border-white/10 rounded-xl px-4 py-3 text-[#E8E6DF] font-mono text-xl focus:border-[#1D9E75] outline-none transition-all"
                />
              </div>

              {depositType === 'FIXED' && (
                <div>
                  <label className="text-xs text-[#9C9A92] mb-2 block uppercase tracking-tighter">Choose Lock Period</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { l: '30d', s: 30*86400, a: '8%' },
                      { l: '60d', s: 60*86400, a: '10%' },
                      { l: '90d', s: 90*86400, a: '12%' }
                    ].map(opt => (
                      <button
                        key={opt.l}
                        onClick={() => setDuration({ label: opt.l, seconds: opt.s, multiplierBps: 0 })}
                        className={cn(
                          "py-3 rounded-lg border transition-all text-center",
                          duration.seconds === opt.s 
                            ? "bg-[#1D9E75]/20 border-[#1D9E75] text-[#5DCAA5]" 
                            : "bg-white/5 border-white/10 text-[#9C9A92] hover:border-white/20"
                        )}
                      >
                        <div className="text-sm font-bold">{opt.l}</div>
                        <div className="text-[10px] opacity-60">{opt.a} APY</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#9C9A92]">Expected APY</span>
                  <span className="text-[#5DCAA5] font-bold">{(effectiveApy / 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#9C9A92]">Lock Status</span>
                  <span className={depositType === 'VARIABLE' ? "text-[#5DCAA5]" : "text-amber-500"}>
                    {depositType === 'VARIABLE' ? 'Instant Exit' : `${duration.seconds / 86400} Days Locked`}
                  </span>
                </div>
              </div>

              {depositType === 'FIXED' && (
                <div className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-500 leading-relaxed">
                  <span className="text-xl">⚠️</span>
                  <span>Early withdrawal burns 10% of principal to the insurance fund. Only for committed lenders.</span>
                </div>
              )}

              <TxButton
                onClick={handleDeposit}
                className="w-full py-4 text-lg"
              >
                Deposit USDC
              </TxButton>
            </div>
          </GlassCard>
        </div>

        {/* Claims Browser & Positions */}
        <div className="lg:col-span-2 space-y-8">
          <GlassCard>
            <h2 className="text-[#E8E6DF] font-medium text-lg mb-6 redaction-text uppercase tracking-widest">Browse Open Vesting Claims</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {openClaims?.length > 0 ? openClaims.map((claim: any) => (
                <div key={claim.id} className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[#1D9E75]/40 transition-all group">
                  <div className="flex justify-between items-start mb-3">
                    <div className="font-bold text-[#E8E6DF]">{claim.tokenName}</div>
                    <div className="text-[#5DCAA5] text-xs px-2 py-0.5 rounded-full bg-[#1D9E75]/10 border border-[#1D9E75]/20">
                      {claim.requestedAmount} USDC
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-[#9C9A92] mb-4">
                    <div>Collateral: <span className="text-white">{claim.collateralValue}</span></div>
                    <div>Ends In: <span className="text-white">{claim.daysRemaining}d</span></div>
                  </div>
                  <button 
                    onClick={() => handleLendToClaim(claim.collateralId, claim.requestedAmount)}
                    className="w-full py-2 rounded-lg bg-[#1D9E75] text-white text-xs font-bold opacity-80 group-hover:opacity-100 transition-all"
                  >
                    Lend USDC →
                  </button>
                </div>
              )) : (
                <div className="col-span-2 text-center py-12 text-[#9C9A92] text-sm italic">
                  No active borrowing requests at this time. Check back later.
                </div>
              )}
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="text-[#E8E6DF] font-medium text-lg mb-6 redaction-text uppercase tracking-widest">Your Positions</h2>
            <LenderPositions address={address} contracts={contracts} />
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
