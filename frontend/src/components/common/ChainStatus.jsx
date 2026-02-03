import { useChainId } from 'wagmi';
import { mainnet, sepolia, base, baseSepolia, avalancheFuji } from 'viem/chains';

const chainMap = new Map([
  [mainnet.id, mainnet],
  [sepolia.id, sepolia],
  [base.id, base],
  [baseSepolia.id, baseSepolia],
  [avalancheFuji.id, avalancheFuji]
]);

export default function ChainStatus() {
  const chainId = useChainId();
  const chain = chainMap.get(chainId);

  return (
    <div className="chain-status">
      <div className="section-head">
        <div>
          <div className="section-title">Network Status</div>
          <div className="section-subtitle">Auto-switch supported</div>
        </div>
        <span className="tag">Live</span>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Active Chain</div>
          <div className="stat-value">
            {chain ? chain.name : `Chain ${chainId || 'unknown'}`}
          </div>
          <div className="stat-delta">Connected</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Mode</div>
          <div className="stat-value">Testnet</div>
          <div className="stat-delta">Safe preview</div>
        </div>
      </div>
    </div>
  );
}
