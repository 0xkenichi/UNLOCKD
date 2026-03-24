import React from 'react';

export function VcsBadge({ tier, score }: { tier: string; score: number }) {
  const isTitan = tier === 'TITAN';
  const isPremium = tier === 'PREMIUM';

  return (
    <div className={`px-3 py-1.5 rounded-full border ${isTitan ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : isPremium ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'} flex items-center space-x-2`}>
      <span className="text-[10px] uppercase font-bold tracking-widest leading-none pt-0.5 whitespace-nowrap">
        {tier} TIER
      </span>
    </div>
  );
}
