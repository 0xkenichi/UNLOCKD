import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';

export default function About() {
  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">About VESTRA</h1>
        <div className="page-subtitle">
          An institutional-grade protocol for time-locked liquidity.
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration variant="about" />
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Mission Focus</div>
          <div className="stat-value">Vesting Liquidity</div>
          <div className="stat-delta">Non-custodial</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Stage</div>
          <div className="stat-value">Testnet MVP</div>
          <div className="stat-delta">UX pilots</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Security</div>
          <div className="stat-value">Audit Pending</div>
          <div className="stat-delta">Internal review</div>
        </div>
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <h3 className="holo-title">Mission</h3>
          <p className="muted">
            Unlock liquidity from vested tokens without custody or forced sales.
          </p>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Approach</h3>
          <p className="muted">
            Time-based enforcement, conservative valuation, and on-chain
            settlement to protect lenders and borrowers.
          </p>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Status</h3>
          <p className="muted">
            MVP prototype for testnet evaluation and UX pilots.
          </p>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Security</h3>
          <p className="muted">
            Not audited. Use testnet only until reviews are complete.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Roadmap</h3>
              <div className="section-subtitle">Next milestones</div>
            </div>
            <span className="tag">Q3 2026</span>
          </div>
          <div className="card-list">
            <div className="pill">Oracle mesh + price feeds</div>
            <div className="pill">Lender vaults & yield</div>
            <div className="pill">Auction settlement</div>
            <div className="pill">Security audits</div>
          </div>
        </div>
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Team & Partners</h3>
              <div className="section-subtitle">Core contributors</div>
            </div>
            <button
              className="button ghost"
              type="button"
              onClick={() =>
                window.open('mailto:hello@vestra.xyz?subject=Partnership%20inquiry')
              }
            >
              Contact
            </button>
          </div>
          <div className="card-list">
            <div className="pill">Protocol Engineering</div>
            <div className="pill">Risk & Quant</div>
            <div className="pill">Design & UX</div>
            <div className="pill">BD & Partnerships</div>
          </div>
        </div>
      </div>
    </div>
  );
}
