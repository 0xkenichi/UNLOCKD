'use client';

import React from 'react';
import { 
  RainbowKitProvider, 
  darkTheme, 
  getDefaultConfig 
} from '@rainbow-me/rainbowkit';
import { WagmiProvider, http, fallback } from 'wagmi';
import { 
  sepolia, 
  mainnet, 
  base, 
  baseSepolia,
  arbitrum, 
  avalanche 
} from 'wagmi/chains';
import { 
  QueryClientProvider, 
  QueryClient 
} from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

import { config } from '@/lib/wagmi.config';

const queryClient = new QueryClient();

import { StealthProvider } from './stealth-provider';
import { SolanaProvider } from './solana-provider';

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={darkTheme({
            accentColor: '#2EBEB5',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
          modalSize="compact"
        >
          <SolanaProvider>
            <StealthProvider>
              {children}
            </StealthProvider>
          </SolanaProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
