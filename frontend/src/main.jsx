import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import './styles.css';
import './polyfills.js';
import { WagmiProvider, createConfig, http, injected } from 'wagmi';
import { walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ALL_EVM_CHAINS } from './utils/chains.js';
import { getContractAddress } from './utils/contracts.js';

const projectId = import.meta.env.VITE_WC_PROJECT_ID;
const hasWalletConnectProjectId = Boolean(
  projectId && projectId !== 'YOUR_WALLETCONNECT_PROJECT_ID'
);

const connectors = [injected()];
if (hasWalletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId,
      showQrModal: true
    })
  );
}

const transports = ALL_EVM_CHAINS.reduce((map, chain) => {
  map[chain.id] = http();
  return map;
}, {});

const config = createConfig({
  chains: ALL_EVM_CHAINS,
  connectors,
  transports
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
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
