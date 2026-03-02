import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate
} from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { ALL_EVM_CHAINS, SOLANA_NETWORKS } from './utils/chains.js';
import { getActiveIdentity, useOnchainSession } from './utils/onchainSession.js';
import { routeImports } from './routes.js';
import { FEATURE_FUNDRAISE_ONBOARD } from './utils/featureFlags.js';
import OnboardingModal from './components/onboarding/OnboardingModal.jsx';
import UnifiedWalletModal from './components/common/UnifiedWalletModal.jsx';
import AIBubble from './components/common/AIBubble.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import {
  trackEvent,
  flushAnalyticsQueue,
  initAnalyticsAutoCapture
} from './utils/analytics.js';

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
const AdminAirdrop = lazy(routeImports.adminAirdrop);
const AdminRisk = lazy(routeImports.adminRisk);
const Airdrop = lazy(routeImports.airdrop);
const Feedback = lazy(routeImports.feedback);
const FundraiseOnboard = lazy(routeImports.fundraiseOnboard);
const CommunityPools = lazy(routeImports.communityPools);
const Demo = lazy(routeImports.demo);

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
  const hasStandardHeader = !isLanding && !isImmersiveDashboard;
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const chainId = useChainId();
  const { address: connectedAddress, isConnecting, isReconnecting } = useAccount();
  const { session, setSession } = useOnchainSession();
  const allChainIds = ALL_EVM_CHAINS.map((chain) => chain.id);
  const isEvm = session.chainType !== 'solana';
  const showChainWarning = isEvm && chainId && !allChainIds.includes(chainId);
  const hasSolanaSession = Boolean(session.solanaWalletAddress);
  const solanaNetwork =
    SOLANA_NETWORKS.find((network) => network.id === session.solanaNetworkId) ||
    SOLANA_NETWORKS[0];
  const activeIdentity = getActiveIdentity(session, connectedAddress);
  const activeHeaderAddress = activeIdentity.walletAddress || '';
  const shortActiveHeaderAddress = activeHeaderAddress
    ? `${activeHeaderAddress.slice(0, 6)}…${activeHeaderAddress.slice(-4)}`
    : '';
  const trackedWalletRef = useRef('');
  const headerRef = useRef(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem('unlockd-theme') || 'dark';
  });

  useEffect(() => {
    const handleOpenWallet = () => setWalletModalOpen(true);
    window.addEventListener('crdt-open-wallet-modal', handleOpenWallet);
    return () => window.removeEventListener('crdt-open-wallet-modal', handleOpenWallet);
  }, []);

  useEffect(() => {
    if (!chainId || typeof window === 'undefined') return;
    window.localStorage.setItem('last-known-chain-id', String(chainId));
  }, [chainId]);

  useEffect(() => {
    initAnalyticsAutoCapture();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('unlockd-theme', theme);
    }
    trackEvent('theme_change', { theme });
  }, [theme]);

  useEffect(() => {
    trackEvent('page_view', {
      route: location.pathname,
      chainType: session.chainType
    });
  }, [location.pathname, session.chainType]);

  useEffect(() => {
    if (!connectedAddress) {
      trackedWalletRef.current = '';
      return;
    }
    const normalized = connectedAddress.toLowerCase();
    if (trackedWalletRef.current === normalized) return;
    trackedWalletRef.current = normalized;
    trackEvent('wallet_connect', {
      walletAddress: connectedAddress,
      chainId
    });
    flushAnalyticsQueue();
  }, [connectedAddress, chainId]);

  useEffect(() => {
    if (!connectedAddress) {
      setSession((prev) =>
        prev?.evmWalletAddress ? { ...prev, evmWalletAddress: null } : prev
      );
      return;
    }
    setSession((prev) => ({
      ...prev,
      evmWalletAddress: connectedAddress
    }));
  }, [connectedAddress, setSession]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    if (!hasStandardHeader) {
      root.style.setProperty('--app-header-offset', '0px');
      return undefined;
    }
    const headerNode = headerRef.current;
    if (!headerNode) return undefined;

    const syncHeaderOffset = () => {
      const height = Math.ceil(headerNode.getBoundingClientRect().height || 0);
      root.style.setProperty('--app-header-offset', `${height}px`);
    };

    syncHeaderOffset();
    window.addEventListener('resize', syncHeaderOffset);

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncHeaderOffset);
      observer.observe(headerNode);
    }

    return () => {
      window.removeEventListener('resize', syncHeaderOffset);
      if (observer) observer.disconnect();
    };
  }, [hasStandardHeader]);

  return (
    <div className={`app-shell ${hasStandardHeader ? 'has-fixed-header' : ''}`}>
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>
      {hasStandardHeader && (
        <header ref={headerRef} className="app-header">
          <div className="brand" onClick={() => navigate('/dashboard')}>
            <span className="brand-crest-global" aria-hidden="true" />
            <div>
              <div className="brand-title">VESTRA</div>
              <div className="brand-subtitle">Vesting Credit Protocol</div>
            </div>
          </div>
          <div className="header-nav" style={{ position: 'relative' }}>
            <div className="header-actions">
              {[
                { path: '/dashboard', label: 'Dashboard' },
                { path: '/borrow', label: 'Borrow' },
                { path: '/portfolio', label: 'Portfolio' },
                { path: '/community-pools', label: 'Community' },
                // { path: '/demo', label: 'Demo' },
                { path: '/airdrop', label: 'Airdrop' },
                { path: '/feedback', label: 'Feedback' },
              ].map((navItem) => {
                const isActive = location.pathname.startsWith(navItem.path);
                return (
                  <button
                    key={navItem.path}
                    className={`button ghost ${isActive ? 'active-nav' : ''}`}
                    type="button"
                    onClick={() => navigate(navItem.path)}
                    style={{ position: 'relative', background: 'transparent' }}
                  >
                    {navItem.label}
                    {isActive && (
                      <motion.div
                        layoutId="nav-underline"
                        style={{
                          position: 'absolute',
                          bottom: '-8px',
                          left: '10%',
                          right: '10%',
                          height: '2px',
                          background: 'var(--primary-400)',
                          boxShadow: '0 0 10px rgba(59, 130, 246, 0.8)',
                          borderRadius: '2px'
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}

              <button
                className="button ghost"
                type="button"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                className={`button ${activeHeaderAddress ? 'wallet-connected' : 'primary'}`}
                type="button"
                onClick={() => setWalletModalOpen(true)}
                style={!activeHeaderAddress ? { background: 'var(--gradient-button)', border: 'none', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' } : {}}
              >
                {activeHeaderAddress
                  ? `${activeIdentity.chainType === 'solana' ? 'Phantom' : 'Connected'} ${shortActiveHeaderAddress}`
                  : 'Connect'}
              </button>
            </div>
          </div>
        </header>
      )}
      {showChainWarning && (
        <div className="chain-warning">
          Please switch to Flow EVM, Base, Arbitrum, or Avalanche to continue.
        </div>
      )}
      {!showChainWarning &&
        session.chainType === 'solana' &&
        hasSolanaSession &&
        solanaNetwork && (
          <div className="chain-warning">
            Phantom wallet: switch to {solanaNetwork.name} to continue.
          </div>
        )}
      <main
        id="main-content"
        className={`app-main ${isLanding ? 'app-main--landing' : ''} ${isImmersiveDashboard ? 'app-main--immersive' : ''}`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{ width: '100%', minHeight: '100%' }}
          >
            <Suspense fallback={<RouteFallback />}>
              <Routes location={location}>
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
                <Route path="/admin/airdrop" element={<AdminAirdrop />} />
                <Route path="/admin/risk" element={<AdminRisk />} />
                <Route path="/airdrop" element={<Airdrop />} />
                <Route path="/feedback" element={<Feedback />} />
                <Route path="/community-pools" element={<CommunityPools />} />
                {FEATURE_FUNDRAISE_ONBOARD && (
                  <Route path="/fundraise" element={<FundraiseOnboard />} />
                )}
                <Route path="/demo" element={<Demo />} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>
      <OnboardingModal />
      <UnifiedWalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
      {!isLanding && <AIBubble />}
      {!isImmersiveDashboard && (
        <footer className="app-footer">
          Testnet • VestraProtocol.io • Not financial advice
        </footer>
      )}
      {isConnecting && !isReconnecting && (
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
