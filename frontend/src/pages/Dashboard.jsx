import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAccount, useChainId, useReadContract, useSwitchChain } from 'wagmi';
import { routeImports } from '../routes.js';
import PassportSummary from '../components/common/PassportSummary.jsx';
import { ALL_EVM_CHAINS } from '../utils/chains.js';
import { getContractAddress, loanManagerAbi, usdcAbi } from '../utils/contracts.js';
import { formatValue } from '../utils/format.js';
import { fetchKpiDashboard } from '../utils/api.js';
import usePassportSnapshot from '../utils/usePassportSnapshot.js';

const PortfolioPage = lazy(routeImports.portfolio);
const BorrowPage = lazy(routeImports.borrow);
const RepayPage = lazy(routeImports.repay);
const LenderPage = lazy(routeImports.lender);
const AuctionPage = lazy(routeImports.auction);
const GovernancePage = lazy(routeImports.governance);
const IdentityPage = lazy(routeImports.identity);
const FeaturesPage = lazy(routeImports.features);
const DocsPage = lazy(routeImports.docs);
const AboutPage = lazy(routeImports.about);

const modules = [
  { id: 'borrow', title: 'Borrow', subtitle: 'Collateralized vesting credit', component: BorrowPage },
  { id: 'repay', title: 'Repay', subtitle: 'Close and reclaim safely', component: RepayPage },
  { id: 'portfolio', title: 'Portfolio', subtitle: 'Unified positions + performance', component: PortfolioPage },
  { id: 'lender', title: 'Lender', subtitle: 'Deploy liquidity and earn', component: LenderPage },
  { id: 'auction', title: 'Auction', subtitle: 'Liquidation and market clearing', component: AuctionPage },
  { id: 'governance', title: 'Governance', subtitle: 'Vote, delegate, steer protocol', component: GovernancePage },
  { id: 'identity', title: 'Identity', subtitle: 'Onchain trust surface', component: IdentityPage },
  { id: 'features', title: 'Features', subtitle: 'Protocol architecture map', component: FeaturesPage },
  { id: 'docs', title: 'Docs', subtitle: 'Tech + integration references', component: DocsPage },
  { id: 'about', title: 'About', subtitle: 'Mission + team context', component: AboutPage }
];

const moduleLoaders = {
  borrow: routeImports.borrow,
  repay: routeImports.repay,
  portfolio: routeImports.portfolio,
  lender: routeImports.lender,
  auction: routeImports.auction,
  governance: routeImports.governance,
  identity: routeImports.identity,
  features: routeImports.features,
  docs: routeImports.docs,
  about: routeImports.about
};

const ZOOM_OPEN_DURATION_MS = 720;

function ModuleMiniPreview({ moduleId }) {
  const profile = {
    borrow: { top: '62%', line: '72%' },
    repay: { top: '48%', line: '68%' },
    portfolio: { top: '70%', line: '86%' },
    lender: { top: '56%', line: '64%' },
    auction: { top: '44%', line: '58%' },
    governance: { top: '52%', line: '74%' },
    identity: { top: '38%', line: '52%' },
    features: { top: '66%', line: '80%' },
    docs: { top: '74%', line: '84%' },
    about: { top: '42%', line: '60%' }
  }[moduleId] || { top: '54%', line: '76%' };

  return (
    <div className="immersive-preview-shell" aria-hidden="true">
      <div className="immersive-preview-top" style={{ width: profile.top }} />
      <div className="immersive-preview-grid">
        <div className="immersive-preview-block immersive-preview-block--wide" />
        <div className="immersive-preview-block" />
        <div className="immersive-preview-block" />
      </div>
      <div className="immersive-preview-lines">
        <span />
        <span style={{ width: profile.line }} />
      </div>
      <div className="immersive-preview-tag">{moduleId}</div>
    </div>
  );
}

function ModuleFallback({ moduleId }) {
  return (
    <div className="immersive-fallback" role="status" aria-live="polite">
      <ModuleMiniPreview moduleId={moduleId} />
      <div className="immersive-fallback-text">Preparing full view...</div>
    </div>
  );
}

export default function Dashboard({ onOpenWallet = () => {} }) {
  const prefersReducedMotion = useReducedMotion();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');
  const activeChain = useMemo(
    () => ALL_EVM_CHAINS.find((chain) => chain.id === chainId),
    [chainId]
  );
  const stageRef = useRef(null);
  const previous = useRef({ x: 0.5, y: 0.5, t: Date.now() });
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [pointerSpeed, setPointerSpeed] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const [hoverStart, setHoverStart] = useState(null);
  const [hoverElapsed, setHoverElapsed] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [networkPickerOpen, setNetworkPickerOpen] = useState(false);
  const [transitioningId, setTransitioningId] = useState(null);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [kpi, setKpi] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState('');
  const identityPassport = usePassportSnapshot(address);
  const transitionFrameRef = useRef(null);
  const transitionCommitRef = useRef(null);

  const { data: loanCount } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loanCount',
    query: { enabled: Boolean(loanManager) }
  });

  const { data: usdcBalance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [address || '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(usdc && address) }
  });

  const formattedBalance = useMemo(() => formatValue(usdcBalance, 6), [usdcBalance]);
  const loanCountValue = loanCount ? loanCount.toString() : '0';
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '--';
  const isWalletConnected = Boolean(address);

  const clearTransitionTimers = useCallback(() => {
    if (transitionFrameRef.current) {
      cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }
    if (transitionCommitRef.current) {
      clearTimeout(transitionCommitRef.current);
      transitionCommitRef.current = null;
    }
  }, []);

  const onMouseMove = useCallback((event) => {
    if (!stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const now = Date.now();
    const dt = (now - previous.current.t) / 1000 || 0.001;
    const dx = x - previous.current.x;
    const dy = y - previous.current.y;
    const speed = Math.min(1, Math.sqrt(dx * dx + dy * dy) / dt / 20);
    previous.current = { x, y, t: now };
    setMouse({ x, y });
    setPointerSpeed(speed);
  }, []);

  useEffect(() => {
    if (!hoveredId || !hoverStart) return;
    const timer = setInterval(() => {
      setHoverElapsed((Date.now() - hoverStart) / 1000);
    }, 60);
    return () => clearInterval(timer);
  }, [hoveredId, hoverStart]);

  useEffect(() => {
    const warmup = () => {
      Object.values(moduleLoaders).forEach((loader) => loader());
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warmup);
      return () => window.cancelIdleCallback(id);
    }
    const timeout = setTimeout(warmup, 800);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => clearTransitionTimers, [clearTransitionTimers]);

  useEffect(() => {
    let active = true;
    setKpiLoading(true);
    setKpiError('');
    fetchKpiDashboard(24)
      .then((nextKpi) => {
        if (!active) return;
        setKpi(nextKpi);
      })
      .catch((error) => {
        if (!active) return;
        setKpi(null);
        setKpiError(error?.message || 'Failed to load KPI data');
      })
      .finally(() => {
        if (active) setKpiLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const openModule = useCallback((moduleId) => {
    if (!moduleId || activeId === moduleId || transitioningId) return;
    moduleLoaders[moduleId]?.();

    if (prefersReducedMotion) {
      setActiveId(moduleId);
      return;
    }

    clearTransitionTimers();
    setTransitioningId(moduleId);
    setTransitionProgress(0);
    setHoveredId(moduleId);
    setHoverStart(Date.now());
    setHoverElapsed(0);

    const startedAt = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - startedAt) / ZOOM_OPEN_DURATION_MS);
      setTransitionProgress(progress);
      if (progress < 1) {
        transitionFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      transitionFrameRef.current = null;
      transitionCommitRef.current = setTimeout(() => {
        setActiveId(moduleId);
        setTransitioningId(null);
        setTransitionProgress(0);
        transitionCommitRef.current = null;
      }, 90);
    };
    transitionFrameRef.current = requestAnimationFrame(tick);
  }, [activeId, clearTransitionTimers, prefersReducedMotion, transitioningId]);

  useEffect(() => {
    if (
      !hoveredId ||
      activeId ||
      transitioningId ||
      prefersReducedMotion
    ) {
      return;
    }
    if (hoverElapsed >= 0.82 && pointerSpeed < 0.5) {
      openModule(hoveredId);
    }
  }, [
    hoveredId,
    hoverElapsed,
    pointerSpeed,
    activeId,
    transitioningId,
    prefersReducedMotion,
    openModule
  ]);

  const focusModuleId = activeId || transitioningId;
  const focusModule = modules.find((item) => item.id === focusModuleId);
  const FocusComponent = focusModule?.component;
  const revealProgress = activeId ? 1 : transitionProgress;

  return (
    <motion.div
      className="immersive-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="immersive-topbar">
        <div className="immersive-brand">
          <span className="brand-crest-global" aria-hidden="true" />
          <div>
            <div className="brand-title">VESTRA</div>
            <div className="brand-subtitle">Vesting Credit Command Center</div>
          </div>
        </div>
        <div className="immersive-actions">
          <button className="button ghost" type="button" onClick={() => openModule('portfolio')}>
            Portfolio
          </button>
          <button
            className={`button ${isWalletConnected ? 'wallet-connected' : ''}`}
            type="button"
            onClick={onOpenWallet}
          >
            {isWalletConnected ? `Connected ${shortAddress}` : 'Connect'}
          </button>
        </div>
      </header>

      <section
        ref={stageRef}
        className="immersive-stage"
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
          if (transitioningId) return;
          setHoveredId(null);
          setHoverElapsed(0);
          setHoverStart(null);
          setPointerSpeed(0);
          setMouse({ x: 0.5, y: 0.5 });
        }}
      >
        <div className="immersive-stage-grid" />

        <div className="immersive-core-card holo-card">
          <div className="stat-row">
            <div className="stat-card stat-card-minimal">
              <div className="stat-value">{loanCountValue}</div>
              <div className="stat-label">Loans</div>
            </div>
            <div className="stat-card stat-card-minimal">
              <div className="stat-value">{formattedBalance}</div>
              <div className="stat-label">USDC</div>
            </div>
            <button
              className="stat-card stat-card-minimal immersive-network-card"
              type="button"
              onClick={() => setNetworkPickerOpen((open) => !open)}
            >
              <div className="stat-value">{activeChain?.name || '—'}</div>
              <div className="stat-label">Network</div>
            </button>
          </div>
          <div className="stat-row">
            <div className="stat-card stat-card-minimal">
              <div className="stat-value">
                {kpiLoading ? '...' : (kpi?.growth?.uniqueWallets ?? 0).toString()}
              </div>
              <div className="stat-label">Unique wallets (24h)</div>
            </div>
            <div className="stat-card stat-card-minimal">
              <div className="stat-value">
                {kpiLoading ? '...' : (kpi?.credit?.loansCreated ?? 0).toString()}
              </div>
              <div className="stat-label">Loans created (24h)</div>
            </div>
            <div className="stat-card stat-card-minimal">
              <div className="stat-value">
                {kpiLoading ? '...' : (kpi?.risk?.defaults ?? 0).toString()}
              </div>
              <div className="stat-label">Defaults (24h)</div>
            </div>
          </div>
          {networkPickerOpen && (
            <div className="immersive-network-picker">
              {ALL_EVM_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  className={`pill ${chain.id === chainId ? 'active' : ''}`}
                  type="button"
                  onClick={() => {
                    switchChain({ chainId: chain.id });
                    setNetworkPickerOpen(false);
                  }}
                  disabled={isSwitchingChain}
                >
                  {chain.name}
                </button>
              ))}
            </div>
          )}
          {kpiError && <div className="muted">{kpiError}</div>}
          <PassportSummary
            as="div"
            className="muted"
            loading={identityPassport.loading}
            score={identityPassport.score}
            stamps={identityPassport.stamps}
          />
          <div className="muted">Connected: {shortAddress}</div>
        </div>
        <div className="immersive-modules-grid">
          {modules.map((module) => {
            const hovered = hoveredId === module.id;
            const transitioning = transitioningId === module.id;
            const hoverIntensity = hovered ? Math.min(1, hoverElapsed / 1.25) : 0;
            const transitionIntensity = transitioning ? transitionProgress : 0;
            const intensity = Math.max(hoverIntensity, transitionIntensity);
            const fastPenalty = 1 - pointerSpeed * 0.45;
            const tiltX = (mouse.y - 0.5) * 4 * fastPenalty;
            const tiltY = (mouse.x - 0.5) * -6 * fastPenalty;
            const scale = 1 + 0.04 * hoverIntensity + 0.16 * transitionIntensity;
            const lift = transitioning ? -24 * transitionIntensity : 0;
            const depth = transitioning ? 120 * transitionIntensity : 0;
            const fadeOthers = transitioningId && !transitioning ? Math.max(0.22, 1 - transitionProgress * 0.78) : 1;

            return (
              <motion.button
                key={module.id}
                type="button"
                className={`immersive-module-card ${hovered ? 'is-hovered' : ''} ${transitioning ? 'is-zooming' : ''} ${transitioningId && !transitioning ? 'is-dimming' : ''}`}
                style={{
                  transform: `perspective(1100px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(${lift}px) translateZ(${depth}px) scale(${scale})`,
                  opacity: fadeOthers
                }}
                onMouseEnter={() => {
                  if (transitioningId) return;
                  setHoveredId(module.id);
                  setHoverStart(Date.now());
                  setHoverElapsed(0);
                  moduleLoaders[module.id]?.();
                }}
                onMouseLeave={() => {
                  if (transitioningId) return;
                  setHoveredId(null);
                  setHoverStart(null);
                  setHoverElapsed(0);
                }}
                onClick={() => openModule(module.id)}
                disabled={Boolean(transitioningId)}
              >
                <div className="immersive-module-title">{module.title}</div>
                <div className="immersive-module-subtitle">{module.subtitle}</div>
                <div style={{ opacity: 0.6 + intensity * 0.4 }}>
                  <ModuleMiniPreview moduleId={module.id} />
                </div>
                {(hovered || transitioning) && (
                  <div className="immersive-module-zoom">
                    {transitioning
                      ? `Opening ${module.title} ${Math.round(transitionProgress * 100)}%`
                      : `Zooming into ${module.title}`}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </section>

      {focusModuleId && focusModule && (
        <div
          className={`immersive-focus-layer ${activeId ? '' : 'is-transitioning'}`}
          role="dialog"
          aria-modal="true"
          style={{
            opacity: 0.06 + revealProgress * 0.94,
            pointerEvents: activeId ? 'auto' : 'none'
          }}
        >
          <div
            className="immersive-focus-toolbar"
            style={{
              opacity: Math.max(0, revealProgress * 1.2 - 0.15)
            }}
          >
            <div className="immersive-focus-title">{focusModule.title}</div>
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                clearTransitionTimers();
                setTransitioningId(null);
                setTransitionProgress(0);
                setActiveId(null);
              }}
              disabled={!activeId}
            >
              Back to map
            </button>
          </div>
          <div
            className="immersive-focus-content"
            style={{
              opacity: Math.max(0.12, revealProgress),
              transform: `translateY(${(1 - revealProgress) * 18}px) scale(${0.98 + revealProgress * 0.02})`
            }}
          >
            {activeId && FocusComponent ? (
              <Suspense fallback={<ModuleFallback moduleId={activeId} />}>
                <FocusComponent />
              </Suspense>
            ) : (
              <ModuleFallback moduleId={focusModuleId} />
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
