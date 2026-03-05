// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import '@solana/wallet-adapter-react-ui/styles.css';
import SolanaProvider from './SolanaProvider.jsx';
import SolanaWalletCard from './SolanaWalletCard.jsx';

export default function SolanaWalletCardWithProvider() {
  return (
    <SolanaProvider>
      <SolanaWalletCard />
    </SolanaProvider>
  );
}
