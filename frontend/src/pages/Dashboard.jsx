// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useAccount, useChainId, useReadContract, useSwitchChain } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { routeImports } from '../routes.js';
import PassportSummary from '../components/common/PassportSummary.jsx';
import { ALL_EVM_CHAINS, SOLANA_NETWORKS } from '../utils/chains.js';
import { getContractAddress, loanManagerAbi, usdcAbi } from '../utils/contracts.js';
import { formatValue } from '../utils/format.js';
import { fetchAgentReplay, fetchAnalyticsBenchmark, fetchKpiDashboard } from '../utils/api.js';
import usePassportSnapshot from '../utils/usePassportSnapshot.js';
import { useOnchainSession } from '../utils/onchainSession.js';
import DashboardHolo from '../components/dashboard/DashboardHolo.jsx';

import { IsometricVaultHero } from '../components/visuals/IsometricHeroes.jsx';
import {
  ShieldCheck,
  TrendingUp,
  LineChart,
  Users,
  Search,
  Activity,
  History,
  LayoutDashboard,
  Coins,
  Library,
  Info
} from 'lucide-react';

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
const CommunityPoolsPage = lazy(routeImports.communityPools);

const modules = [
  { id: 'borrow', title: 'Borrow', subtitle: 'Collateralized vesting credit', component: BorrowPage, icon: Coins },
  { id: 'repay', title: 'Repay', subtitle: 'Close and reclaim safely', component: RepayPage, icon: History },
  { id: 'portfolio', title: 'Portfolio', subtitle: 'Unified positions + performance', component: PortfolioPage, icon: LayoutDashboard },
  { id: 'lender', title: 'Lender', subtitle: 'Deploy liquidity and earn', component: LenderPage, icon: LineChart },
  { id: 'auction', title: 'Auction', subtitle: 'Liquidation and market clearing', component: AuctionPage, icon: Activity },
  { id: 'governance', title: 'Governance', subtitle: 'Vote, delegate, steer protocol', component: GovernancePage, icon: Users },
  { id: 'identity', title: 'Identity', subtitle: 'Onchain trust surface', component: IdentityPage, icon: ShieldCheck },
  { id: 'features', title: 'Features', subtitle: 'Protocol architecture map', component: FeaturesPage, icon: Search },
  { id: 'docs', title: 'Docs', subtitle: 'Tech + integration references', component: DocsPage, icon: Library },
  { id: 'about', title: 'About', subtitle: 'Mission + team context', component: AboutPage, icon: Info },
  { id: 'communityPools', title: 'Community Pools', subtitle: 'Group capital formation rails', component: CommunityPoolsPage, icon: TrendingUp }
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
  about: routeImports.about,
  communityPools: routeImports.communityPools
};

const ZOOM_OPEN_DURATION_MS = 720;

function ModuleMiniPreview({ moduleId }) {
  const mod = modules.find(m => m.id === moduleId);
  const Icon = mod?.icon || Activity;
  // A sleek, subtle preview block representing the module's nature
  return (
    <div className="immersive-preview-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '64px', background: 'rgba(10, 14, 20, 0.4)' }}>
      <Icon size={32} strokeWidth={1.5} color="var(--primary-400)" style={{ filter: 'drop-shadow(0 0 12px rgba(59, 130, 246, 0.6))' }} />
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

export default function Dashboard() {
  const { openConnectModal } = useConnectModal();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const prefersReducedMotion = useReducedMotion();
  const { address } = useAccount();
  const chainId = useChainId();
  const { session } = useOnchainSession();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');
  const activeChain = useMemo(
    () => ALL_EVM_CHAINS.find((chain) => chain.id === chainId),
    [chainId]
  );
  const activeSolanaNetwork = useMemo(
    () =>
      SOLANA_NETWORKS.find((network) => network.id === session.solanaNetworkId) ||
      SOLANA_NETWORKS[0],
    [session.solanaNetworkId]
  );
  const isSolanaSession =
    session.chainType === 'solana' || Boolean(session.solanaWalletAddress);
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
  const [benchmark, setBenchmark] = useState(null);
  const [agentReplay, setAgentReplay] = useState(null);
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
  const activeWalletAddress = isSolanaSession
    ? session.solanaWalletAddress || ''
    : address || '';
  const shortAddress = activeWalletAddress
    ? `${activeWalletAddress.slice(0, 6)}…${activeWalletAddress.slice(-4)}`
    : '--';
  const isWalletConnected = Boolean(activeWalletAddress);

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

  useEffect(() => {
    let active = true;
    fetchAnalyticsBenchmark(30)
      .then((nextBenchmark) => {
        if (!active) return;
        setBenchmark(nextBenchmark);
      })
      .catch(() => {
        if (!active) return;
        setBenchmark(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchAgentReplay(48)
      .then((nextReplay) => {
        if (!active) return;
        setAgentReplay(nextReplay);
      })
      .catch(() => {
        if (!active) return;
        setAgentReplay(null);
      });
    return () => {
      active = false;
    };
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
  const replayBars = useMemo(() => {
    const points = Array.isArray(agentReplay?.timeline)
      ? agentReplay.timeline.slice(-12)
      : [];
    const peak = Math.max(1, ...points.map((item) => Number(item?.count || 0)));
    return points.map((item) => ({
      t: item.t,
      count: Number(item?.count || 0),
      confidenceAvg:
        Number.isFinite(item?.confidenceAvg) ? Number(item.confidenceAvg) : null,
      heightPct: Math.max(8, Math.round((Number(item?.count || 0) / peak) * 100))
    }));
  }, [agentReplay]);

  return (
    <motion.div
      className="immersive-shell"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ── Isometric vault hero banner ── */}
      {!activeId && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: 'min(440px, 42vw)', height: '240px',
          pointerEvents: 'none', zIndex: 1, opacity: 0.75,
          mask: 'linear-gradient(to left, rgba(0,0,0,1) 40%, transparent 100%)',
          WebkitMask: 'linear-gradient(to left, rgba(0,0,0,1) 40%, transparent 100%)'
        }}>
          <IsometricVaultHero width={440} height={240} />
        </div>
      )}

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
          <div className="stat-row" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-primary)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
            <div className="stat-card stat-card-minimal" style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <div className="stat-value" style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--primary-300)', textShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}>{loanCountValue}</div>
              <div className="stat-label" style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Loans</div>
            </div>
            <div className="stat-card stat-card-minimal" style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <div className="stat-value" style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--primary-300)', textShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}>{formattedBalance}</div>
              <div className="stat-label" style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>USDC</div>
            </div>
            <button
              className="stat-card stat-card-minimal immersive-network-card"
              type="button"
              style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', transition: 'all 0.2s', textAlign: 'left' }}
              onClick={() => {
                if (isSolanaSession) {
                  setSolanaModalVisible(true);
                  return;
                }
                if (openConnectModal) {
                  openConnectModal();
                } else {
                  setNetworkPickerOpen((open) => !open);
                }
              }}
            >
              <div className="stat-value" style={{ fontSize: '20px', color: '#fff' }}>
                {isSolanaSession ? activeSolanaNetwork?.name || 'Solana' : activeChain?.name || '—'}
              </div>
              <div className="stat-label" style={{ color: 'var(--primary-400)' }}>Network</div>
            </button>
          </div>
          <div className="stat-row" style={{ padding: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
            <div className="stat-card stat-card-minimal" style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <div className="stat-value" style={{ fontSize: '24px' }}>
                {kpiLoading ? '...' : (kpi?.growth?.uniqueWallets ?? 0).toString()}
              </div>
              <div className="stat-label">Unique wallets (24h)</div>
            </div>
            <div className="stat-card stat-card-minimal" style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <div className="stat-value" style={{ fontSize: '24px' }}>
                {kpiLoading ? '...' : (kpi?.credit?.loansCreated ?? 0).toString()}
              </div>
              <div className="stat-label">Loans created (24h)</div>
            </div>
            <div className="stat-card stat-card-minimal" style={{ background: 'transparent', border: 'none', padding: 0 }}>
              <div className="stat-value" style={{ fontSize: '24px' }}>
                {kpiLoading ? '...' : (kpi?.risk?.defaults ?? 0).toString()}
              </div>
              <div className="stat-label">Defaults (24h)</div>
            </div>
          </div>
          {networkPickerOpen && !isSolanaSession && (
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
          {benchmark && (
            <div className="muted">
              30d benchmark: {benchmark.uniqueWallets || 0} wallets,{' '}
              {benchmark.funnel?.conversionRatesPct?.quoteRequestedToLoanCreated || 0}% quote-to-loan conversion.
            </div>
          )}
          {kpi?.engagement?.demandSignals?.chainSupportRequested ? (
            <div className="muted">
              Chain support requests (24h): {kpi.engagement.demandSignals.chainSupportRequested}
            </div>
          ) : null}
          {agentReplay && (
            <div className="agent-replay-mini">
              <div className="agent-replay-head">
                <strong>AI Replay (48h)</strong>
                <span className="muted small">
                  intent: {agentReplay.topIntent || 'unknown'} · avg conf:{' '}
                  {Number.isFinite(agentReplay.avgConfidence)
                    ? `${Math.round(agentReplay.avgConfidence * 100)}%`
                    : '--'}
                </span>
              </div>
              <div className="agent-replay-head muted small">
                drift:{' '}
                {Number.isFinite(agentReplay?.drift?.confidenceDelta)
                  ? `${agentReplay.drift.confidenceDelta > 0 ? '+' : ''}${(
                    agentReplay.drift.confidenceDelta * 100
                  ).toFixed(1)} pts`
                  : '--'}{' '}
                · turns: {agentReplay.totalTurns || 0}
              </div>
              <div className="agent-replay-bars" aria-label="AI replay drift bars">
                {replayBars.map((point) => (
                  <span
                    key={point.t}
                    className="agent-replay-bar"
                    style={{
                      height: `${point.heightPct}%`,
                      opacity:
                        point.confidenceAvg === null
                          ? 0.35
                          : Math.min(1, Math.max(0.35, point.confidenceAvg + 0.15))
                    }}
                    title={`${new Date(point.t).toLocaleString()} · turns: ${point.count
                      } · confidence: ${point.confidenceAvg !== null
                        ? `${Math.round(point.confidenceAvg * 100)}%`
                        : '--'
                      }`}
                  />
                ))}
              </div>
            </div>
          )}
          <PassportSummary
            as="div"
            className="muted"
            loading={identityPassport.loading}
            score={identityPassport.score}
            stamps={identityPassport.stamps}
          />
          <div className="muted">
            Connected: {shortAddress}
            {isSolanaSession ? ` (${activeSolanaNetwork?.name || 'Solana'})` : ''}
          </div>
        </div>

        <div className="w-full mt-6 mb-8 max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <DashboardHolo positions={[
              { title: "TGE Event", amount: "100,000 CRDT" },
              { title: "Cliff End", amount: "25,000 CRDT" },
              { title: "Quarter 3 Vest", amount: "12,500 CRDT" },
              { title: "Quarter 4 Vest", amount: "12,500 CRDT" },
              { title: "Final Unlock", amount: "50,000 CRDT" }
            ]} />
          </div>

        </div>

        <div className="immersive-modules-grid">
          {modules.map((module) => {
            const hovered = hoveredId === module.id;
            const transitioning = transitioningId === module.id;
            const hoverIntensity = hovered ? Math.min(1, hoverElapsed / 1.0) : 0;
            const transitionIntensity = transitioning ? transitionProgress : 0;
            const intensity = Math.max(hoverIntensity, transitionIntensity);
            const fastPenalty = 1 - pointerSpeed * 0.6; // less erratic when moving fast
            const tiltX = (mouse.y - 0.5) * 6 * fastPenalty;
            const tiltY = (mouse.x - 0.5) * -8 * fastPenalty;
            const scale = 1 + 0.02 * hoverIntensity + 0.3 * transitionIntensity;
            const lift = transitioning ? -45 * transitionIntensity : 0;
            const depth = transitioning ? 250 * transitionIntensity : 0;
            const fadeOthers = transitioningId && !transitioning ? Math.max(0.1, 1 - transitionProgress * 0.9) : 1;

            return (
              <motion.button
                key={module.id}
                type="button"
                data-guide-id={`dashboard-open-${module.id}`}
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
              opacity: Math.max(0.05, revealProgress),
              transform: `translateY(${(1 - revealProgress) * 40}px) scale(${0.92 + revealProgress * 0.08})`
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
