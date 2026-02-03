import { Suspense, lazy } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate
} from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId } from 'wagmi';
import { baseSepolia, sepolia } from 'viem/chains';
import { routeImports } from './routes.js';
import OnboardingModal from './components/onboarding/OnboardingModal.jsx';
import AIBubble from './components/common/AIBubble.jsx';
import TabBar from './components/common/TabBar.jsx';

const Landing = lazy(routeImports.landing);
const Dashboard = lazy(routeImports.dashboard);
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
  const chainId = useChainId();
  const { isConnecting, isReconnecting } = useAccount();
  const desiredChainIds = [sepolia.id, baseSepolia.id];
  const showChainWarning =
    chainId && !desiredChainIds.includes(chainId);
  const publicDocsUrl =
    import.meta.env.VITE_PUBLIC_DOCS_URL || 'http://localhost:3000';

  return (
    <div className="app-shell">
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
                className="button"
                type="button"
                onClick={() => navigate('/borrow')}
              >
                Borrow now
              </button>
              <ConnectButton />
            </div>
          </div>
        </header>
      )}
      {showChainWarning && (
        <div className="chain-warning">
          Please switch to Sepolia/Base Sepolia
        </div>
      )}
      <main className={`app-main ${isLanding ? 'app-main--landing' : ''}`}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
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
      {!isLanding && <AIBubble />}
      {!isLanding && <TabBar />}
      <footer className="app-footer">
        Testnet MVP — Not financial advice. Use at own risk. VESTRA is
        experimental. No real funds involved.
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
