import { useChainId } from 'wagmi';
import { getEvmChainById } from '../../utils/chains.js';

export default function TxStatusBanner({ label, hash, status, error, explorerUrl }) {
  const chainId = useChainId();
  if (!hash && !error) return null;
  const statusLabel = status || (error ? 'Failed' : 'Pending');
  const chain = getEvmChainById(chainId);
  const chainExplorer = chain?.blockExplorers?.default?.url || '';
  const txExplorerUrl = explorerUrl || (hash && chainExplorer ? `${chainExplorer}/tx/${hash}` : '');
  return (
    <div className={`tx-banner ${error ? 'error' : ''}`}>
      <div className="tx-banner-title">{label}</div>
      <div className="tx-banner-meta">
        <span className="tag">{statusLabel}</span>
        {hash && (
          <span className="muted">
            {hash.slice(0, 10)}...{hash.slice(-6)}
          </span>
        )}
        {txExplorerUrl && (
          <a href={txExplorerUrl} target="_blank" rel="noreferrer" className="muted">
            View on explorer
          </a>
        )}
      </div>
      {error && <div className="muted">{error}</div>}
    </div>
  );
}
