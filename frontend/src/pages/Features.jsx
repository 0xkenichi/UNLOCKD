import { useNavigate } from 'react-router-dom';

function ProtocolArchitectureVisual() {
  return (
    <div className="feature-diagram feature-diagram--image" aria-label="UNLOCKD protocol architecture diagram">
      <img
        className="feature-diagram__img"
        src="/diagrams/unlockd-architecture.png"
        alt="UNLOCKD Protocol Architecture"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function BorrowAndSettleVisual() {
  return (
    <div className="feature-diagram feature-diagram--image-stack" aria-label="Borrow and settle flow diagrams">
      <img
        className="feature-diagram__img"
        src="/diagrams/unlockd-borrow-flow.png"
        alt="Borrow Flow (Escrow to Loan Issuance)"
        loading="lazy"
        decoding="async"
      />
      <div className="feature-diagram__divider" aria-hidden="true" />
      <img
        className="feature-diagram__img"
        src="/diagrams/unlockd-settle-flow.png"
        alt="Repay and Settle Flow"
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

export default function Features() {
  const navigate = useNavigate();
  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Features</h1>
        <div className="page-subtitle">
          A practical view of how Vestra works: architecture, lifecycle, risk logic, and participant
          experience.
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/borrow')}>
            Borrow flow
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/lender')}>
            Lender flow
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/community-pools')}>
            Community pools
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=technical-spec')}>
            Technical docs
          </button>
        </div>
      </div>
      <div className="grid-2">
        <div className="holo-card feature-visual-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Protocol Architecture</h3>
              <div className="section-subtitle">How borrower, lender, risk, and settlement connect</div>
            </div>
            <span className="tag">Framework</span>
          </div>
          <ProtocolArchitectureVisual />
        </div>
        <div className="holo-card feature-visual-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Borrow + Settle Flows</h3>
              <div className="section-subtitle">High-fidelity lanes from escrow entry to deterministic closeout</div>
            </div>
            <span className="tag">Borrow / Settle</span>
          </div>
          <BorrowAndSettleVisual />
        </div>
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Risk Models</div>
          <div className="stat-value">Monte Carlo</div>
          <div className="stat-delta">DPV + LTV curves</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Settlement</div>
          <div className="stat-value">Auto</div>
          <div className="stat-delta">At unlock</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Custody</div>
          <div className="stat-value">Non-custodial</div>
          <div className="stat-delta">Escrowed rights</div>
        </div>
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <h3 className="holo-title">Borrower perspective</h3>
          <ul className="feature-bullet-list muted">
            <li>Escrow claim rights without selling long-term upside.</li>
            <li>Receive conservative quote based on unlock profile and risk constraints.</li>
            <li>Repay early to optimize terms and preserve reputation signals.</li>
            <li>Use Identity optionality to unlock better access over time.</li>
          </ul>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Lender perspective</h3>
          <ul className="feature-bullet-list muted">
            <li>Define risk appetite, LTV caps, and unlock windows at pool level.</li>
            <li>Allocate liquidity while keeping non-custodial execution posture.</li>
            <li>Observe utilization and match quality from transparent pool metrics.</li>
            <li>Enforce repayment pathways with contract-level settlement rules.</li>
          </ul>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Community pooling</h3>
          <ul className="feature-bullet-list muted">
            <li>Groups can fund together and activate lending when thresholds are reached.</li>
            <li>Rewards can be weighted by contribution size or building participation.</li>
            <li>State machine handles fundraising, active phase, refunds, and closeout.</li>
            <li>Members can contribute, claim rewards, or claim refunds on-chain.</li>
          </ul>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Risk adjustment logic</h3>
          <ul className="feature-bullet-list muted">
            <li>Base valuation starts with unlock timeline and collateral specifics.</li>
            <li>Haircuts adapt to token liquidity profile and market volatility.</li>
            <li>Identity tier and behavior data can improve confidence bands.</li>
            <li>Fallback outcomes are predetermined to reduce lender downside drift.</li>
          </ul>
        </div>
      </div>
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Explore by role</h3>
            <div className="section-subtitle">Move through product surfaces based on what you need</div>
          </div>
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/borrow')}>I am a borrower</button>
          <button className="button ghost" type="button" onClick={() => navigate('/repay')}>Repayment tools</button>
          <button className="button ghost" type="button" onClick={() => navigate('/lender')}>I am a lender</button>
          <button className="button ghost" type="button" onClick={() => navigate('/community-pools')}>Community pooling</button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs')}>Read docs</button>
          <button className="button ghost" type="button" onClick={() => navigate('/about')}>Team and roadmap</button>
        </div>
      </div>
    </div>
  );
}
