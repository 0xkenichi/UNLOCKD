import { Suspense, lazy } from 'react';

const EvmConnectButtons = lazy(() => import('./EvmConnectButtons.jsx'));

export default function LazyEvmConnectButtons() {
  return (
    <Suspense fallback={<div className="muted">Loading wallet options...</div>}>
      <EvmConnectButtons />
    </Suspense>
  );
}
