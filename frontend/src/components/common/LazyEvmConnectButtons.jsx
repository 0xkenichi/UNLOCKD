// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { Suspense, lazy } from 'react';

const EvmConnectButtons = lazy(() => import('./EvmConnectButtons.jsx'));

export default function LazyEvmConnectButtons() {
  return (
    <Suspense fallback={<div className="muted">Loading wallet options...</div>}>
      <EvmConnectButtons />
    </Suspense>
  );
}
