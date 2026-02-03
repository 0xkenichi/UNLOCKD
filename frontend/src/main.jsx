import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import '@rainbow-me/rainbowkit/styles.css';
import {
  connectorsForWallets,
  getDefaultConfig,
  RainbowKitProvider
} from '@rainbow-me/rainbowkit';
import {
  coinbaseWallet,
  metaMaskWallet,
  rainbowWallet,
  safeWallet,
  walletConnectWallet
} from '@rainbow-me/rainbowkit/wallets';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ALL_EVM_CHAINS } from './utils/chains.js';
import { getContractAddress } from './utils/contracts.js';
import SolanaProvider from './components/solana/SolanaProvider.jsx';

const projectId =
  import.meta.env.VITE_WC_PROJECT_ID || 'YOUR_WALLETCONNECT_PROJECT_ID';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Smart Accounts',
      wallets: [
        coinbaseWallet({
          appName: 'VESTRA',
          chains: ALL_EVM_CHAINS,
          preference: 'smartWalletOnly'
        })
      ]
    },
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet({ projectId, chains: ALL_EVM_CHAINS }),
        rainbowWallet({ projectId, chains: ALL_EVM_CHAINS }),
        walletConnectWallet({ projectId, chains: ALL_EVM_CHAINS }),
        safeWallet({ chains: ALL_EVM_CHAINS })
      ]
    }
  ],
  {
    appName: 'VESTRA',
    projectId
  }
);

const config = getDefaultConfig({
  appName: 'VESTRA',
  projectId,
  chains: ALL_EVM_CHAINS,
  ssr: false,
  connectors
});

const queryClient = new QueryClient();
const runtimeAddresses = {
  loanManager: getContractAddress(ALL_EVM_CHAINS[0]?.id, 'loanManager'),
  valuationEngine: getContractAddress(ALL_EVM_CHAINS[0]?.id, 'valuationEngine'),
  vestingAdapter: getContractAddress(ALL_EVM_CHAINS[0]?.id, 'vestingAdapter'),
  usdc: getContractAddress(ALL_EVM_CHAINS[0]?.id, 'usdc')
};

console.info('[contracts] sepolia addresses', runtimeAddresses);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <SolanaProvider>
          <RainbowKitProvider>
            <App />
          </RainbowKitProvider>
        </SolanaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
