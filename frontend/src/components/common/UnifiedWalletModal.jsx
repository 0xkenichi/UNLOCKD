import { useEffect, useMemo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useWallet } from '@solana/wallet-adapter-react';
import SolanaWalletCard from '../solana/SolanaWalletCard.jsx';
import { ALL_EVM_CHAINS, SOLANA_NETWORKS } from '../../utils/chains.js';
import { useOnchainSession } from '../../utils/onchainSession.js';
import { trackEvent } from '../../utils/analytics.js';

export default function UnifiedWalletModal({ isOpen, onClose }) {
  const { address, isConnected: evmConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const { session, setSession } = useOnchainSession();
  const { connected: solanaConnected } = useWallet();
  const evmChains = useMemo(() => ALL_EVM_CHAINS, []);
  const activeChain = evmChains.find((chain) => chain.id === chainId);

  useEffect(() => {
    if (evmConnected || solanaConnected) {
      onClose?.();
    }
  }, [evmConnected, onClose, solanaConnected]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="wallet-modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="wallet-modal" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <div>
            <div className="section-title">Connect Wallet</div>
            <div className="section-subtitle">
              Choose EVM or Solana to continue.
            </div>
          </div>
          <button className="wallet-modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="segmented">
          <button
            className={`button ghost ${session.chainType === 'evm' ? 'active' : ''}`}
            type="button"
            onClick={() => setSession({ chainType: 'evm' })}
          >
            EVM
          </button>
          <button
            className={`button ghost ${session.chainType === 'solana' ? 'active' : ''}`}
            type="button"
            onClick={() => setSession({ chainType: 'solana' })}
          >
            Solana
          </button>
        </div>

        {session.chainType === 'evm' ? (
          <div className="wallet-modal-grid">
            <div className="holo-card wallet-modal-card">
              <div className="section-head">
                <div>
                  <h3 className="section-title">EVM Wallet</h3>
                  <div className="section-subtitle">
                    Connect an EVM wallet or smart account.
                  </div>
                </div>
                <span className={`tag ${address ? 'success' : ''}`}>
                  {address ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="wallet-grid">
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      className="button"
                      type="button"
                      onClick={() => {
                        trackEvent('evm_connect_open', { variant: 'passkey' });
                        openConnectModal();
                      }}
                    >
                      Passkey Smart Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() => {
                        trackEvent('evm_connect_open', { variant: 'wallet' });
                        openConnectModal();
                      }}
                    >
                      Connect EVM Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
              </div>
              <div className="chain-picker">
                {evmChains.map((chain) => (
                  <button
                    key={chain.id}
                    className={`pill ${chain.id === chainId ? 'active' : ''}`}
                    type="button"
                    onClick={() => switchChain({ chainId: chain.id })}
                    disabled={isPending}
                  >
                    {chain.name}
                  </button>
                ))}
              </div>
              {activeChain && (
                <div className="muted">Current network: {activeChain.name}</div>
              )}
            </div>
          </div>
        ) : (
          <div className="wallet-modal-grid">
            <div className="holo-card wallet-modal-card">
              <div className="section-head">
                <div>
                  <h3 className="section-title">Solana Wallet</h3>
                  <div className="section-subtitle">
                    Connect a Solana wallet (Phantom, Solflare).
                  </div>
                </div>
                <span className={`tag ${solanaConnected ? 'success' : ''}`}>
                  {solanaConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="inline-actions">
                {SOLANA_NETWORKS.map((network) => (
                  <button
                    key={network.id}
                    className={`button ghost ${
                      session.solanaNetworkId === network.id ? 'active' : ''
                    }`}
                    type="button"
                    onClick={() =>
                      setSession({ chainType: 'solana', solanaNetworkId: network.id })
                    }
                  >
                    {network.name}
                  </button>
                ))}
              </div>
              <SolanaWalletCard />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
