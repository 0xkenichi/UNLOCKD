import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import { useNavigate } from 'react-router-dom';

export default function About() {
  const navigate = useNavigate();
  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">About Vestra Protocol</h1>
        <div className="page-subtitle">
          An institutional-grade protocol for illuminating liquidity from vested assets.
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/features')}>
            Product features
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=whitepaper')}>
            Read whitepaper
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/landing')}>
            Open minified site
          </button>
        </div>
      </div>
      <PageIllustration variant="about" />
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
              <h3 className="section-title">Founder Spotlight</h3>
              <div className="section-subtitle">Built with conviction and product craft</div>
            </div>
            <span className="tag">Founder</span>
          </div>
          <p className="muted">
            <strong>Karichi</strong> leads Vestra with a strong focus on practical execution:
            professional UX, transparent risk framing, and lender-borrower alignment.
          </p>
          <div className="card-list">
            <div className="pill">Founder-led product direction</div>
            <div className="pill">High-conviction design and shipping culture</div>
            <div className="pill">Protocol clarity before marketing noise</div>
          </div>
        </div>
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
              <div className="section-subtitle">Core contributors • VestraProtocol.io (coming soon)</div>
            </div>
            <button
              className="button ghost"
              type="button"
              onClick={() =>
                window.open('mailto:0xkenichi@gmail.com?subject=Partnership%20inquiry')
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
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Explore the Platform</h3>
            <div className="section-subtitle">Navigate by role and workflow</div>
          </div>
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/borrow')}>Borrower flow</button>
          <button className="button ghost" type="button" onClick={() => navigate('/repay')}>Repayment</button>
          <button className="button ghost" type="button" onClick={() => navigate('/lender')}>Lender operations</button>
          <button className="button ghost" type="button" onClick={() => navigate('/community-pools')}>Community pools</button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs')}>Docs hub</button>
        </div>
      </div>
    </div>
  );
}
