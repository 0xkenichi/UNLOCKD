'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatUnits } from 'viem';
import { LENDING_POOL_ABI } from '@/abis/LendingPool';
import { ERC20_ABI } from '@/abis/ERC20';
import { usePoolStats } from '@/hooks/usePoolStats';
import { GlassCard } from '@/components/ui/GlassCard';
import { TxButton } from '@/components/ui/TxButton';
import { MetricCard } from '@/components/ui/MetricCard';
import { LenderPositions } from '@/components/lend/LenderPositions';
import { cn, formatUsd, parseUsdc } from '@/lib/utils';
import toast from 'react-hot-toast';

const pct = (bps: bigint) => `${(Number(bps) / 100).toFixed(2)}%`;
const usdc = (v: bigint) => Number(formatUnits(v, 6));

export default function LendPage() {
  const { address } = useAccount();
  const stats = usePoolStats();

  const [mode,   setMode]   = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [isMax,  setIsMax]  = useState(false);

  const amountRaw = parseUsdc(amount);

  // ─── Wallet balance / allowance of the pool asset (USDC) ─────────────────────
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address:      stats.asset,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [address!],
    query:        { enabled: !!address },
  });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address:      stats.asset,
    abi:          ERC20_ABI,
    functionName: 'allowance',
    args:         [address!, stats.poolAddress],
    query:        { enabled: !!address },
  });

  const { data: previewShares } = useReadContract({
    address:      stats.poolAddress,
    abi:          LENDING_POOL_ABI,
    functionName: mode === 'DEPOSIT' ? 'previewDeposit' : 'previewWithdraw',
    args:         [amountRaw],
    query:        { enabled: amountRaw > 0n },
  });

  // ─── Writes ─────────────────────────────────────────────────────────────────
  const { writeContract: approve,  data: approveHash }  = useWriteContract();
  const { writeContract: deposit,  data: depositHash }  = useWriteContract();
  const { writeContract: withdraw, data: withdrawHash } = useWriteContract();

  const { isLoading: approvePending,  isSuccess: approveSuccess }  = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: depositPending,  isSuccess: depositSuccess }  = useWaitForTransactionReceipt({ hash: depositHash });
  const { isLoading: withdrawPending, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (approveSuccess) refetchAllowance();
  }, [approveSuccess, refetchAllowance]);

  useEffect(() => {
    if (depositSuccess || withdrawSuccess) {
      toast.success(depositSuccess ? 'Deposit confirmed' : 'Withdrawal confirmed');
      setAmount('');
      setIsMax(false);
      stats.refetch();
      refetchBalance();
      refetchAllowance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositSuccess, withdrawSuccess]);

  const onError = (err: any) => toast.error(err?.shortMessage || 'Transaction failed');

  const needsApproval = mode === 'DEPOSIT' && (allowance ?? 0n) < amountRaw;

  const handleApprove = useCallback(() => {
    if (amountRaw === 0n) return;
    approve({
      address:      stats.asset,
      abi:          ERC20_ABI,
      functionName: 'approve',
      args:         [stats.poolAddress, amountRaw],
    }, { onError });
  }, [amountRaw, approve, stats.asset, stats.poolAddress]);

  const handleDeposit = useCallback(() => {
    if (!address || amountRaw === 0n) return;
    deposit({
      address:      stats.poolAddress,
      abi:          LENDING_POOL_ABI,
      functionName: 'deposit',
      args:         [amountRaw, address],
    }, { onError });
  }, [address, amountRaw, deposit, stats.poolAddress]);

  const handleWithdraw = useCallback(() => {
    if (!address) return;
    if (isMax) {
      // Exit by shares so no dust is left behind.
      withdraw({
        address:      stats.poolAddress,
        abi:          LENDING_POOL_ABI,
        functionName: 'redeem',
        args:         [stats.userMaxRedeem, address, address],
      }, { onError });
      return;
    }
    if (amountRaw === 0n) return;
    withdraw({
      address:      stats.poolAddress,
      abi:          LENDING_POOL_ABI,
      functionName: 'withdraw',
      args:         [amountRaw, address, address],
    }, { onError });
  }, [address, isMax, amountRaw, withdraw, stats.poolAddress, stats.userMaxRedeem]);

  const setMax = () => {
    if (mode === 'DEPOSIT') {
      setAmount(formatUnits(usdcBalance ?? 0n, 6));
      setIsMax(false);
    } else {
      setAmount(formatUnits(stats.userMaxWithdraw, 6));
      setIsMax(true);
    }
  };

  const overBalance = mode === 'DEPOSIT'
    ? amountRaw > (usdcBalance ?? 0n)
    : !isMax && amountRaw > stats.userMaxWithdraw;
  const capReached = stats.depositCap > 0n && mode === 'DEPOSIT' && stats.totalAssets + amountRaw > stats.depositCap;

  return (
    <main className="min-h-screen bg-[#0D0F0E] px-4 py-12 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-display text-[#E8E6DF] font-medium redaction-text">
          Supply
        </h1>
        <p className="text-[#9C9A92] mt-2 text-sm max-w-xl">
          Deposit USDC into the Vestra lending pool (ERC-4626). Your shares earn the pool&apos;s floating interest from
          vesting-backed loans and can be redeemed any time liquidity is available.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
        <MetricCard label="Pool Assets" value={formatUsd(usdc(stats.totalAssets))} />
        <MetricCard label="Borrowed" value={formatUsd(usdc(stats.totalBorrowed))} />
        <MetricCard label="Utilization" value={pct(stats.utilizationBps)} />
        <MetricCard label="Borrow Rate (variable)" value={pct(stats.borrowRateBps)} />
        <MetricCard label="Est. Supply APY (variable)" value={pct(stats.supplyApyBps)} status="success" />
        <MetricCard label="Available Liquidity" value={formatUsd(usdc(stats.availableLiquidity))} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Deposit / Withdraw Panel */}
        <div className="lg:col-span-1">
          <GlassCard className="h-full border-[#1D9E75]/20 bg-gradient-to-b from-white/[0.05] to-transparent">
            <div className="flex gap-2 mb-6 p-1 rounded-lg bg-black/40 border border-white/5">
              {(['DEPOSIT', 'WITHDRAW'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setAmount(''); setIsMax(false); }}
                  className={cn(
                    "flex-1 py-2 text-[10px] font-bold rounded transition-all",
                    mode === m ? "bg-[#1D9E75]/30 text-white" : "text-[#9C9A92] hover:text-[#E8E6DF]"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-[#9C9A92]">Amount (USDC)</span>
                  <button onClick={setMax} className="text-[#5DCAA5] hover:underline">
                    {mode === 'DEPOSIT'
                      ? `Bal: ${formatUsd(usdc(usdcBalance ?? 0n))}`
                      : `Withdrawable: ${formatUsd(usdc(stats.userMaxWithdraw))}`}
                  </button>
                </div>
                <input
                  type="number"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setIsMax(false); }}
                  placeholder="0.00"
                  className="w-full bg-[#0D0F0E] border border-white/10 rounded-xl px-4 py-3 text-[#E8E6DF] font-mono text-xl focus:border-[#1D9E75] outline-none transition-all"
                />
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#9C9A92]">Est. Supply APY</span>
                  <span className="text-[#5DCAA5] font-bold">{pct(stats.supplyApyBps)} <span className="text-[10px] font-normal opacity-70">variable</span></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#9C9A92]">{mode === 'DEPOSIT' ? 'Shares received' : 'Shares burned'}</span>
                  <span className="text-[#E8E6DF] font-mono">
                    {previewShares !== undefined && amountRaw > 0n ? Number(formatUnits(previewShares as bigint, stats.shareDecimals)).toLocaleString() : '-'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#9C9A92]">Lock</span>
                  <span className="text-[#5DCAA5]">None (subject to available liquidity)</span>
                </div>
              </div>

              <p className="text-[10px] text-[#9C9A92] leading-relaxed">
                Supply APY ≈ borrow rate × utilization × (1 − {pct(stats.reserveFactorBps)} reserve factor). It moves with
                pool utilization and is not guaranteed. Lenders share losses not covered by the insurance vault.
              </p>

              {overBalance && <p className="text-amber-400/80 text-[10px]">Amount exceeds your {mode === 'DEPOSIT' ? 'balance' : 'withdrawable amount'}.</p>}
              {capReached && <p className="text-amber-400/80 text-[10px]">Deposit would exceed the pool cap of {formatUsd(usdc(stats.depositCap))}.</p>}

              {mode === 'DEPOSIT' ? (
                needsApproval ? (
                  <TxButton
                    onClick={handleApprove}
                    loading={approvePending}
                    disabled={!address || amountRaw === 0n || overBalance}
                    className="w-full py-4 text-lg"
                  >
                    Approve USDC
                  </TxButton>
                ) : (
                  <TxButton
                    onClick={handleDeposit}
                    loading={depositPending}
                    disabled={!address || amountRaw === 0n || overBalance || capReached}
                    className="w-full py-4 text-lg"
                  >
                    Deposit USDC
                  </TxButton>
                )
              ) : (
                <TxButton
                  onClick={handleWithdraw}
                  loading={withdrawPending}
                  disabled={!address || (!isMax && amountRaw === 0n) || overBalance || (isMax && stats.userMaxRedeem === 0n)}
                  className="w-full py-4 text-lg"
                >
                  Withdraw USDC
                </TxButton>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Position + pool details */}
        <div className="lg:col-span-2 space-y-8">
          <GlassCard>
            <h2 className="text-[#E8E6DF] font-medium text-lg mb-6 redaction-text uppercase tracking-widest">Your Position</h2>
            <LenderPositions />
          </GlassCard>

          <GlassCard>
            <h2 className="text-[#E8E6DF] font-medium text-lg mb-6 redaction-text uppercase tracking-widest">How the Pool Works</h2>
            <div className="grid md:grid-cols-3 gap-4 text-[11px] text-[#9C9A92] leading-relaxed">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[#E8E6DF] font-bold mb-1">Floating rate</div>
                Borrowers pay a utilization-based (kink) rate. Interest accrues to the pool continuously and raises the share price.
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[#E8E6DF] font-bold mb-1">Insurance reserve</div>
                {pct(stats.reserveFactorBps)} of interest goes to the insurance vault ({formatUsd(usdc(stats.insuranceBalance))} today), which covers liquidation shortfalls first.
              </div>
              <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="text-[#E8E6DF] font-bold mb-1">Exit</div>
                Withdraw or redeem any time, up to the pool&apos;s idle liquidity. There are no lock-ups or exit penalties.
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
