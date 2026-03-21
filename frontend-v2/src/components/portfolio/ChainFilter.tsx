import React, { useEffect, useState } from 'react';

const CHAINS = [
  { id: 'all', name: 'All Chains' },
  { id: 'ethereum', name: 'Mainnet' },
  { id: 'sepolia', name: 'Sepolia' },
  { id: 'base-sepolia', name: 'Base Sepolia' },
  { id: 'solana-devnet', name: 'Solana Devnet' }
];

interface ChainFilterProps {
  onFilterChange: (chainId: string) => void;
}

/**
 * ChainFilter
 * Sovereign style chips for multi-chain asset discovery.
 * Persists selection in localStorage per Vestra requirements.
 */
export const ChainFilter: React.FC<ChainFilterProps> = ({ onFilterChange }) => {
  const [activeChain, setActiveChain] = useState<string>('all');

  useEffect(() => {
    const savedFilter = localStorage.getItem('vestra-chain-filter');
    if (savedFilter) {
      setActiveChain(savedFilter);
      onFilterChange(savedFilter);
    }
  }, [onFilterChange]);

  const handleFilterClick = (chainId: string) => {
    setActiveChain(chainId);
    localStorage.setItem('vestra-chain-filter', chainId);
    onFilterChange(chainId);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-8">
      <span className="text-[10px] font-black uppercase tracking-widest text-secondary/40 mr-2">Cluster Node:</span>
      {CHAINS.map((chain) => (
        <button
          key={chain.id}
          onClick={() => handleFilterClick(chain.id)}
          className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
            activeChain === chain.id 
              ? 'bg-accent-cyan/10 border-accent-cyan text-accent-cyan shadow-[0_0_15px_rgba(0,240,255,0.2)]' 
              : 'bg-white/5 border-white/10 text-secondary/60 hover:bg-white/10 hover:border-white/20'
          }`}
        >
          {chain.name}
        </button>
      ))}
    </div>
  );
};
