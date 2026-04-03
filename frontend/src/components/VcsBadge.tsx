import React, { useEffect, useState } from 'react';

const TIER_STYLES: Record<string, { bg: string; border: string; text: string; shadow: string }> = {
  'Titan Rank':    { bg: 'bg-[#FFD700]/10', border: 'border-[#FFD700]/30', text: 'text-[#FFD700]', shadow: 'shadow-[0_0_15px_-3px_rgba(255,215,0,0.3)]' },
  'Sapphire Rank': { bg: 'bg-[#0F52BA]/10', border: 'border-[#0F52BA]/30', text: 'text-[#4169E1]', shadow: 'shadow-[0_0_15px_-3px_rgba(15,82,186,0.3)]' },
  'Diamond Rank':  { bg: 'bg-[#E0E0E0]/10', border: 'border-[#E0E0E0]/30', text: 'text-[#B0C4DE]', shadow: 'shadow-[0_0_15px_-3px_rgba(224,224,224,0.3)]' },
  'Gold Rank':     { bg: 'bg-[#DAA520]/10', border: 'border-[#DAA520]/30', text: 'text-[#DAA520]', shadow: 'shadow-[0_0_15px_-3px_rgba(218,165,32,0.3)]' },
  'Silver Rank':   { bg: 'bg-[#C0C0C0]/10', border: 'border-[#C0C0C0]/30', text: 'text-[#A9A9A9]', shadow: 'shadow-[0_0_15px_-3px_rgba(192,192,192,0.3)]' },
  'Bronze Rank':   { bg: 'bg-[#CD7F32]/10', border: 'border-[#CD7F32]/30', text: 'text-[#CD7F32]', shadow: 'shadow-[0_0_15px_-3px_rgba(205,127,50,0.3)]' },
  'Scout':         { bg: 'bg-[#9C9A92]/10', border: 'border-[#9C9A92]/30', text: 'text-[#9C9A92]', shadow: '' },
  'TITAN':         { bg: 'bg-[#FFD700]/10', border: 'border-[#FFD700]/30', text: 'text-[#FFD700]', shadow: 'shadow-[0_0_15px_-3px_rgba(255,215,0,0.3)]' },
  'PREMIUM':       { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', shadow: 'shadow-[0_0_15px_-3px_rgba(168,85,247,0.3)]' },
  'STANDARD':      { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', shadow: '' },
};

export function VcsBadge({ tier, score }: { tier: string; score: number }) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const style = TIER_STYLES[tier] || TIER_STYLES['Scout'];
  const displayLabel = tier.toUpperCase().includes('TIER') || tier.toUpperCase().includes('RANK') 
    ? tier.toUpperCase() 
    : `${tier.toUpperCase()} RANK`;

  if (!mounted) return <div className="h-[38px] w-[140px] rounded-full bg-white/5 animate-pulse" />;

  return (
    <div className={`px-4 py-1.5 rounded-full border backdrop-blur-md transition-all ${style.bg} ${style.border} ${style.text} ${style.shadow} flex items-center gap-3`}>
      <div className="flex flex-col items-start">
        <span className="text-[10px] font-bold tracking-[0.2em] leading-none whitespace-nowrap">
          {displayLabel}
        </span>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="h-[2px] w-8 bg-current opacity-20 rounded-full" />
          <span className="text-[9px] opacity-60 font-mono tracking-tighter">TRUST: {score}</span>
        </div>
      </div>
    </div>
  );
}
