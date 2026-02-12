import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import ChainPrompt from '../components/common/ChainPrompt.jsx';
import SpotlightVestedContracts from '../components/dashboard/SpotlightVestedContracts.jsx';
import AdvancedSection from '../components/common/AdvancedSection.jsx';
import { ALL_EVM_CHAINS } from '../utils/chains.js';
import { getContractAddress, loanManagerAbi, usdcAbi } from '../utils/contracts.js';
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

  const formattedBalance = useMemo(() => formatValue(usdcBalance, 6), [usdcBalance]);
  const loanCountValue = loanCount ? loanCount.toString() : '0';
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '--';

  return (
    <motion.div
      className="stack dashboard-shell dashboard-minimal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <section className="dashboard-hero-minimal">
        <div className="dashboard-hero-main">
          <h1 className="page-title holo-glow">Dashboard</h1>
          <p className="page-subtitle">Borrow against vesting. Repay as you unlock.</p>
          <div className="dashboard-hero-actions">
            <button className="button" onClick={() => navigate('/borrow')}>
              Borrow
            </button>
            <button className="button ghost" onClick={() => navigate('/repay')}>
              Repay
            </button>
            <button className="button ghost" onClick={() => navigate('/portfolio')}>
              Portfolio
            </button>
          </div>
        </div>
        <div className="dashboard-stats-minimal">
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
      </section>

      <ChainPrompt />

      <AdvancedSection title="Market data">
        <SpotlightVestedContracts />
      </AdvancedSection>
    </motion.div>
  );
}
