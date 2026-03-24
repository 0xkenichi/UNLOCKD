import React from 'react';

export function DurationSelector({ options, selected, onSelect, baseApy }: any) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {options.map((opt: any) => (
        <button
          key={opt.label}
          onClick={() => onSelect(opt)}
          className={`px-4 py-3 rounded-xl border transition-all ${selected.label === opt.label ? 'bg-[#1D9E75]/10 border-[#1D9E75] text-[#5DCAA5]' : 'bg-white/5 border-white/10 text-[#9C9A92] hover:bg-white/10'}`}
        >
          <div className="text-sm font-medium pr-1">{opt.label}</div>
          <div className="text-xs mt-1">
            {((baseApy * opt.multiplierBps) / 100_000).toFixed(1)}% APY
          </div>
        </button>
      ))}
    </div>
  );
}
