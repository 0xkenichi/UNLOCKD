import React from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { LENDING_POOL_ABI } from '@/abis/LendingPool';
import { usePoolStats } from '@/hooks/usePoolStats';
import { formatUsd } from '@/lib/utils';

/** The connected wallet's LendingPool (ERC-4626) position, read on-chain. */
export function LenderPositions() {
  const { address } = useAccount();
  const stats = usePoolStats();

  const { data: shareValue, isLoading } = useReadContract({
    address:      stats.poolAddress,
    abi:          LENDING_POOL_ABI,
    functionName: 'convertToAssets',
    args:         [stats.userShares],
    query:        { enabled: !!address && stats.userShares > 0n, refetchInterval: 15_000 },
  });

  if (!address) {
    return <div className="text-[#9C9A92] text-sm text-center py-6">Connect a wallet to see your position.</div>;
  }

  if (stats.isLoading || isLoading) {
    return <div className="text-[#9C9A92] text-sm text-center py-6 animate-pulse">Reading position...</div>;
  }

  if (stats.userShares === 0n) {
    return <div className="text-[#9C9A92] text-sm text-center py-6">No active deposits found.</div>;
  }

  const value = Number(formatUnits((shareValue as bigint | undefined) ?? 0n, 6));
  const withdrawable = Number(formatUnits(stats.userMaxWithdraw, 6));
  const shares = Number(formatUnits(stats.userShares, stats.shareDecimals));
  const poolShare = stats.totalSupply > 0n ? Number((stats.userShares * 1_000_000n) / stats.totalSupply) / 10_000 : 0;

  return (
    <div className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col md:flex-row justify-between gap-4 md:items-center">
      <div>
        <div className="text-[#E8E6DF] font-mono font-bold">{formatUsd(value)} USDC</div>
        <div className="flex gap-2 mt-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#9C9A92]">
            {shares.toLocaleString()} shares
          </span>
          <span className="text-[10px] text-[#9C9A92]">{poolShare.toFixed(2)}% of pool</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[#5DCAA5] text-sm font-bold">Withdrawable now: {formatUsd(withdrawable)}</div>
        <div className="text-[10px] text-[#9C9A92] mt-1">
          Earning {(Number(stats.supplyApyBps) / 100).toFixed(2)}% est. variable APY
        </div>
      </div>
    </div>
  );
}
