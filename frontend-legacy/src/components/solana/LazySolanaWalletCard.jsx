// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
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
