// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { Buffer } from 'buffer';
import LazySolanaWalletCard from '../solana/LazySolanaWalletCard.jsx';
import LazyEvmConnectButtons from './LazyEvmConnectButtons.jsx';
import { ALL_EVM_CHAINS, SOLANA_NETWORKS } from '../../utils/chains.js';
import { useOnchainSession, useWalletSession } from '../../utils/onchainSession.js';
import { apiPost } from '../../utils/api.js';

export default function UnifiedWalletModal({ isOpen, onClose }) {
  const { address, isConnected: evmConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const solana = useSolanaWallet();
  const { session, setSession } = useOnchainSession();
  const { auth } = useWalletSession();
  const [linking, setLinking] = useState(false);
  const [linkState, setLinkState] = useState({ type: '', message: '' });
  const solanaConnected = Boolean(session.solanaWalletAddress);
  const bothWalletsConnected = Boolean(evmConnected && solanaConnected);
  const evmChains = useMemo(() => ALL_EVM_CHAINS, []);
  const activeChain = evmChains.find((chain) => chain.id === chainId);

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

  const handleLinkWallets = async () => {
    if (!auth?.token || !session.solanaWalletAddress) {
      setLinkState({
        type: 'error',
        message: 'Create an EVM wallet session first, then reconnect Solana.'
      });
      return;
    }
    if (!solana?.signMessage) {
      setLinkState({
        type: 'error',
        message: 'Solana wallet signature unavailable. Ensure Phantom is connected and supports message signing.'
      });
      return;
    }
    setLinking(true);
    setLinkState({ type: '', message: '' });
    try {
      const nonceResp = await apiPost('/api/auth/solana/nonce', {
        walletAddress: session.solanaWalletAddress
      });
      const message = nonceResp?.message || '';
      const nonce = nonceResp?.nonce || '';
      if (!message || !nonce) {
        throw new Error('Unable to request Solana nonce');
      }
      const signatureBytes = await solana.signMessage(new TextEncoder().encode(message));
      const signature = Buffer.from(signatureBytes).toString('base64');
      await apiPost('/api/auth/solana/link-wallet', {
        walletAddress: session.solanaWalletAddress,
        nonce,
        signature
      });
      setLinkState({
        type: 'success',
        message: 'EVM and Solana wallets are now linked to one identity.'
      });
    } catch (error) {
      setLinkState({
        type: 'error',
        message: error?.message || 'Failed to link wallets'
      });
    } finally {
      setLinking(false);
    }
  };

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
        {bothWalletsConnected && (
          <div className="holo-card" style={{ marginTop: 14 }}>
            <div className="section-head">
              <div>
                <div className="section-title">Unified identity</div>
                <div className="section-subtitle">
                  Both wallets are connected. Pick the primary identity chain.
                </div>
              </div>
              <span className="tag success">Linked session ready</span>
            </div>
            <div className="inline-actions">
              <button
                className={`button ghost ${session.primaryIdentity !== 'solana' ? 'active' : ''}`}
                type="button"
                onClick={() => setSession({ primaryIdentity: 'evm', chainType: 'evm' })}
              >
                Use EVM identity
              </button>
              <button
                className={`button ghost ${session.primaryIdentity === 'solana' ? 'active' : ''}`}
                type="button"
                onClick={() => setSession({ primaryIdentity: 'solana', chainType: 'solana' })}
              >
                Use Solana identity
              </button>
              <button
                className="button"
                type="button"
                onClick={handleLinkWallets}
                disabled={linking}
              >
                {linking ? 'Linking...' : 'Link wallets on backend'}
              </button>
            </div>
            {linkState.message && (
              <div
                className="muted"
                style={{
                  marginTop: 8,
                  color:
                    linkState.type === 'error'
                      ? 'var(--danger-400)'
                      : 'var(--success-500)'
                }}
              >
                {linkState.message}
              </div>
            )}
          </div>
        )}

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
              <LazyEvmConnectButtons />
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
                    Connect a Solana wallet (Phantom).
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
              <LazySolanaWalletCard />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
