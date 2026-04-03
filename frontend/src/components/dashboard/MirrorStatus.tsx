"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Activity, RefreshCcw, Wifi, WifiOff } from 'lucide-react';

interface Mirror {
  id: string;
  source: string;
  status: 'active' | 'syncing' | 'error';
  lastSync: string;
  count: number;
}

const MOCK_MIRRORS: Mirror[] = [
  { id: '1', source: 'Mobula API', status: 'active', lastSync: '2m ago', count: 12 },
  { id: '2', source: 'DeFiLlama', status: 'syncing', lastSync: 'Now', count: 4 },
  { id: '3', source: 'DIA Oracle', status: 'active', lastSync: '5s ago', count: 8 },
  { id: '4', source: 'Dune GraphQL', status: 'error', lastSync: '1h ago', count: 0 },
];

export function MirrorStatus() {
  return (
    <div className="p-6 rounded-3xl bg-surface/40 backdrop-blur-xl border border-white/10 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter text-glow-teal italic">Sovereign Mirror Status</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-60">Cross-chain data acquisition logs</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-accent-teal/10 border border-accent-teal/20">
          <Activity className="w-4 h-4 text-accent-teal animate-pulse" />
          <span className="text-[10px] font-black text-accent-teal uppercase tracking-widest">Relayer Active</span>
        </div>
      </div>

      <div className="space-y-3">
        {MOCK_MIRRORS.map((mirror) => (
          <div 
            key={mirror.id}
            className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className={`p-2 rounded-xl ${
                mirror.status === 'active' ? 'bg-accent-teal/10' : 
                mirror.status === 'syncing' ? 'bg-accent-cyan/10' : 'bg-red-500/10'
              }`}>
                {mirror.status === 'active' ? <Wifi className="w-4 h-4 text-accent-teal" /> : 
                 mirror.status === 'syncing' ? <RefreshCcw className="w-4 h-4 text-accent-cyan animate-spin" /> : 
                 <WifiOff className="w-4 h-4 text-red-500" />}
              </div>
              <div>
                <p className="text-sm font-black text-secondary group-hover:text-primary transition-colors">{mirror.source}</p>
                <p className="text-[10px] font-medium text-secondary opacity-40">{mirror.count} assets discovered • {mirror.lastSync}</p>
              </div>
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-opacity">
              {mirror.status}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
