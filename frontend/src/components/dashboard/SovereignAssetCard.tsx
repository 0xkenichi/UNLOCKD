"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Clock, Database, ExternalLink } from 'lucide-react';

interface SovereignAsset {
  chain: string;
  category: string;
  protocol: string;
  contractAddress: string;
  amount?: string;
  symbol: string;
  name: string;
  lastSynced?: string;
  description?: string;
  consensusScore?: number;
  isIlliquid?: boolean;
}

export function SovereignAssetCard({ asset }: { asset: SovereignAsset }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, scale: 1.02 }}
      className="p-6 rounded-3xl bg-surface/40 backdrop-blur-xl border border-white/10 hover:border-accent-teal/40 transition-all shadow-2xl group flex flex-col h-full"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-accent-teal/10 border border-accent-teal/20 group-hover:bg-accent-teal/20 transition-colors">
            <Shield className="w-5 h-5 text-accent-teal" />
          </div>
          <div>
            <h3 className="text-lg font-black uppercase tracking-tighter italic text-glow-teal">{asset.protocol}</h3>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-60">{asset.category} Acquisition</p>
              {asset.isIlliquid && (
                <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-accent-gold/20 text-accent-gold border border-accent-gold/30 uppercase tracking-widest animate-pulse">
                  Illiquid
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-1 rounded-lg bg-surface/60 border border-white/5 text-[9px] font-black uppercase tracking-widest text-secondary">
            {asset.chain}
          </div>
          <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <ExternalLink className="w-3.5 h-3.5 text-secondary opacity-40 hover:opacity-100" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        <div className="space-y-1">
          <div className="text-2xl font-black font-mono tracking-tighter redaction-text">
            {asset.amount || "LOCKED"} <span className="text-xs opacity-40">{asset.symbol}</span>
          </div>
          <p className="text-[11px] text-secondary font-medium leading-relaxed opacity-80">
            {asset.description || `Sovereign data mirror active for ${asset.name}.`}
          </p>
        </div>

        <div className="pt-4 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-secondary">
            <Database className="w-3 h-3 text-accent-cyan" />
            <span className="text-accent-cyan">Mirrored</span>
            {asset.consensusScore && (
              <span className="ml-1 px-1.5 py-0.5 rounded-md bg-accent-teal/10 text-accent-teal border border-accent-teal/20">
                {(asset.consensusScore * 100).toFixed(0)}% Match
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[9px] font-medium text-secondary opacity-50">
            <Clock className="w-3 h-3" />
            {asset.lastSynced ? new Date(asset.lastSynced).toLocaleTimeString() : 'Live'}
          </div>
        </div>
      </div>
      
      {/* Decorative Mirroring Progress Bar */}
      <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="h-full bg-gradient-to-r from-accent-teal/0 via-accent-teal to-accent-teal/0"
        />
      </div>
    </motion.div>
  );
}
