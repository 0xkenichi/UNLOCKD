// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter
} from '@solana/wallet-adapter-wallets';
import { SOLANA_NETWORKS } from '../../utils/chains.js';
import { useOnchainSession } from '../../utils/onchainSession.js';

export default function SolanaProvider({ children }) {
  const { session } = useOnchainSession();
  const endpoint =
    SOLANA_NETWORKS.find((network) => network.id === session.solanaNetworkId)
      ?.endpoint || SOLANA_NETWORKS[0]?.endpoint;
  const wallets = useMemo(
    () => [new PhantomWalletAdapter()],
    []
  );

  if (!endpoint) {
    return children;
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
