"use client";

import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';
import { SolanaConnectButton } from '../common/SolanaConnectButton';
import { api } from '@/utils/api';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import { Droplets } from 'lucide-react';

export const Header = () => {
  const { address } = useAccount();

  const handleFaucet = async () => {
    if (!address) {
      toast.error('Connect EVM wallet first');
      return;
    }
    
    const toastId = toast.loading('Requesting testnet USDC...');
    try {
      const res = await api.faucetUsdc(address);
      if (res.ok) {
        toast.success(`Received 1,000 USDC! (TX: ${res.txHash.slice(0, 6)}...)`, { id: toastId });
      } else {
        toast.error(res.error || 'Faucet request failed', { id: toastId });
      }
    } catch (err: any) {
      toast.error(err.message || 'Faucet request failed', { id: toastId });
    }
  };

  return (
    <header className="fixed top-0 right-0 left-0 lg:left-64 h-20 z-30 flex items-center justify-between px-8 bg-background/50 backdrop-blur-xl border-b border-border-glass">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-teal">Sovereign Mode</span>
          <span className="text-xs font-bold text-secondary">Multi-Chain Active</span>
        </div>
        
        <button 
          onClick={handleFaucet}
          className="ml-4 px-4 py-2 rounded-xl bg-accent-teal/10 border border-accent-teal/20 text-accent-teal text-[10px] font-black uppercase tracking-widest hover:bg-accent-teal/20 transition-all flex items-center gap-2"
        >
          <Droplets size={14} />
          Faucet
        </button>
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
