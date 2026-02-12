import { Suspense, lazy } from 'react';

const SolanaWalletCardWithProvider = lazy(() =>
  import('./SolanaWalletCardWithProvider.jsx')
);

export default function LazySolanaWalletCard() {
  return (
    <Suspense fallback={<div className="muted">Loading Solana wallet...</div>}>
      <SolanaWalletCardWithProvider />
    </Suspense>
  );
}
