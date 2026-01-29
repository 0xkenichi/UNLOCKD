import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  sepolia,
  baseSepolia,
  avalancheFuji,
  base,
  mainnet
} from 'viem/chains';
import { getContractAddress } from './utils/contracts.js';

const projectId =
  import.meta.env.VITE_WC_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID';

const config = getDefaultConfig({
  appName: 'CRDT',
  projectId,
  chains: [sepolia, baseSepolia, avalancheFuji, base, mainnet],
  ssr: false
});

const queryClient = new QueryClient();
const runtimeAddresses = {
  loanManager: getContractAddress(sepolia.id, 'loanManager'),
  valuationEngine: getContractAddress(sepolia.id, 'valuationEngine'),
  vestingAdapter: getContractAddress(sepolia.id, 'vestingAdapter'),
  usdc: getContractAddress(sepolia.id, 'usdc')
};

console.info('[contracts] sepolia addresses', runtimeAddresses);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
