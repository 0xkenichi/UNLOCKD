import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { routeImports } from '../routes.js';
import { ALL_EVM_CHAINS } from '../utils/chains.js';
import { getContractAddress, loanManagerAbi, usdcAbi } from '../utils/contracts.js';
import { formatValue } from '../utils/format.js';

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
  { id: 'borrow', title: 'Borrow', subtitle: 'Collateralized vesting credit', x: 12, y: 16, component: BorrowPage },
  { id: 'repay', title: 'Repay', subtitle: 'Close and reclaim safely', x: 70, y: 14, component: RepayPage },
  { id: 'portfolio', title: 'Portfolio', subtitle: 'Unified positions + performance', x: 44, y: 38, component: PortfolioPage },
  { id: 'lender', title: 'Lender', subtitle: 'Deploy liquidity and earn', x: 12, y: 62, component: LenderPage },
  { id: 'auction', title: 'Auction', subtitle: 'Liquidation and market clearing', x: 70, y: 62, component: AuctionPage },
  { id: 'governance', title: 'Governance', subtitle: 'Vote, delegate, steer protocol', x: 32, y: 76, component: GovernancePage },
  { id: 'identity', title: 'Identity', subtitle: 'Onchain trust surface', x: 56, y: 78, component: IdentityPage },
  { id: 'features', title: 'Features', subtitle: 'Protocol architecture map', x: 28, y: 26, component: FeaturesPage },
  { id: 'docs', title: 'Docs', subtitle: 'Tech + integration references', x: 56, y: 24, component: DocsPage },
  { id: 'about', title: 'About', subtitle: 'Mission + team context', x: 84, y: 42, component: AboutPage }
];

function ModuleFallback() {
  return (
    <div className="loading-row" role="status" aria-live="polite">
      <div className="spinner" />
    </div>
  );
}

export default function Dashboard({ onOpenWallet = () => {} }) {
  const { address } = useAccount();
  const chainId = useChainId();
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
    if (!hoveredId) return;
    if (hoverElapsed > 0.8 && pointerSpeed < 0.45) {
      setActiveId(hoveredId);
    }
  }, [hoverElapsed, hoveredId, pointerSpeed]);

  const activeModule = modules.find((item) => item.id === activeId);
  const ActiveComponent = activeModule?.component;

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
            <div className="brand-subtitle">One View Workspace</div>
          </div>
        </div>
        <div className="immersive-actions">
          <button className="button ghost" type="button" onClick={() => setActiveId('portfolio')}>
            Portfolio
          </button>
          <button className="button" type="button" onClick={onOpenWallet}>
            Connect
          </button>
        </div>
      </header>

      <section
        ref={stageRef}
        className="immersive-stage"
        onMouseMove={onMouseMove}
        onMouseLeave={() => {
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
            <div className="stat-card stat-card-minimal">
              <div className="stat-value">{activeChain?.name || '—'}</div>
              <div className="stat-label">Network</div>
            </div>
          </div>
          <div className="muted">Connected: {shortAddress}</div>
        </div>

        {modules.map((module, index) => {
          const hovered = hoveredId === module.id;
          const hoverIntensity = hovered ? Math.min(1, hoverElapsed / 1.25) : 0;
          const fastPenalty = 1 - pointerSpeed * 0.45;
          const tiltX = (mouse.y - 0.5) * 6 * fastPenalty;
          const tiltY = (mouse.x - 0.5) * -9 * fastPenalty;
          const scale = hovered ? 1 + 0.18 * hoverIntensity : 1;
          const z = hovered ? 30 + 40 * hoverIntensity : 0;

          return (
            <motion.button
              key={module.id}
              type="button"
              className={`immersive-module-card ${hovered ? 'is-hovered' : ''}`}
              style={{
                left: `${module.x}%`,
                top: `${module.y}%`,
                transform: `translate(-50%, -50%) perspective(1300px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(${z}px) scale(${scale})`,
                zIndex: hovered ? 40 : 10 + index
              }}
              onMouseEnter={() => {
                setHoveredId(module.id);
                setHoverStart(Date.now());
                setHoverElapsed(0);
              }}
              onMouseLeave={() => {
                setHoveredId(null);
                setHoverStart(null);
                setHoverElapsed(0);
              }}
              onClick={() => setActiveId(module.id)}
            >
              <div className="immersive-module-title">{module.title}</div>
              <div className="immersive-module-subtitle">{module.subtitle}</div>
              {hovered && (
                <div className="immersive-module-zoom">
                  Zoom {Math.round(100 + hoverIntensity * 120)}%
                </div>
              )}
            </motion.button>
          );
        })}
      </section>

      {activeId && ActiveComponent && (
        <div className="immersive-focus-layer" role="dialog" aria-modal="true">
          <div className="immersive-focus-toolbar">
            <div className="immersive-focus-title">{activeModule.title}</div>
            <button className="button ghost" type="button" onClick={() => setActiveId(null)}>
              Back to map
            </button>
          </div>
          <div className="immersive-focus-content">
            <Suspense fallback={<ModuleFallback />}>
              <ActiveComponent />
            </Suspense>
          </div>
        </div>
      )}
    </motion.div>
  );
}
