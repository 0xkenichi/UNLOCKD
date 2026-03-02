import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from 'wagmi';
import PassportSummary from '../components/common/PassportSummary.jsx';
import usePassportSnapshot from '../utils/usePassportSnapshot.js';

const CrdtOrb = lazy(() => import('../components/governance/CrdtOrb.jsx'));
const GovernanceSimulator = lazy(() => import('../components/governance/GovernanceSimulator.jsx'));

export default function Governance() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const passport = usePassportSnapshot(address);
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
          Governance is passport-aware in the MVP. Voting remains read-only.
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/identity')}>
            Passport readiness
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=whitepaper')}>
            Governance context
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/features')}>
            Feature overview
          </button>
        </div>
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Governance Passport</h3>
              <div className="section-subtitle">Identity signal used for future voting eligibility</div>
            </div>
            <span className="tag">Passport</span>
          </div>
          <PassportSummary
            as="div"
            className="pill"
            loading={passport.loading}
            score={passport.score}
            stamps={passport.stamps}
          />
          <p className="muted" style={{ marginTop: 10 }}>
            Connect and strengthen your passport on the Identity page to prepare for governance
            participation tiers.
          </p>
          <button
            className="button ghost"
            type="button"
            onClick={() => navigate('/identity')}
          >
            Open Identity
          </button>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Governance Scope</h3>
          <p className="muted">
            Current scope focuses on proposal visibility, identity readiness, and community
            coordination while on-chain voting remains disabled.
          </p>
          <div className="card-list" style={{ marginTop: 12 }}>
            <div className="pill">Passport-tier aware (preview)</div>
            <div className="pill">Proposal feed live</div>
            <div className="pill">Voting contracts not active</div>
          </div>
          <div className="inline-actions" style={{ marginTop: 14 }}>
            <button className="button ghost" type="button" onClick={() => navigate('/about')}>
              Team and roadmap
            </button>
            <button className="button ghost" type="button" onClick={() => navigate('/community-pools')}>
              Community pools
            </button>
          </div>
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
        <div className="grid-1 md:grid-2">
          <Suspense fallback={holoFallback}>
            <GovernanceSimulator />
          </Suspense>
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
              window.open('mailto:0xkenichi@gmail.com?subject=Governance%20updates')
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
