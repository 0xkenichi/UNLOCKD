import { useMemo } from 'react';
import { trackEvent } from '../../utils/analytics.js';

const ONRAMP_URL = 'https://widget.onramper.com';

export default function OnrampEmbed({ address, chainLabel }) {
  const apiKey = import.meta.env.VITE_ONRAMPER_API_KEY;
  const src = useMemo(() => {
    if (!apiKey) return '';
    const params = new URLSearchParams({
      apiKey,
      defaultCrypto: 'USDC',
      defaultFiat: 'USD',
      supportSell: 'false'
    });
    if (address) params.set('wallets', JSON.stringify({ USDC: address }));
    if (chainLabel) params.set('defaultBlockchain', chainLabel);
    return `${ONRAMP_URL}?${params.toString()}`;
  }, [address, apiKey, chainLabel]);

  if (!apiKey) {
    return (
      <div className="holo-card funding-source-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Fiat Onramp</h3>
            <div className="section-subtitle">
              Fund your wallet with USDC in a few taps.
            </div>
          </div>
          <span className="tag warn">API key needed</span>
        </div>
        <div className="muted">
          Add `VITE_ONRAMPER_API_KEY` to enable the embedded onramp.
        </div>
        <a
          className="button funding-card-cta"
          href="https://www.onramper.com"
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvent('onramp_open', { provider: 'onramper' })}
        >
          Open Onramper
        </a>
      </div>
    );
  }

  return (
    <div className="holo-card funding-source-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Fiat Onramp</h3>
          <div className="section-subtitle">
            Buy USDC directly to the connected wallet.
          </div>
        </div>
        <span className="tag">Onramper</span>
      </div>
      <iframe
        title="Onramper widget"
        className="onramp-iframe"
        src={src}
        loading="lazy"
        allow="payment"
        onLoad={() => trackEvent('onramp_loaded', { provider: 'onramper' })}
      />
    </div>
  );
}
