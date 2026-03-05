// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { trackEvent } from '../../utils/analytics.js';
import { SOLANA_NETWORKS } from '../../utils/chains.js';
import { useOnchainSession } from '../../utils/onchainSession.js';
import SolanaRepayDelegate from './SolanaRepayDelegate.jsx';

const formatAddress = (value) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : '';
export default function SolanaWalletCard() {
  const { publicKey, connected, wallet } = useWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();
  const address = useMemo(() => publicKey?.toString() || '', [publicKey]);
  const { session, setSession } = useOnchainSession();
  const endpoint = useMemo(
    () =>
      SOLANA_NETWORKS.find((network) => network.id === session.solanaNetworkId)
        ?.endpoint || SOLANA_NETWORKS[0]?.endpoint,
    [session.solanaNetworkId]
  );
  const networkName = useMemo(
    () =>
      SOLANA_NETWORKS.find((network) => network.id === session.solanaNetworkId)
        ?.name || SOLANA_NETWORKS[0]?.name,
    [session.solanaNetworkId]
  );

  useEffect(() => {
    if (connected && address) {
      trackEvent('solana_connect', { address, wallet: wallet?.adapter?.name });
      setSession({
        solanaWalletAddress: address,
        solanaWalletName: wallet?.adapter?.name || null
      });
    }
  }, [address, connected, setSession, wallet]);

  useEffect(() => {
    if (!connected && (session.solanaWalletAddress != null || session.solanaWalletName != null)) {
      trackEvent('solana_disconnect');
      setSession({
        chainType: session.primaryIdentity === 'solana' ? 'evm' : session.chainType,
        primaryIdentity:
          session.primaryIdentity === 'solana' ? 'evm' : session.primaryIdentity,
        solanaWalletAddress: null,
        solanaWalletName: null
      });
    }
  }, [
    connected,
    session.chainType,
    session.primaryIdentity,
    session.solanaWalletAddress,
    session.solanaWalletName,
    setSession
  ]);

  return (
    <div className="stack">
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Solana Wallet</h3>
            <div className="section-subtitle">
              Connect a Solana wallet to receive USDC or repay.
            </div>
          </div>
          <span className={`tag ${connected ? 'success' : ''}`}>
            {connected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        {address && <div className="wallet-address">{formatAddress(address)}</div>}
        <div className="inline-actions">
          <button
            className="button"
            type="button"
            onClick={() => setSolanaModalVisible(true)}
          >
            {connected ? 'Manage Solana Wallet' : 'Connect Solana Wallet'}
          </button>
        </div>
        {connected && address && (
          <div className="muted">Connected to {networkName}.</div>
        )}
      </div>
      <SolanaRepayDelegate />
    </div>
  );
}
