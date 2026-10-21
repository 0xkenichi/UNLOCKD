import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import SolanaProvider from './components/solana/SolanaProvider.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import './styles.css';
import { Analytics } from '@vercel/analytics/react';
import { WagmiProvider, createConfig as createWagmiConfig, http, injected } from 'wagmi';
import { walletConnect, coinbaseWallet, safe } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme, getDefaultWallets, connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  injectedWallet,
  walletConnectWallet,
  coinbaseWallet as rainbowCoinbaseWallet,
  phantomWallet,
  metaMaskWallet,
  rabbyWallet,
  safeWallet
} from '@rainbow-me/rainbowkit/wallets';
import '@rainbow-me/rainbowkit/styles.css';
import '@solana/wallet-adapter-react-ui/styles.css';
import { ALL_EVM_CHAINS, DEFAULT_EVM_CHAIN } from './utils/chains.js';
import { getContractAddress } from './utils/contracts.js';

const projectId = import.meta.env.VITE_WC_PROJECT_ID;
const hasWalletConnectProjectId = Boolean(
  projectId && projectId !== 'YOUR_WALLETCONNECT_PROJECT_ID'
);

// Build wagmi connectors
const baseConnectors = [injected()];
if (hasWalletConnectProjectId) {
  baseConnectors.push(
    walletConnect({ projectId, showQrModal: false }), // RainbowKit handles the modal
    coinbaseWallet({ appName: 'Vestra Protocol' }),
    safe()
  );
}

const transports = ALL_EVM_CHAINS.reduce((map, chain) => {
  const envKey = `VITE_EVM_RPC_${chain.id}`;
  const overrideUrl = import.meta.env?.[envKey];
  map[chain.id] = overrideUrl ? http(overrideUrl) : http();
  return map;
}, {});

const wagmiConfig = createWagmiConfig({
  chains: ALL_EVM_CHAINS,
  connectors: baseConnectors,
  transports
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    }
  }
});

// Alchemy Account Kit (optional feature gate). The provider still wraps the whole app, but its
// code is loaded on demand so @account-kit/* is not part of the entry bundle. The import starts
// immediately (not on first render) to keep the extra round trip as short as possible.
const hasAlchemyAccountKit = Boolean(import.meta.env.VITE_ALCHEMY_ACCOUNT_KIT_API_KEY);
const alchemyProviderModule = hasAlchemyAccountKit
  ? import('./components/common/AlchemyAccountKitProvider.jsx')
  : null;
const AlchemyAccountKitProvider = alchemyProviderModule ? lazy(() => alchemyProviderModule) : null;

// Same markup/classes as the static boot shell in index.html (its styles live in <head>).
function BootSplash() {
  return (
    <div className="boot-shell" role="status" aria-live="polite">
      <div className="boot-shell__mark" aria-hidden="true">
        <div className="boot-shell__ring" />
        <div className="boot-shell__v">V</div>
      </div>
      <p className="boot-shell__title">Vestra Protocol</p>
      <p className="boot-shell__sub">Loading…</p>
    </div>
  );
}

// RainbowKit custom dark theme matching Vestra design
const vestraTheme = darkTheme({
  accentColor: '#3b82f6',
  accentColorForeground: 'white',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

const runtimeAddresses = {
  loanManager: getContractAddress(DEFAULT_EVM_CHAIN.id, 'loanManager'),
  valuationEngine: getContractAddress(DEFAULT_EVM_CHAIN.id, 'valuationEngine'),
  vestingAdapter: getContractAddress(DEFAULT_EVM_CHAIN.id, 'vestingAdapter'),
  usdc: getContractAddress(DEFAULT_EVM_CHAIN.id, 'usdc')
};

console.info(
  `[contracts] default chain ${DEFAULT_EVM_CHAIN.name} (${DEFAULT_EVM_CHAIN.id})`,
  runtimeAddresses
);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Analytics />
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider
            theme={vestraTheme}
            appInfo={{
              appName: 'Vestra Protocol',
              learnMoreUrl: 'https://vestraprotocol.io/docs',
            }}
          >
            <SolanaProvider>
              {AlchemyAccountKitProvider ? (
                <Suspense fallback={<BootSplash />}>
                  <AlchemyAccountKitProvider queryClient={queryClient}>
                    <App />
                  </AlchemyAccountKitProvider>
                </Suspense>
              ) : (
                <App />
              )}
            </SolanaProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
