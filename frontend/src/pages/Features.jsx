export default function Features() {
  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Features</h1>
        <div className="page-subtitle">
          Core capabilities planned for the MVP and beyond.
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
      <div className="grid-3">
        <div className="holo-card">
          <h3 className="holo-title">Non-custodial escrow</h3>
          <p className="muted">
            Claim rights escrowed; tokens remain locked in vesting contracts.
          </p>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Conservative DPV</h3>
          <p className="muted">
            Monte Carlo-informed discounts keep lender risk bounded.
          </p>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Auto settlement</h3>
          <p className="muted">
            Target behavior at unlock: release, partial seize, or liquidation.
          </p>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Identity optional</h3>
          <p className="muted">
            Optional privacy-first verification unlocks better terms.
          </p>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Dynamic risk pricing</h3>
          <p className="muted">
            Tokenomics-aware haircuts with DEX/CEX pricing feeds.
          </p>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Smart liquidation</h3>
          <p className="muted">
            Auctions provide price discovery when unlocks are missed.
          </p>
        </div>
      </div>
    </div>
  );
}
