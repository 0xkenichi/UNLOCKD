import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useChainId, useReadContract } from 'wagmi';
import { getContractAddress, loanManagerAbi, usdcAbi } from '../../utils/contracts.js';
import { formatValue } from '../../utils/format.js';

export default function EssentialsPanel() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');

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

  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : '--';

  return (
    <div className="holo-card essentials-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Essentials</h3>
          <div className="section-subtitle">Quick account summary</div>
        </div>
        <span className="tag">Live</span>
      </div>
      <div className="essentials-meta">
        <div className="pill">Wallet: {shortAddress}</div>
        <div className="pill">Chain ID: {chainId || '--'}</div>
      </div>
      <div className="stat-row essentials-stats">
        <div className="stat-card">
          <div className="stat-label">Active Loans</div>
          <div className="stat-value">{loanCount ? loanCount.toString() : '0'}</div>
          <div className="stat-delta">On-chain count</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">USDC Balance</div>
          <div className="stat-value">{formattedBalance}</div>
          <div className="stat-delta">Wallet balance</div>
        </div>
      </div>
      <div className="essentials-actions">
        <button className="button" type="button" onClick={() => navigate('/borrow')}>
          Borrow
        </button>
        <button className="button ghost" type="button" onClick={() => navigate('/repay')}>
          Repay
        </button>
        <button className="button ghost" type="button" onClick={() => navigate('/portfolio')}>
          Portfolio
        </button>
        <button className="button ghost" type="button" onClick={() => navigate('/docs')}>
          Docs
        </button>
      </div>
    </div>
  );
}
