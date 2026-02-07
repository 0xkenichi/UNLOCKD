import { useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter
} from '@solana/wallet-adapter-wallets';
import { SOLANA_NETWORKS } from '../../utils/chains.js';
import { useOnchainSession } from '../../utils/onchainSession.js';

export default function SolanaProvider({ children }) {
  const { session } = useOnchainSession();
  const endpoint =
    SOLANA_NETWORKS.find((network) => network.id === session.solanaNetworkId)
      ?.endpoint || SOLANA_NETWORKS[0]?.endpoint;
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
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
