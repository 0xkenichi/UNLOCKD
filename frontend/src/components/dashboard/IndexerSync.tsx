"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Layers, Globe, Zap } from 'lucide-react';

export function IndexerSync() {
  const chains = [
    { name: 'Ethereum', block: '19,452,381', status: 'synced', color: 'text-accent-teal' },
    { name: 'Solana', block: '254,120,443', status: 'synced', color: 'text-accent-cyan' },
    { name: 'Base', block: '12,044,321', status: 'lagging', color: 'text-yellow-500' },
  ];

  return (
    <div className="p-6 rounded-3xl bg-surface/40 backdrop-blur-xl border border-white/10 shadow-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-2xl bg-accent-cyan/10 border border-accent-cyan/20">
          <Layers className="w-5 h-5 text-accent-cyan" />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-glow-cyan italic">Indexer Sync</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-60">Global state alignment</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {chains.map((chain) => (
          <div key={chain.name} className="p-4 rounded-2xl bg-white/5 border border-white/5 relative overflow-hidden group">
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-60">{chain.name}</span>
                <Globe className={`w-3.5 h-3.5 ${chain.color}`} />
              </div>
              <div className="text-lg font-black font-mono tracking-tighter group-hover:text-glow-cyan transition-all">
                #{chain.block}
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <div className={`w-1.5 h-1.5 rounded-full ${chain.status === 'synced' ? 'bg-accent-teal' : 'bg-yellow-500'} animate-pulse`} />
                <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{chain.status}</span>
              </div>
            </div>
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
              <Zap className="w-12 h-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
