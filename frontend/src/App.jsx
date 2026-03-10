// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
    BrowserRouter,
    Routes,
    Route,
    useLocation,
    useNavigate
} from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ALL_EVM_CHAINS, SOLANA_NETWORKS } from './utils/chains.js';
import { getActiveIdentity, useOnchainSession } from './utils/onchainSession.js';
import { ScannerProvider } from './utils/ScannerContext.jsx';
import { routeImports } from './routes.js';
import { FEATURE_FUNDRAISE_ONBOARD } from './utils/featureFlags.js';
import OnboardingModal from './components/onboarding/OnboardingModal.jsx';
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
const Hiring = lazy(routeImports.hiring);
const AdminAirdrop = lazy(routeImports.adminAirdrop);
const AdminRisk = lazy(routeImports.adminRisk);
const Airdrop = lazy(routeImports.airdrop);
const Feedback = lazy(routeImports.feedback);
const FundraiseOnboard = lazy(routeImports.fundraiseOnboard);
const CommunityPools = lazy(routeImports.communityPools);
const Demo = lazy(routeImports.demo);
const Admin = lazy(routeImports.admin);
const Treasury = lazy(routeImports.treasury);

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
    const hasStandardHeader = !isLanding;
    const chainId = useChainId();
    const { address: connectedAddress, isConnecting, isReconnecting } = useAccount();
    const { connected: solConnected } = useWallet();
    const { setVisible: setSolanaModalVisible } = useWalletModal();
    const { session, setSession } = useOnchainSession();
    const allChainIds = ALL_EVM_CHAINS.map((chain) => chain.id);
    const isEvm = session.chainType !== 'solana';
    const showChainWarning = isEvm && chainId && !allChainIds.includes(chainId);
    const hasSolanaSession = Boolean(session.solanaWalletAddress);
    const solanaNetwork =
        SOLANA_NETWORKS.find((network) => network.id === session.solanaNetworkId) ||
        SOLANA_NETWORKS[0];

    const headerRef = useRef(null);
    const [theme, setTheme] = useState(() => {
        if (typeof window === 'undefined') return 'dark';
        return window.localStorage.getItem('unlockd-theme') || 'dark';
    });

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
        if (isConnecting || isReconnecting) return;
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
    }, [connectedAddress, isConnecting, isReconnecting, setSession]);

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
                        <svg width="36" height="36" viewBox="0 0 120 120" fill="none" aria-label="Vestra" style={{ flexShrink: 0 }}>
                            <defs>
                                <radialGradient id="hdr-glow" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.35" />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                                </radialGradient>
                                <linearGradient id="hdr-blue" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#60a5fa" />
                                    <stop offset="100%" stopColor="#2563eb" />
                                </linearGradient>
                                <linearGradient id="hdr-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#f1c572" />
                                    <stop offset="100%" stopColor="#d99a22" />
                                </linearGradient>
                            </defs>
                            <circle cx="60" cy="58" r="46" fill="url(#hdr-glow)" />
                            <path d="M 22 72 A 42 42 0 0 1 98 72" stroke="url(#hdr-gold)" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" />
                            <path d="M 28 28 L 60 82" stroke="url(#hdr-blue)" strokeWidth="4" strokeLinecap="round" fill="none" />
                            <path d="M 92 28 L 60 82" stroke="url(#hdr-blue)" strokeWidth="4" strokeLinecap="round" fill="none" />
                            <path d="M 84 20 L 94 28 L 82 32" stroke="url(#hdr-gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            <circle cx="60" cy="58" r="5" fill="#3b82f6" opacity="0.9" />
                            <circle cx="60" cy="58" r="3" fill="#93c5fd" />
                            <circle cx="22" cy="72" r="2.5" fill="#d99a22" />
                            <circle cx="98" cy="72" r="2.5" fill="#d99a22" />
                        </svg>
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
                                { path: '/treasury', label: 'Treasury' },
                                { path: '/identity', label: 'Identity' },
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
                                style={{ padding: '0 12px' }}
                            >
                                {theme === 'dark' ? 'Light' : 'Dark'}
                            </button>

                            {/* Phantom / Solana wallet connect */}
                            <button
                                type="button"
                                onClick={() => setSolanaModalVisible(true)}
                                title={solConnected ? 'Solana wallet connected' : 'Connect Solana / Phantom'}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 12px',
                                    borderRadius: 'var(--radius-full)',
                                    border: `1px solid ${solConnected ? 'rgba(153,69,255,0.5)' : 'rgba(153,69,255,0.25)'}`,
                                    background: solConnected ? 'rgba(153,69,255,0.15)' : 'rgba(153,69,255,0.06)',
                                    color: solConnected ? '#c084fc' : 'var(--text-secondary)',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <span style={{ fontSize: 15 }}>◎</span>
                                {solConnected ? 'Phantom' : 'Phantom'}
                                {solConnected && (
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#a855f7', display: 'inline-block', boxShadow: '0 0 6px #a855f7' }} />
                                )}
                            </button>

                            <ConnectButton
                                chainStatus="icon"
                                showBalance={false}
                                accountStatus={{
                                    smallScreen: 'avatar',
                                    largeScreen: 'full',
                                }}
                            />
                        </div>
                    </div>
                </header>
            )}
            {!isLanding && showChainWarning && (
                <div className="chain-warning">
                    Please switch to Flow EVM, Base, Arbitrum, or Avalanche to continue.
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
                                <Route path="/hiring" element={<Hiring />} />
                                <Route path="/admin/airdrop" element={<AdminAirdrop />} />
                                <Route path="/admin/risk" element={<AdminRisk />} />
                                <Route path="/airdrop" element={<Airdrop />} />
                                <Route path="/feedback" element={<Feedback />} />
                                <Route path="/community-pools" element={<CommunityPools />} />
                                {FEATURE_FUNDRAISE_ONBOARD && (
                                    <Route path="/fundraise" element={<FundraiseOnboard />} />
                                )}
                                <Route path="/demo" element={<Demo />} />
                                <Route path="/admin" element={<Admin />} />
                                <Route path="/treasury" element={<Treasury />} />
                            </Routes>
                        </Suspense>
                    </motion.div>
                </AnimatePresence>
            </main>
            <OnboardingModal />
            {!isLanding && <AIBubble />}
            {!isImmersiveDashboard && !isLanding && (
                <footer className="app-footer">
                    Mainnet Beta • VestraProtocol.io • Not financial advice
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
            <ScannerProvider>
                <AppShell />
            </ScannerProvider>
        </BrowserRouter>
    );
}
