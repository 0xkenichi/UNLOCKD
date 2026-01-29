export default function Docs() {
  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Docs</h1>
        <div className="page-subtitle">
          Protocol, MVP, and testing documentation stored in this repo.
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Docs Pack</div>
          <div className="stat-value">24 files</div>
          <div className="stat-delta">Living docs</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Updated</div>
          <div className="stat-value">This week</div>
          <div className="stat-delta">Changelog active</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Coverage</div>
          <div className="stat-value">Core flows</div>
          <div className="stat-delta">Borrow / Repay / Risk</div>
        </div>
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <h3 className="holo-title">Docs Location</h3>
          <p className="muted">
            Documentation lives in the repository under <strong>UNLOCKD/docs</strong>.
          </p>
          <div className="inline-actions">
            <div className="pill">README.md</div>
            <div className="pill">OVERVIEW.md</div>
            <div className="pill">MVP.md</div>
            <div className="pill">TESTING.md</div>
          </div>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Protocol References</h3>
          <p className="muted">
            Technical and risk documentation used to design the MVP.
          </p>
          <div className="inline-actions">
            <div className="pill">WHITEPAPER.md</div>
            <div className="pill">LITEPAPER.md</div>
            <div className="pill">RISK_MODELS.md</div>
            <div className="pill">MONTE_CARLO_LTV_TABLE.md</div>
          </div>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Deployment & Ops</h3>
          <p className="muted">
            Testnet and deployment references for verification.
          </p>
          <div className="inline-actions">
            <div className="pill">DEPLOYMENT.md</div>
            <div className="pill">SEPOLIA_BORROW_FLOW.md</div>
            <div className="pill">SECURITY.md</div>
            <div className="pill">CHANGELOG.md</div>
          </div>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Design & UX</h3>
          <p className="muted">
            Wireframes and UI guidance for the MVP experience.
          </p>
          <div className="inline-actions">
            <div className="pill">CRDT_FRONTEND_2030.md</div>
            <div className="pill">CRDT_DASHBOARD_WIREFRAMES_2030.md</div>
            <div className="pill">CRDT_BORROW_FLOW_WIREFRAMES_2030.md</div>
            <div className="pill">CRDT_REPAY_FLOW_WIREFRAMES_2030.md</div>
          </div>
        </div>
      </div>
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Quick Links</h3>
            <div className="section-subtitle">Jump to critical docs</div>
          </div>
          <button className="button ghost" type="button">
            Open Docs Folder
          </button>
        </div>
        <div className="inline-actions">
          <button className="button ghost">Borrow Flow</button>
          <button className="button ghost">Risk Models</button>
          <button className="button ghost">Security Notes</button>
          <button className="button ghost">Deployment</button>
        </div>
      </div>
    </div>
  );
}
