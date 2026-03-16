"use client";

import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';
import { SolanaConnectButton } from '../common/SolanaConnectButton';

export const Header = () => {
  return (
    <header className="fixed top-0 right-0 left-0 lg:left-64 h-20 z-30 flex items-center justify-between px-8 bg-background/50 backdrop-blur-xl border-b border-border-glass">
      <div className="flex items-center gap-4">
        {/* Breadcrumbs or Page Title could go here in future */}
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-teal">Sovereign Mode</span>
          <span className="text-xs font-bold text-secondary">Multi-Chain Active</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col items-end"
        >
          <span className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-40 mb-1">EVM WALLET</span>
          <ConnectButton 
            accountStatus="address"
            chainStatus="icon"
            showBalance={false}
          />
        </motion.div>

        <div className="h-8 w-px bg-white/5" />

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col items-end"
        >
          <span className="text-[9px] font-black uppercase tracking-widest text-secondary opacity-40 mb-1">SOLANA WALLET</span>
          <SolanaConnectButton />
        </motion.div>
      </div>
    </header>
  );
};
