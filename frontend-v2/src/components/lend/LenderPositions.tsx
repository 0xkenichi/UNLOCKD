import React from 'react';
import { useReadContract } from 'wagmi';
import { LENDING_POOL_ABI } from '@/abis/LendingPool';
import { formatUnits } from 'viem';

export function LenderPositions({ address, contracts }: any) {
  const { data: deposits } = useReadContract({
    address: contracts.LendingPool,
    abi: LENDING_POOL_ABI,
    functionName: 'getDeposits',
    args: [address!],
    query: { enabled: !!address },
  });

  if (!deposits || deposits.length === 0) {
    return <div className="text-[#9C9A92] text-sm text-center py-6">No active deposits found.</div>;
  }

  return (
    <div className="space-y-4">
      {deposits.map((dep: any, i: number) => (
        <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/5 flex justify-between items-center">
          <div>
            <div className="text-[#E8E6DF] font-mono">{formatUnits(dep.principal, 6)} USDC</div>
            <div className="text-[#9C9A92] text-xs mt-1">Lock: {Number(dep.lockDuration) / 86400} Days</div>
          </div>
          <div className="text-right">
            <div className="text-[#5DCAA5] text-sm">+{formatUnits(dep.accruedYield, 6)} USDC yield</div>
            <div className="text-[#9C9A92] text-xs mt-1">{dep.withdrawn ? 'Withdrawn' : 'Active'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
