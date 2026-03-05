// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import AuctionTypeSelector from '../components/auction/AuctionTypeSelector.jsx';
import { useNavigate } from 'react-router-dom';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';

export default function Auction() {
  const navigate = useNavigate();
  const scrollTo = (id) => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Auction</h1>
        <div className="page-subtitle">
          Claims auction module is planned and currently marked coming soon.
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/features')}>
            Liquidation framework
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=whitepaper')}>
            Read whitepaper
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/feedback')}>
            Request access
          </button>
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Coming Soon</h3>
              <div className="section-subtitle">Auction execution is not enabled yet</div>
            </div>
            <span className="tag warn">Planned</span>
          </div>
          <p className="muted">
            Liquidation auctions will activate in a future release after protocol hardening and
            governance controls are finalized.
          </p>
          <div className="card-list">
            <div className="pill">Eligibility and reserve engine</div>
            <div className="pill">Bid execution and settlement</div>
            <div className="pill">Risk and compliance guardrails</div>
          </div>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Active Auctions</div>
          <div className="stat-value">0</div>
          <div className="stat-delta">Testnet only</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Discount</div>
          <div className="stat-value">—</div>
          <div className="stat-delta">No bids</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Liquidations</div>
          <div className="stat-value">—</div>
          <div className="stat-delta">Awaiting activation</div>
        </div>
      </div>
      <AuctionTypeSelector />
      <div className="holo-card" id="auction-control">
        <h3 className="holo-title">Auction Control</h3>
        <p className="muted">
          This section is preview-only for now. You can review the flow, but execution remains
          disabled until launch.
        </p>
        <button className="button" type="button" onClick={() => scrollTo('auction-pipeline')}>
          View Roadmap
        </button>
        <div className="inline-actions" style={{ marginTop: 14 }}>
          <button className="button ghost" type="button" onClick={() => navigate('/governance')}>
            Governance status
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/lender')}>
            Lender operations
          </button>
        </div>
      </div>
      <div className="holo-card" id="auction-pipeline">
        <div className="section-head">
          <div>
            <h3 className="section-title">Auction Pipeline</h3>
            <div className="section-subtitle">Milestones before activation</div>
          </div>
          <button
            className="button ghost"
            type="button"
            onClick={() =>
              window.open('mailto:0xkenichi@gmail.com?subject=Auction%20alerts')
            }
          >
            Join Waitlist
          </button>
        </div>
        <div className="data-table">
          <div className="table-row header">
            <div>Milestone</div>
            <div>Owner</div>
            <div>Window</div>
            <div>Status</div>
          </div>
          <div className="table-row">
            <div>Settlement contracts freeze</div>
            <div>Protocol team</div>
            <div>Q2 2026</div>
            <div className="tag">Queued</div>
          </div>
          <div className="table-row">
            <div>Risk monitor integration</div>
            <div>Risk ops</div>
            <div>Q3 2026</div>
            <div className="tag">Monitoring</div>
          </div>
        </div>
      </div>
    </div>
  );
}
