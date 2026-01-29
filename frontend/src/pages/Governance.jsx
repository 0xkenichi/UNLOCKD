import { lazy, Suspense } from 'react';

const CrdtOrb = lazy(() => import('../components/governance/CrdtOrb.jsx'));

export default function Governance() {
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
        <h1 className="page-title holo-glow">Governance</h1>
        <div className="page-subtitle">
          Governance UI is read-only in the MVP.
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Voting Power</div>
          <div className="stat-value">0 CRDT</div>
          <div className="stat-delta">Stake to activate</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Proposals</div>
          <div className="stat-value">0</div>
          <div className="stat-delta">Testnet disabled</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Treasury</div>
          <div className="stat-value">$0</div>
          <div className="stat-delta">Awaiting genesis</div>
        </div>
      </div>
      <div className="grid-2">
        <Suspense fallback={holoFallback}>
          <CrdtOrb />
        </Suspense>
        <div className="holo-card">
          <h3 className="holo-title">Active Proposals</h3>
          <p className="muted">
            No on-chain proposals are enabled on testnet.
          </p>
          <button className="button" type="button" disabled>
            Coming Soon
          </button>
        </div>
      </div>
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Governance Feed</h3>
            <div className="section-subtitle">Latest protocol updates</div>
          </div>
          <button className="button ghost" type="button">
            View All
          </button>
        </div>
        <div className="data-table">
          <div className="table-row header">
            <div>Proposal</div>
            <div>Type</div>
            <div>Timeline</div>
            <div>Status</div>
          </div>
          <div className="table-row">
            <div>Risk Curve v2</div>
            <div>Parameter</div>
            <div>Q3 2026</div>
            <div className="tag">Draft</div>
          </div>
          <div className="table-row">
            <div>Oracle Upgrade</div>
            <div>Tech</div>
            <div>Q4 2026</div>
            <div className="tag warn">Review</div>
          </div>
        </div>
      </div>
    </div>
  );
}
