import { lazy, Suspense } from 'react';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';

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
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration variant="governance" />
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
          <button
            className="button"
            type="button"
            onClick={() => {
              const target = document.getElementById('governance-feed');
              if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
          >
            View Feed
          </button>
        </div>
      </div>
      <div className="holo-card" id="governance-feed">
        <div className="section-head">
          <div>
            <h3 className="section-title">Governance Feed</h3>
            <div className="section-subtitle">Latest protocol updates</div>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() =>
              window.open('mailto:governance@vestra.xyz?subject=Governance%20updates')
            }
          >
            View All
          </button>
        </div>
        <div className="data-table">
          <div className="table-row header">
            <div>Proposal</div>
            <div>Asset</div>
            <div>Timeline</div>
            <div>Status</div>
          </div>
          <div className="table-row">
            <div>Risk Curve v2</div>
            <div className="asset-cell">
              <span className="asset-icon crdt" />
              CRDT
            </div>
            <div>Q3 2026</div>
            <div className="tag">Draft</div>
          </div>
          <div className="table-row">
            <div>Oracle Upgrade</div>
            <div className="asset-cell">
              <span className="asset-icon eth" />
              ETH
            </div>
            <div>Q4 2026</div>
            <div className="tag warn">Review</div>
          </div>
        </div>
      </div>
    </div>
  );
}
