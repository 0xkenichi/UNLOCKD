"use client";

import React from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { motion } from 'framer-motion';

export const Header = () => {
  return (
    <header className="fixed top-0 right-0 left-0 lg:left-64 h-20 z-30 flex items-center justify-between px-8 bg-background/50 backdrop-blur-xl border-b border-border-glass">
      <div className="flex items-center gap-4">
        {/* Breadcrumbs or Page Title could go here in future */}
      </div>

      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-4"
      >
        <ConnectButton 
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </motion.div>
    </header>
  );
};
