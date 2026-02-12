import '@rainbow-me/rainbowkit/styles.css';
import { ConnectButton, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { trackEvent } from '../../utils/analytics.js';

export default function EvmConnectButtons() {
  return (
    <RainbowKitProvider>
      <div className="wallet-grid">
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button
              className="button"
              type="button"
              onClick={() => {
                trackEvent('evm_connect_open', { variant: 'primary' });
                openConnectModal();
              }}
            >
              Connect Browser Wallet
            </button>
          )}
        </ConnectButton.Custom>
        <ConnectButton.Custom>
          {({ openConnectModal }) => (
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                trackEvent('evm_connect_open', { variant: 'secondary' });
                openConnectModal();
              }}
            >
              Open Wallet Options
            </button>
          )}
        </ConnectButton.Custom>
      </div>
    </RainbowKitProvider>
  );
}
