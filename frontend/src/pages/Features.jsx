import { useNavigate } from 'react-router-dom';

function ProtocolArchitectureVisual() {
  const layers = [
    {
      id: 'input',
      label: 'Input Signals',
      nodes: [
        { title: 'Borrowers', meta: 'Vesting profile + requested tenor' },
        { title: 'Lenders', meta: 'Pool limits + risk appetite' }
      ]
    },
    {
      id: 'decision',
      label: 'Decision Layer',
      nodes: [
        { title: 'Risk Engine', meta: 'LTV, haircut, behavior-adjusted quote' },
        { title: 'Community Pools', meta: 'Co-funded capacity and queue depth' }
      ]
    },
    {
      id: 'execution',
      label: 'Execution Layer',
      nodes: [
        { title: 'Borrow Route', meta: 'Escrow rights -> USDC disbursement' },
        { title: 'Settlement Rail', meta: 'Repay, auto-settle, or fallback path' }
      ]
    }
  ];

  return (
    <div className="feature-diagram feature-diagram--architecture" role="img" aria-label="Protocol architecture diagram">
      <div className="feature-diagram__overlay" aria-hidden="true" />
      <div className="feature-diagram__layers">
        {layers.map((layer, index) => (
          <div key={layer.id} className="feature-diagram__layer">
            <div className="feature-diagram__layer-head">
              <span className="feature-diagram__layer-index">0{index + 1}</span>
              <span>{layer.label}</span>
            </div>
            <div className="feature-diagram__layer-grid">
              {layer.nodes.map((node) => (
                <article key={node.title} className="feature-diagram__node">
                  <h4>{node.title}</h4>
                  <p>{node.meta}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowLane({ title, steps, footer, tone = 'info' }) {
  return (
    <section className={`flow-lane flow-lane--${tone}`} aria-label={title}>
      <div className="flow-lane__title">{title}</div>
      <ol className="flow-lane__steps">
        {steps.map((step, idx) => (
          <li key={step.title} className="flow-lane__step">
            <span className="flow-lane__step-index">{idx + 1}</span>
            <div>
              <h5>{step.title}</h5>
              <p>{step.copy}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="flow-lane__footer">{footer}</p>
    </section>
  );
}

function BorrowAndSettleVisual() {
  const borrowSteps = [
    { title: 'Escrow position synced', copy: 'Unlock schedule and cliff terms are verified on-chain.' },
    { title: 'Risk quote generated', copy: 'LTV and haircut are computed from tenor, liquidity, and behavior.' },
    { title: 'Borrow route selected', copy: 'Best-fit lender or community pool allocates USDC capacity.' },
    { title: 'USDC disbursed', copy: 'Borrower receives funds while collateral rights remain escrowed.' }
  ];

  const settleSteps = [
    { title: 'Repayment window opens', copy: 'Borrower can close early for lower carry and stronger score.' },
    { title: 'Auto-settle checks', copy: 'Contracts evaluate due date, amount paid, and unlock eligibility.' },
    { title: 'Grace + notice', copy: 'Protocol emits warnings before any fallback action is allowed.' },
    { title: 'Fallback execution', copy: 'Partial seize / auction path is invoked only when conditions fail.' }
  ];

  return (
    <div className="feature-diagram feature-diagram--flow" role="img" aria-label="Borrow and settle flow diagrams">
      <div className="feature-diagram__overlay" aria-hidden="true" />
      <div className="feature-diagram__flow-grid">
        <FlowLane
          title="Borrow Flow"
          tone="borrow"
          steps={borrowSteps}
          footer="Quote -> allocation -> disbursement is fully deterministic from contract state."
        />
        <FlowLane
          title="Settle Flow"
          tone="settle"
          steps={settleSteps}
          footer="Settlement is default path; fallback triggers only after explicit guardrails."
        />
      </div>
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
