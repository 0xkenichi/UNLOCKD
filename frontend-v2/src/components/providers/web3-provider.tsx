'use client';

import React from 'react';
import { 
  RainbowKitProvider, 
  darkTheme, 
  getDefaultConfig 
} from '@rainbow-me/rainbowkit';
import { WagmiProvider, http } from 'wagmi';
import { 
  sepolia, 
  mainnet, 
  base, 
  arbitrum, 
  avalanche 
} from 'wagmi/chains';
import { 
  QueryClientProvider, 
  QueryClient 
} from '@tanstack/react-query';
import '@rainbow-me/rainbowkit/styles.css';

// Vestra's custom chains (as defined in v1)
const flowEvm = {
  id: 747,
  name: 'Flow EVM',
  nativeCurrency: { name: 'Flow', symbol: 'FLOW', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://mainnet.evm.nodes.onflow.org'] },
  },
  blockExplorers: {
    default: { name: 'Flowscan', url: 'https://evm.flowscan.io' }
  }
};

const asiTestnet = {
  id: 42000,
  name: 'ASI Testnet',
  nativeCurrency: { name: 'Artificial Superintelligence', symbol: 'ASI', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-testnet.asi.network'] },
  },
  blockExplorers: {
    default: { name: 'ASIScan', url: 'https://explorer-testnet.asi.network' }
  },
  testnet: true
};

const config = getDefaultConfig({
  appName: 'Vestra Protocol',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'YOUR_PROJECT_ID',
  chains: [
    sepolia, 
    mainnet, 
    base, 
    arbitrum, 
    avalanche, 
    flowEvm as any, 
    asiTestnet as any
  ],
  transports: {
    [sepolia.id]: http(),
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [avalanche.id]: http(),
    [747]: http(),
    [42000]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient();

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
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
