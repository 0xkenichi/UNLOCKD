import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/utils/api';
import { formatUsd } from '@/lib/utils';

export function LenderPositions({ address }: any) {
  // Polling backend API for live positions in Supabase
  const { data: response, isLoading } = useQuery({
    queryKey: ['lending-positions', address],
    queryFn: () => api.fetchLendingPositions(address),
    enabled: !!address,
    refetchInterval: 5000, 
  });

  const positions = response?.positions || [];

  if (isLoading) {
    return <div className="text-[#9C9A92] text-sm text-center py-6 animate-pulse">Syncing positions...</div>;
  }

  if (positions.length === 0) {
    return <div className="text-[#9C9A92] text-sm text-center py-6">No active deposits found.</div>;
  }

  return (
    <div className="space-y-4">
      {positions.map((pos: any, i: number) => {
        const principal = Number(pos.deposit_amount);
        const interest = Number(pos.current_accrued_interest || 0);
        const isFixed = pos.withdrawal_penalty_mode === 'FIXED';
        const penalty = isFixed ? principal * 0.02 : 0; 
        
        return (
          <div key={i} className="p-4 rounded-xl border border-white/10 bg-white/5 flex justify-between items-center group hover:border-[#1D9E75]/30 transition-all">
            <div>
              <div className="text-[#E8E6DF] font-mono font-bold">{formatUsd(principal)} USDC</div>
              <div className="flex gap-2 mt-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[#9C9A92]">
                  {pos.withdrawal_penalty_mode}
                </span>
                <span className="text-[10px] text-[#9C9A92]">
                  Synced: {new Date(pos.deposit_timestamp).toLocaleDateString()}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[#5DCAA5] text-sm font-bold">+{formatUsd(interest)} Yield</div>
              <div className="text-[10px] text-amber-500/80 mt-1">
                Exit Penalty: {formatUsd(penalty)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
