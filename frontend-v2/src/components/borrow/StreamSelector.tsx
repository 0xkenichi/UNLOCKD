import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { formatUnits } from 'viem';
import { Loader2, Box, ChevronRight } from 'lucide-react';

export function StreamSelector({ address, selected, onSelect }: any) {
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualId, setManualId] = useState('');

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    api.fetchVestedContracts(address)
      .then(res => {
        // Filter for Sablier or generic vesting
        setStreams(res || []);
      })
      .catch(err => console.error('Failed to fetch streams', err))
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <p className="text-[#9C9A92] text-sm">Select a discoverable stream or enter ID below.</p>
        {loading && <Loader2 className="w-4 h-4 text-[#1D9E75] animate-spin" />}
      </div>

      {streams.length > 0 ? (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {streams.map((s: any) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.collateralId || s.id)}
              className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                selected == (s.collateralId || s.id)
                  ? 'bg-[#1D9E75]/20 border-[#1D9E75] text-[#E8E6DF]'
                  : 'bg-white/5 border-white/10 text-[#9C9A92] hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/5">
                  <Box className="w-4 h-4 text-[#1D9E75]" />
                </div>
                <div>
                  <div className="font-mono text-xs text-[#E8E6DF]">ID: #{s.collateralId || s.id}</div>
                  <div className="text-[10px] opacity-60 uppercase">{s.protocol || 'Vesting'}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium">{parseFloat(formatUnits(BigInt(s.quantity || 0), 18)).toLocaleString()} {s.tokenSymbol || 'TOK'}</div>
                <ChevronRight className="w-4 h-4 ml-auto opacity-40" />
              </div>
            </button>
          ))}
        </div>
      ) : !loading && (
        <div className="py-6 text-center border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
          <p className="text-[#5F5E5A] text-xs">No streams discovered automatically.</p>
        </div>
      )}

      <div className="relative pt-2">
        <div className="absolute inset-0 flex items-center px-4" aria-hidden="true">
          <div className="w-full border-t border-white/5"></div>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase tracking-widest text-[#5F5E5A] bg-[#141614] px-2 w-fit mx-auto">
          Or Manual Entry
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          value={manualId}
          onChange={e => setManualId(e.target.value)}
          placeholder="Stream ID"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#E8E6DF] font-mono text-sm focus:outline-none focus:border-[#1D9E75]"
        />
        <button
          onClick={() => onSelect(Number(manualId))}
          disabled={!manualId}
          className="px-6 rounded-xl bg-[#1D9E75] text-[#0D0F0E] font-medium hover:bg-[#1D9E75]/90 disabled:opacity-50 transition-colors text-sm"
        >
          Select
        </button>
      </div>
    </div>
  );
}
