import { trackEvent } from '../../utils/analytics.js';

const providers = {
  lifi: {
    name: 'LI.FI',
    url: 'https://li.fi'
  },
  across: {
    name: 'Across',
    url: 'https://across.to'
  }
};

export default function BridgeCard({ provider = 'lifi', chainLabel }) {
  const current = providers[provider] || providers.lifi;
  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Bridge Assets</h3>
          <div className="section-subtitle">
            Move funds to {chainLabel || 'your active chain'} in one hop.
          </div>
        </div>
        <span className="tag">{current.name}</span>
      </div>
      <div className="muted">
        Recommended for moving USDC from other networks or exchanges.
      </div>
      <a
        className="button"
        href={current.url}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackEvent('bridge_open', { provider })}
      >
        Open {current.name}
      </a>
    </div>
  );
}
