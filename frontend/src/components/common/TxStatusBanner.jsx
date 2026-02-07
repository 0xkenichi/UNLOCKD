export default function TxStatusBanner({ label, hash, status, error }) {
  if (!hash && !error) return null;
  const statusLabel = status || (error ? 'Failed' : 'Pending');
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
      </div>
      {error && <div className="muted">{error}</div>}
    </div>
  );
}
