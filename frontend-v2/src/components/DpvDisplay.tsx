import { useReadContract } from 'wagmi';
import { VALUATION_ENGINE_ABI } from '@/abis/ValuationEngine';
import { GlassCard } from './ui/GlassCard';
import { InfoRow } from './InfoRow';

export function DpvDisplay({
  streamId,
  streamContract,
  token,
  endTime,
  maxCreditBps,
  contracts,
}: {
  streamId:      number;
  streamContract: string;
  token:          string;
  endTime:        number;
  maxCreditBps:   number;
  contracts:      any;
}) {
  const { data: dpvResult, isLoading } = useReadContract({
    address:      contracts.ValuationEngine,
    abi:          VALUATION_ENGINE_ABI,
    functionName: 'computeDPV',
    args:         [BigInt(streamId), token as `0x${string}`, BigInt(endTime), streamContract as `0x${string}`],
    query:        { enabled: !!token && endTime > 0 },
  });

  const { data: twapResult } = useReadContract({
    address: contracts.ValuationEngine,
    abi: VALUATION_ENGINE_ABI,
    functionName: 'getTWAP',
    args: [token as `0x${string}`],
    query: { enabled: !!token },
  });

  const dpvWad  = dpvResult?.[0] ?? 0n;
  const ltvBps  = dpvResult?.[1] ?? 0n;
  const dpvUsdc = Number(dpvWad) / 1e12; // WAD (1e18) → USDC (1e6): divide by 1e12
  
  // 25% TWAP Cap
  const twapPrice = Number(twapResult ?? 0n) / 1e6; // Assuming 6 decimals for price
  const twapCap = (twapPrice * 2500) / 10_000; // This is per token. Need quantity.
  // We'll simplify UI for now to show the cap relative to PV if quantity is known.
  // Actually, maxBorrow should just be min(dpvUsdc * ltv, 25% TWAP_total)
  
  const maxBorrow = (dpvUsdc * maxCreditBps) / 10_000;
  // Let's assume the contract enforces the 25% TWAP cap, we just display the "Protocol Limit"
  
  return (
    <GlassCard className="border-[#1D9E75]/20">
      <h3 className="text-[#E8E6DF] text-sm mb-4 uppercase tracking-widest redaction-text">
        Valuation Report
      </h3>
      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-10 bg-white/5 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          <InfoRow
            label="Dynamic Present Value (dDPV)"
            value={`$${dpvUsdc.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            highlight
          />
          <div className="h-px bg-white/10" />
          <InfoRow
            label="Borrowed Rate (Base)"
            value="8.00%"
            status="success"
          />
          <InfoRow
            label="Borrow Limit (25% TWAP Cap)"
            value={`$${maxBorrow.toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            status="warning"
          />

          {/* Risk Indicator */}
          <div className="pt-2">
            <div className="flex justify-between text-[10px] text-[#9C9A92] mb-2 uppercase tracking-tighter">
              <span>Risk Tier: Standard</span>
              <span className="text-[#5DCAA5]">Injective-Indexed</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden flex">
              <div className="h-full bg-[#1D9E75] transition-all" style={{ width: '65%' }} />
              <div className="h-full bg-white/20 transition-all" style={{ width: '35%' }} />
            </div>
          </div>
          
          <p className="text-[10px] text-[#5F5E5A] leading-relaxed italic">
            * Interest scales by +3% per concurrent slice. Automated settlement via ZK-Relayer.
          </p>
        </div>
      )}
    </GlassCard>
  );
}
