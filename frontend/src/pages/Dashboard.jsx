import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAccount,
  useChainId,
  useReadContract
} from 'wagmi';
import ChainPrompt from '../components/common/ChainPrompt.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import SpotlightVestedContracts from '../components/dashboard/SpotlightVestedContracts.jsx';
import { ALL_EVM_CHAINS } from '../utils/chains.js';
import {
  getContractAddress,
  loanManagerAbi,
  usdcAbi
} from '../utils/contracts.js';
import { formatValue } from '../utils/format.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');
  const activeChain = useMemo(
    () => ALL_EVM_CHAINS.find((chain) => chain.id === chainId),
    [chainId]
  );

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

  const formattedBalance = useMemo(
    () => formatValue(usdcBalance, 6),
    [usdcBalance]
  );
  const loanCountValue = loanCount ? loanCount.toString() : '0';
  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : '--';

  return (
    <div className="stack dashboard-shell">
      <section className="dashboard-hero">
        <div className="dashboard-hero-main">
          <div className="dashboard-eyebrow">Account overview</div>
          <h1 className="page-title holo-glow">Dashboard</h1>
          <div className="page-subtitle">
            Track your vesting credit health, balances, and next best actions.
          </div>
          <div className="dashboard-hero-actions">
            <button className="button" onClick={() => navigate('/borrow')}>
              Start Borrow
            </button>
            <button className="button ghost" onClick={() => navigate('/repay')}>
              Make a Repay
            </button>
            <button className="button ghost" onClick={() => navigate('/portfolio')}>
              Open Portfolio
            </button>
          </div>
          <div className="dashboard-hero-pills">
            <span className="pill">Wallet: {shortAddress}</span>
            <span className="pill">
              Network: {activeChain?.name || 'Not connected'}
            </span>
            <span className="pill">Chain ID: {chainId || '--'}</span>
          </div>
        </div>
        <div className="dashboard-hero-aside">
          <div className="holo-card dashboard-summary-card">
            <div className="section-head">
              <div>
                <h3 className="section-title">Account Snapshot</h3>
                <div className="section-subtitle">Live on-chain highlights</div>
              </div>
              <span className="tag">Live</span>
            </div>
            <div className="dashboard-summary-grid">
              <div className="stat-card">
                <div className="stat-label">Active Loans</div>
                <div className="stat-value">{loanCountValue}</div>
                <div className="stat-delta">On-chain count</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">USDC Balance</div>
                <div className="stat-value">{formattedBalance}</div>
                <div className="stat-delta">Wallet balance</div>
              </div>
            </div>
            <div className="dashboard-summary-footer">
              <button className="button ghost" onClick={() => navigate('/docs')}>
                View Docs
              </button>
              <button className="button ghost" onClick={() => navigate('/identity')}>
                Identity Status
              </button>
            </div>
          </div>
          <PageIllustration variant="dashboard" />
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-head dashboard-section-head">
          <div>
            <h3 className="section-title">Portfolio Snapshot</h3>
            <div className="section-subtitle">Key signals at a glance</div>
          </div>
          <span className="tag">Summary</span>
        </div>
        <div className="grid-3">
          <div className="holo-card dashboard-mini-card">
            <div className="dashboard-mini-label">Primary Wallet</div>
            <div className="dashboard-mini-value">{shortAddress}</div>
            <div className="muted">Connected address</div>
          </div>
          <div className="holo-card dashboard-mini-card">
            <div className="dashboard-mini-label">Active Loans</div>
            <div className="dashboard-mini-value">{loanCountValue}</div>
            <div className="muted">Currently tracked</div>
          </div>
          <div className="holo-card dashboard-mini-card">
            <div className="dashboard-mini-label">USDC Available</div>
            <div className="dashboard-mini-value">{formattedBalance}</div>
            <div className="muted">Ready for deployment</div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-head dashboard-section-head">
          <div>
            <h3 className="section-title">Network Readiness</h3>
            <div className="section-subtitle">
              Switch to supported chains or continue with Solana.
            </div>
          </div>
          <span className="tag">Connectivity</span>
        </div>
        <ChainPrompt />
      </section>

      <section className="dashboard-section">
        <div className="section-head dashboard-section-head">
          <div>
            <h3 className="section-title">Market Intelligence</h3>
            <div className="section-subtitle">
              Vested contract candidates and upcoming unlock coverage.
            </div>
          </div>
          <span className="tag">Insights</span>
        </div>
        <SpotlightVestedContracts />
      </section>
    </div>
  );
}
