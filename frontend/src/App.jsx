import { Suspense, lazy, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate
} from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { ALL_EVM_CHAINS, SOLANA_NETWORKS } from './utils/chains.js';
import { useOnchainSession } from './utils/onchainSession.js';
import { routeImports } from './routes.js';
import OnboardingModal from './components/onboarding/OnboardingModal.jsx';
import UnifiedWalletModal from './components/common/UnifiedWalletModal.jsx';
import AIBubble from './components/common/AIBubble.jsx';
import TabBar from './components/common/TabBar.jsx';

const Landing = lazy(routeImports.landing);
const Dashboard = lazy(routeImports.dashboard);
const Portfolio = lazy(routeImports.portfolio);
const Lender = lazy(routeImports.lender);
const Borrow = lazy(routeImports.borrow);
const Repay = lazy(routeImports.repay);
const Auction = lazy(routeImports.auction);
const Governance = lazy(routeImports.governance);
const Identity = lazy(routeImports.identity);
const Features = lazy(routeImports.features);
const Docs = lazy(routeImports.docs);
const About = lazy(routeImports.about);

function RouteFallback() {
  return (
    <div className="loading-row" role="status" aria-live="polite">
      <div className="spinner" />
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLanding = location.pathname === '/';
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const chainId = useChainId();
  const { isConnecting, isReconnecting } = useAccount();
  const { session } = useOnchainSession();
  const { wallet: solanaWallet, connected: solanaConnected } = useWallet();
  const allChainIds = ALL_EVM_CHAINS.map((chain) => chain.id);
  const isEvm = session.chainType !== 'solana';
  const showChainWarning = isEvm && chainId && !allChainIds.includes(chainId);
  const solanaNetwork =
    SOLANA_NETWORKS.find((network) => network.id === session.solanaNetworkId) ||
    SOLANA_NETWORKS[0];
  const publicDocsUrl =
    import.meta.env.VITE_PUBLIC_DOCS_URL || 'http://localhost:3000';

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      {!isLanding && (
        <header className="app-header">
          <div className="brand">
            <span className="brand-crest-global" aria-hidden="true" />
            <div>
              <div className="brand-title">VESTRA</div>
              <div className="brand-subtitle">Astra-grade vesting credit</div>
            </div>
          </div>
          <div className="header-nav">
            <div className="header-search">
              <span className="search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                className="search-input"
                placeholder="Search vaults, loans, assets"
                aria-label="Search"
              />
            </div>
            <div className="header-actions">
              <a
                className="button ghost"
                href={publicDocsUrl}
                target="_blank"
                rel="noreferrer"
              >
                Docs site
              </a>
              <button
                className="button ghost"
                type="button"
                onClick={() => navigate('/docs')}
              >
                In-app docs
              </button>
              <button
                className="button ghost tour-button"
                onClick={() =>
                  window.dispatchEvent(new Event('crdt-onboarding-reset'))
                }
                type="button"
              >
                Tour
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => navigate('/dashboard')}
              >
                Dashboard
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => navigate('/portfolio')}
              >
                Portfolio
              </button>
              <button
                className="button"
                type="button"
                onClick={() => navigate('/borrow')}
              >
                Borrow now
              </button>
              <button
                className="button"
                type="button"
                onClick={() => setWalletModalOpen(true)}
              >
                Connect Wallet
              </button>
            </div>
          </div>
        </header>
      )}
      {showChainWarning && (
        <div className="chain-warning">
          Please switch to Base, Arbitrum, or Avalanche to continue.
        </div>
      )}
      {!showChainWarning &&
        (session.chainType === 'solana' || solanaConnected || solanaWallet) &&
        solanaNetwork && (
        <div className="chain-warning">
          Phantom wallet: switch to {solanaNetwork.name} to continue.
        </div>
      )}
      <main
        id="main-content"
        className={`app-main ${isLanding ? 'app-main--landing' : ''}`}
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/lender" element={<Lender />} />
            <Route path="/borrow" element={<Borrow />} />
            <Route path="/repay" element={<Repay />} />
            <Route path="/auction" element={<Auction />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/identity" element={<Identity />} />
            <Route path="/features" element={<Features />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </Suspense>
      </main>
      <OnboardingModal />
      <UnifiedWalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
      {!isLanding && <AIBubble />}
      {!isLanding && <TabBar />}
      <footer className="app-footer">
        Testnet MVP — VestraProtocol.io (website not ready yet) — Contact: 0xkenichi@gmail.com — Not financial advice. Use at own risk. VESTRA is experimental. No real funds involved.
      </footer>
      {(isConnecting || isReconnecting) && (
        <div className="app-splash" role="status" aria-live="polite">
          <div className="vault-spinner" />
          <div className="app-splash-text">Connecting wallet...</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
