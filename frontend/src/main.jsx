import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import './styles.css';
import './polyfills.js';
import { WagmiProvider, createConfig as createWagmiConfig, http, injected } from 'wagmi';
import { walletConnect } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ALL_EVM_CHAINS } from './utils/chains.js';
import { getContractAddress } from './utils/contracts.js';
import { AlchemyAccountProvider, createConfig as createAlchemyConfig } from '@account-kit/react';
import { alchemy, baseSepolia, sepolia } from '@account-kit/infra';

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

const config = createWagmiConfig({
  chains: ALL_EVM_CHAINS,
  connectors,
  transports
});

const queryClient = new QueryClient();
const alchemyApiKey = import.meta.env.VITE_ALCHEMY_ACCOUNT_KIT_API_KEY;
const alchemyPolicyId = import.meta.env.VITE_ALCHEMY_ACCOUNT_KIT_POLICY_ID;
const alchemyChainName = String(import.meta.env.VITE_ALCHEMY_ACCOUNT_KIT_CHAIN || 'sepolia');
const alchemyChain = alchemyChainName === 'base-sepolia' ? baseSepolia : sepolia;
const hasAlchemyAccountKit = Boolean(alchemyApiKey);

const alchemyConfig = hasAlchemyAccountKit
  ? createAlchemyConfig(
      {
        transport: alchemy({ apiKey: alchemyApiKey }),
        chain: alchemyChain,
        ...(alchemyPolicyId ? { policyId: alchemyPolicyId } : {})
      },
      {
        auth: {
          sections: [[{ type: 'email' }], [{ type: 'passkey' }]],
          addPasskeyOnSignup: true
        }
      }
    )
  : null;

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
          {hasAlchemyAccountKit && alchemyConfig ? (
            <AlchemyAccountProvider config={alchemyConfig} queryClient={queryClient}>
              <App />
            </AlchemyAccountProvider>
          ) : (
            <App />
          )}
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
