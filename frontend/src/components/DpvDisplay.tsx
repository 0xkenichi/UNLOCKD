import { useReadContracts } from 'wagmi';
import { useEffect } from 'react';
import { formatUnits } from 'viem';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { VALUATION_ENGINE_ABI } from '@/abis/ValuationEngine';
import { GlassCard } from './ui/GlassCard';
import { InfoRow } from './InfoRow';

const RANK_LABELS: Record<number, string> = { 1: 'Rank 1 (Blue-chip)', 2: 'Rank 2', 3: 'Rank 3 (Emerging)' };

/**
 * Origination valuation for a vesting stream, straight from the contracts:
 *   LoanManager.quoteMaxBorrow(token, quantity, unlockTime, nftContract) -> (maxBorrow, pv, ltvBps)
 * All USDC values are 6 decimals. The borrow rate floats with pool utilization.
 */
export function DpvDisplay({
  quantity,
  token,
  unlockTime,
  nftContract,
  contracts,
  onMaxBorrow,
}: {
  quantity:     bigint;
  token:        string;
  unlockTime:   number;
  nftContract:  string;
  contracts:    { loanManager: `0x${string}`; valuationEngine: `0x${string}` };
  onMaxBorrow?: (val: number) => void;
}) {
  const enabled = !!token && unlockTime > 0 && quantity > 0n;

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address:      contracts.loanManager,
        abi:          LOAN_MANAGER_ABI,
        functionName: 'quoteMaxBorrow',
        args:         [token as `0x${string}`, quantity, BigInt(unlockTime), nftContract as `0x${string}`],
      },
      { address: contracts.loanManager, abi: LOAN_MANAGER_ABI, functionName: 'currentRateBps' },
      { address: contracts.loanManager, abi: LOAN_MANAGER_ABI, functionName: 'originationFeeBps' },
      {
        address:      contracts.valuationEngine,
        abi:          VALUATION_ENGINE_ABI,
        functionName: 'rankOf',
        args:         [nftContract as `0x${string}`],
      },
    ],
    query: { enabled },
  });

  const quote = data?.[0]?.status === 'success'
    ? (data[0].result as readonly [bigint, bigint, bigint])
    : undefined;
  const quoteError    = data?.[0]?.status === 'failure';
  const maxBorrowRaw  = quote?.[0] ?? 0n;
  const pvRaw         = quote?.[1] ?? 0n;
  const ltvBps        = Number(quote?.[2] ?? 0n);
  const rateBps       = Number((data?.[1]?.result as bigint | undefined) ?? 0n);
  const feeBps        = Number((data?.[2]?.result as bigint | undefined) ?? 50n);
  const rank          = Number((data?.[3]?.result as number | bigint | undefined) ?? 0);

  const pvUsdc        = Number(formatUnits(pvRaw, 6));
  const maxBorrow     = Number(formatUnits(maxBorrowRaw, 6));

  // Sync back to parent
  useEffect(() => {
    if (onMaxBorrow) onMaxBorrow(maxBorrow);
  }, [maxBorrow, onMaxBorrow]);

  const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

  return (
    <GlassCard className="border-[#1D9E75]/20">
      <h3 className="text-[#E8E6DF] text-sm mb-4 uppercase tracking-widest redaction-text">
        Valuation Report
      </h3>
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-10 bg-white/5 rounded-xl" />)}
        </div>
      ) : quoteError ? (
        <p className="text-xs text-amber-400/80 leading-relaxed">
          The valuation engine could not price this stream (token not priced, frozen, or contract not ranked).
          Borrowing will revert until it can.
        </p>
      ) : (
        <div className="space-y-4">
          <InfoRow
            label="Present Value (dDPV)"
            value={usd(pvUsdc)}
            highlight
          />
          <InfoRow
            label="LTV"
            value={`${(ltvBps / 100).toFixed(2)}%`}
          />
          <InfoRow
            label="Max Borrow"
            value={usd(maxBorrow)}
            status="warning"
          />
          <div className="h-px bg-white/10" />
          <InfoRow
            label="Borrow Rate (variable APR)"
            value={`${(rateBps / 100).toFixed(2)}%`}
            status="success"
          />
          <InfoRow
            label="Origination Fee"
            value={`${(feeBps / 100).toFixed(2)}%`}
          />
          {rank > 0 && <InfoRow label="Risk Rank" value={RANK_LABELS[rank] ?? `Rank ${rank}`} />}

          <p className="text-[10px] text-[#5F5E5A] leading-relaxed italic">
            * The rate floats with pool utilization and applies to all open loans. The origination fee is
            deducted from the USDC you receive.
          </p>
        </div>
      )}
    </GlassCard>
  );
}
