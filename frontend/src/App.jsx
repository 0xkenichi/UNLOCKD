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
  const isImmersiveDashboard = location.pathname === '/dashboard';
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

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      {!isLanding && !isImmersiveDashboard && (
        <header className="app-header">
          <div className="brand" onClick={() => navigate('/dashboard')}>
            <span className="brand-crest-global" aria-hidden="true" />
            <div>
              <div className="brand-title">VESTRA</div>
              <div className="brand-subtitle">Vesting Credit Protocol</div>
            </div>
          </div>
          <div className="header-nav">
            <div className="header-actions">
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
                onClick={() => navigate('/borrow')}
              >
                Borrow
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
                onClick={() => setWalletModalOpen(true)}
              >
                Connect
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
        className={`app-main ${isLanding ? 'app-main--landing' : ''} ${isImmersiveDashboard ? 'app-main--immersive' : ''}`}
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard onOpenWallet={() => setWalletModalOpen(true)} />} />
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
      {!isLanding && !isImmersiveDashboard && <AIBubble />}
      {!isLanding && !isImmersiveDashboard && <TabBar />}
      {!isImmersiveDashboard && (
        <footer className="app-footer">
          Testnet • VestraProtocol.io • Not financial advice
        </footer>
      )}
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
