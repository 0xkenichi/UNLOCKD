'use client';

import { useState, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useGasPrice, useEstimateGas } from 'wagmi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseUnits, formatUnits, formatEther, encodeFunctionData } from 'viem';
import { useContracts } from '@/hooks/useVestraContracts';
import { LENDING_POOL_ABI } from '@/abis/LendingPool';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { ISOLATED_LENDING_POOL_ABI } from '@/abis/IsolatedLendingPool';
import { ERC20_ABI } from '@/abis/ERC20';
import { GlassCard } from '@/components/ui/GlassCard';
import { TxButton } from '@/components/ui/TxButton';
import { MetricCard } from '@/components/ui/MetricCard';
import { DurationSelector } from '@/components/lend/DurationSelector';
import { LenderPositions } from '@/components/lend/LenderPositions';
import { StarknetBoostCard } from '@/components/lend/StarknetBoostCard';
import { StarkzapModal } from '@/components/lend/StarkzapModal';
import { AaveBoostCard } from '@/components/lend/AaveBoostCard';
import { AaveModal } from '@/components/lend/AaveModal';
import { VestraBoostCard } from '@/components/lend/VestraBoostCard';
import { RevenueTracker } from '@/components/lend/RevenueTracker';
import { cn, formatUsd } from '@/lib/utils';
import { api } from '@/utils/api';
import toast from 'react-hot-toast';

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
  const [targetPool, setTargetPool] = useState<'STANDARD' | 'ISOLATED'>('STANDARD');
  const [depositType, setDepositType] = useState<'VARIABLE' | 'FIXED'>('VARIABLE');
  const [duration, setDuration] = useState(DURATION_OPTIONS[0]);
  const [gasSpeed, setGasSpeed] = useState<'LOW' | 'STANDARD'>('STANDARD');
  const [starkzapOpen, setStarkzapOpen] = useState(false);
  const [aaveOpen, setAaveOpen] = useState(false);
  const [vestraOpen, setVestraOpen] = useState(false);

  // ─── Direct Lending Data ───────────────────────────────────────────────────
  const { data: openClaims } = useQuery({
    queryKey: ['open-claims'],
    queryFn: () => api.fetchOpenVestingClaims(),
  });

  // ─── Standard Pool Stats ───────────────────────────────────────────────────
  const { data: stdDeposits } = useReadContract({
    address:      contracts.lendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'totalDeposits',
  });
  const { data: stdBorrowed } = useReadContract({
    address:      contracts.lendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'totalBorrowed',
  });
  const { data: stdVariableApyBps } = useReadContract({
    address:      contracts.lendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'getVariableApyBps',
  });
  const { data: stdAvailable } = useReadContract({
    address:      contracts.lendingPool,
    abi:          LENDING_POOL_ABI,
    functionName: 'availableLiquidity',
  });

  // ─── Isolated High-Yield Pool Stats ─────────────────────────────────────────
  const { data: isoAssets } = useReadContract({
    address:      contracts.isolatedPool,
    abi:          ISOLATED_LENDING_POOL_ABI,
    functionName: 'totalAssets',
  });
  const { data: isoBorrowed } = useReadContract({
    address:      contracts.isolatedPool,
    abi:          ISOLATED_LENDING_POOL_ABI,
    functionName: 'totalBorrowed',
  });
  const { data: isoApyBps } = useReadContract({
    address:      contracts.isolatedPool,
    abi:          ISOLATED_LENDING_POOL_ABI,
    functionName: 'getInterestRateBps',
    args:         [0n], // duration 0 for variable
  });

  const { data: usdcBalance } = useReadContract({
    address:      contracts.usdc,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [address!],
    query:        { enabled: !!address },
  });

  // ─── Gas Estimation ────────────────────────────────────────────────────────
  const { data: gasPriceData } = useGasPrice();
  const { data: estimatedGas } = useEstimateGas({
    account: address,
    to:      contracts.lendingPool as `0x${string}`,
    data:    encodeFunctionData({
      abi:          LENDING_POOL_ABI,
      functionName: 'deposit',
      args:         [
        parseUnits(amount || '0', 6), 
        depositType === 'VARIABLE' ? 0n : 1n, 
        depositType === 'VARIABLE' ? 0n : BigInt(duration.seconds / 86400)
      ],
    }),
    query: { enabled: !!address && Number(amount) > 0 },
  });

  const MOCK_ETH_PRICE = 3200; // For demo display
  const gasTotalFixed = (BigInt(estimatedGas?.toString() || '0') * BigInt(gasPriceData?.toString() || '0'));
  const gasCostUsd = estimatedGas ? Number(formatEther(gasTotalFixed)) * MOCK_ETH_PRICE : 0.42; 
  const lowGasUsd = gasCostUsd * 0.8;
  const standardGasUsd = gasCostUsd;

  // ─── Derived Stats ──────────────────────────────────────────────────────────
  const totalTVL = (BigInt(stdDeposits?.toString() || '0') + BigInt(isoAssets?.toString() || '0'));
  const totalBorrows = (BigInt(stdBorrowed?.toString() || '0') + BigInt(isoBorrowed?.toString() || '0'));
  const blendedApyBps = totalTVL > 0n 
    ? (BigInt(stdVariableApyBps?.toString() || '0') * BigInt(stdDeposits?.toString() || '0') + BigInt(isoApyBps?.toString() || '0') * BigInt(isoAssets?.toString() || '0')) / totalTVL
    : 450n;

  const displayVariableApy = targetPool === 'STANDARD' 
    ? (stdVariableApyBps ? Number(stdVariableApyBps) : 450)
    : (isoApyBps ? Number(isoApyBps) : 1800);

  const fixedApy = duration.label === '30 days' ? 800 : duration.label === '60 days' ? 1000 : 1200;
  const effectiveApy = depositType === 'VARIABLE' ? displayVariableApy : fixedApy;

  const utilization  = totalTVL > 0n
    ? Number(totalBorrows) / Number(totalTVL)
    : 0;

  // ─── Actions ────────────────────────────────────────────────────────────────
  const { writeContract: approve } = useWriteContract();
  const { writeContract: deposit } = useWriteContract();
  const { writeContract: lendToClaim } = useWriteContract();

  const handleDeposit = useCallback(() => {
    if (!amount) return;
    
    if (targetPool === 'STANDARD') {
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
    } else {
      // Isolated Pool (ERC-4626)
      deposit({
        address:      contracts.isolatedPool,
        abi:          ISOLATED_LENDING_POOL_ABI,
        functionName: 'deposit',
        args:         [
          parseUnits(amount, 6),
          (address || '0x0000000000000000000000000000000000000000') as `0x${string}`
        ],
      });
    }
  }, [amount, depositType, duration, deposit, contracts, targetPool, address]);

  const handleLendToClaim = (collateralId: string, lendAmount: string) => {
    lendToClaim({
      address: contracts.loanManager,
      abi: LOAN_MANAGER_ABI,
      functionName: 'lendToClaim',
      args: [BigInt(collateralId), parseUnits(lendAmount, 6)],
    });
  };

  return (
    <main className="min-h-screen bg-[#0D0F0E] px-4 py-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 md:gap-0">
        <div>
          <h1 className="text-4xl font-display text-[#E8E6DF] font-medium redaction-text">
            Invest
          </h1>
          <p className="text-[#9C9A92] mt-2 text-sm max-w-md">
            Deploy capital across risk-adjusted tiers. Choose between institutional-grade Aave yield or high-performance Vestra loans.
          </p>
        </div>
        
        <div className="w-full md:w-auto h-full flex flex-col gap-4">
          {/* Internal Growth Metrics moved to Admin */}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <MetricCard label="Protocol TVL" value={formatUsd(Number(totalTVL) / 1e6)} />
        <MetricCard 
          label="Blended APY" 
          value={`${(Number(blendedApyBps) / 100).toFixed(2)}%`} 
          status="success"
        />
        <MetricCard label="Global Utilization" value={`${(utilization * 100).toFixed(1)}%`} />
        <MetricCard label="Liquid Free" value={formatUsd(Number(stdAvailable || 0n) / 1e6)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        <AaveBoostCard onBoost={() => setAaveOpen(true)} className="h-full" />
        <StarknetBoostCard onBoost={() => setStarkzapOpen(true)} className="h-full" />
        <VestraBoostCard 
          onBoost={() => {
            setTargetPool('ISOLATED');
            const el = document.getElementById('deposit-panel');
            el?.scrollIntoView({ behavior: 'smooth' });
          }} 
          className="h-full" 
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Deposit Panel */}
        <div className="lg:col-span-1">
          <GlassCard className="h-full border-[#1D9E75]/20 bg-gradient-to-b from-white/[0.05] to-transparent">
            {/* Pool Selector */}
            <div className="flex gap-2 mb-6 p-1 rounded-lg bg-black/40 border border-white/5">
              <button
                onClick={() => setTargetPool('STANDARD')}
                className={cn(
                  "flex-1 py-2 text-[10px] font-bold rounded transition-all",
                  targetPool === 'STANDARD' ? "bg-white/10 text-white" : "text-[#9C9A92] hover:text-[#E8E6DF]"
                )}
              >
                STANDARD
              </button>
              <button
                onClick={() => setTargetPool('ISOLATED')}
                className={cn(
                  "flex-1 py-2 text-[10px] font-bold rounded transition-all",
                  targetPool === 'ISOLATED' ? "bg-[#1D9E75]/30 text-white" : "text-[#9C9A92] hover:text-[#5DCAA5]"
                )}
              >
                HIGH-YIELD
              </button>
            </div>

            <h2 className="text-[#E8E6DF] font-medium text-lg mb-6 redaction-text uppercase tracking-widest">
              {targetPool === 'ISOLATED' ? 'Tiered Tranching' : (depositType === 'VARIABLE' ? 'Liquid Staking' : 'Locked Yield')}
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

              {/* Gas Fee Selection */}
              <div>
                <label className="text-xs text-[#9C9A92] mb-2 block uppercase tracking-tighter">Gas Speed (Network Fee)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setGasSpeed('LOW')}
                    className={cn(
                      "py-2 rounded-lg border transition-all text-xs font-medium",
                      gasSpeed === 'LOW' 
                        ? "bg-[#1D9E75]/20 border-[#1D9E75] text-[#5DCAA5]" 
                        : "bg-white/5 border-white/10 text-[#9C9A92] hover:border-white/20"
                    )}
                  >
                    Low (${lowGasUsd.toFixed(2)})
                  </button>
                  <button
                    onClick={() => setGasSpeed('STANDARD')}
                    className={cn(
                      "py-2 rounded-lg border transition-all text-xs font-medium",
                      gasSpeed === 'STANDARD' 
                        ? "bg-[#1D9E75]/20 border-[#1D9E75] text-[#5DCAA5]" 
                        : "bg-white/5 border-white/10 text-[#9C9A92] hover:border-white/20"
                    )}
                  >
                    Standard (${standardGasUsd.toFixed(2)})
                  </button>
                </div>
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
                  <span className="text-[#9C9A92]">Protocol Fee (0.2%)</span>
                  <span className="text-[#E8E6DF]">{amount ? formatUsd(Number(amount) * 0.002) : '$0.00'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#9C9A92]">Lock Status</span>
                  <span className={depositType === 'VARIABLE' ? "text-[#5DCAA5]" : "text-amber-500"}>
                    {depositType === 'VARIABLE' ? 'Instant Exit' : `${duration.seconds / 86400} Days Locked`}
                  </span>
                </div>
                <div className="pt-2 border-t border-white/5 flex justify-between text-sm font-bold">
                  <span className="text-[#E8E6DF]">Total Cost</span>
                  <span className="text-[#E8E6DF]">
                    {amount ? formatUsd(Number(amount) + (gasSpeed === 'LOW' ? lowGasUsd : standardGasUsd) + (Number(amount) * 0.002)) : '-'}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 p-3 rounded-lg bg-[#1D9E75]/10 border border-[#1D9E75]/20 text-[10px] text-[#5DCAA5] leading-relaxed">
                <span className="text-lg">🛡️</span>
                <span>
                  {depositType === 'FIXED' 
                    ? `Fixed penalty of 2.0% applies if withdrawn before ${duration.label}.`
                    : 'Variable penalty applies based on your active lock period and time remaining.'}
                </span>
              </div>

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

      <StarkzapModal 
        isOpen={starkzapOpen} 
        onClose={() => setStarkzapOpen(false)} 
      />

      <AaveModal 
        isOpen={aaveOpen} 
        onClose={() => setAaveOpen(false)} 
      />
      
      {/* Vestra High-Yield Modal (Mocked using AaveModal for demo) */}
      {vestraOpen && (
        <AaveModal 
          isOpen={vestraOpen} 
          onClose={() => setVestraOpen(false)} 
        />
      )}
    </main>
  );
}
