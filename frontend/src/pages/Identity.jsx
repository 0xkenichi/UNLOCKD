import { lazy, Suspense } from 'react';

const HoloCard = lazy(() => import('../components/common/HoloCard.jsx'));
const MaskHolo = lazy(() => import('../components/identity/MaskHolo.jsx'));

export default function Identity() {
  const holoFallback = (
    <div className="holo-card">
      <div className="loading-row">
        <div className="spinner" />
      </div>
    </div>
  );

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Identity</h1>
        <div className="page-subtitle">
          Optional identity linking is a prototype UX flow.
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Verification Tier</div>
          <div className="stat-value">Anonymous</div>
          <div className="stat-delta">Upgrade to unlock LTV</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Proof Status</div>
          <div className="stat-value">Not Linked</div>
          <div className="stat-delta">ZK flow preview</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Eligibility</div>
          <div className="stat-value">Pending</div>
          <div className="stat-delta">Requires verifier</div>
        </div>
      </div>
      <div className="grid-2">
        <Suspense fallback={holoFallback}>
          <HoloCard distort={0.35}>
            <h3 className="holo-title holo-glow">Mask Assembly</h3>
            <div className="muted">
              Placeholder for future zk-proof verification.
            </div>
            <MaskHolo />
            <button className="button" type="button" disabled>
              Coming Soon
            </button>
          </HoloCard>
        </Suspense>
        <div className="holo-card">
          <h3 className="holo-title">Tier Upgrade</h3>
          <div className="muted">
            Tiered pricing will be available after verification is live.
          </div>
          <div className="stack">
            <div className="pill">Current Tier: Anonymous</div>
            <div className="pill">Target Tier: Verified</div>
          </div>
          <button className="button" type="button" disabled>
            View Requirements
          </button>
        </div>
      </div>
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Verification Checklist</h3>
            <div className="section-subtitle">Prototype steps</div>
          </div>
          <span className="tag">Step 1/3</span>
        </div>
        <div className="card-list">
          <div className="pill">Connect wallet</div>
          <div className="pill">Generate ZK proof</div>
          <div className="pill">Bind identity to address</div>
        </div>
      </div>
    </div>
  );
}
