import { lazy, Suspense } from 'react';
import RepaySlider from '../components/repay/RepaySlider.jsx';
import RepayActions from '../components/repay/RepayActions.jsx';
import ChainPrompt from '../components/common/ChainPrompt.jsx';

const DebtClock = lazy(() => import('../components/repay/DebtClock.jsx'));

export default function Repay() {
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
        <h1 className="page-title holo-glow">Repay</h1>
        <div className="page-subtitle">
          Reduce debt early, unlock collateral, or settle at unlock.
        </div>
      </div>
      <ChainPrompt />
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Outstanding Debt</div>
          <div className="stat-value">$42,120</div>
          <div className="stat-delta">Across 2 loans</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Next Payment</div>
          <div className="stat-value">May 21</div>
          <div className="stat-delta">Auto-settle enabled</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Health Factor</div>
          <div className="stat-value">1.68</div>
          <div className="stat-delta">Monitor weekly</div>
        </div>
      </div>
      <div className="holo-card">
        <h3 className="holo-title">Testnet Notice</h3>
        <div className="muted">
          Repayments are simulated against testnet contracts only.
        </div>
      </div>
      <div className="grid-2">
        <Suspense fallback={holoFallback}>
          <DebtClock />
        </Suspense>
        <RepaySlider />
      </div>
      <RepayActions />
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Repayment Schedule</h3>
            <div className="section-subtitle">Upcoming obligations</div>
          </div>
          <button className="button ghost" type="button">
            Download
          </button>
        </div>
        <div className="data-table">
          <div className="table-row header">
            <div>Loan</div>
            <div>Due</div>
            <div>Amount</div>
            <div>Status</div>
          </div>
          <div className="table-row">
            <div>#1021</div>
            <div>May 21</div>
            <div>$4,200</div>
            <div className="tag">Scheduled</div>
          </div>
          <div className="table-row">
            <div>#1013</div>
            <div>Jun 04</div>
            <div>$2,850</div>
            <div className="tag warn">Needs Review</div>
          </div>
        </div>
      </div>
    </div>
  );
}
