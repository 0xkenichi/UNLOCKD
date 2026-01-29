import { lazy, Suspense, useMemo, useState } from 'react';
import BorrowWizard from '../components/borrow/BorrowWizard.jsx';
import FaucetCard from '../components/borrow/FaucetCard.jsx';
import BorrowActions from '../components/borrow/BorrowActions.jsx';
import TokenAssessment from '../components/borrow/TokenAssessment.jsx';
import ValuationForm from '../components/borrow/ValuationForm.jsx';
import ChainPrompt from '../components/common/ChainPrompt.jsx';
import { generateRiskPaths } from '../utils/riskPaths.js';

const ValuationPreview3D = lazy(() =>
  import('../components/borrow/ValuationPreview3D.jsx')
);

export default function Borrow() {
  const [valuationState, setValuationState] = useState({
    pv: 0n,
    ltvBps: 0n
  });
  const [vestingDetails, setVestingDetails] = useState(null);
  const [assessment, setAssessment] = useState({ maxLoan: 0 });

  const simPaths = useMemo(
    () =>
      generateRiskPaths({
        pv: Number(valuationState.pv),
        ltvBps: Number(valuationState.ltvBps)
      }),
    [valuationState]
  );

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
        <h1 className="page-title holo-glow">Borrow</h1>
        <div className="page-subtitle">
          Escrow a vesting position, preview risk, and confirm conservative terms.
        </div>
      </div>
      <ChainPrompt />
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Available Borrow</div>
          <div className="stat-value">$92,110</div>
          <div className="stat-delta">Based on DPV</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg LTV</div>
          <div className="stat-value">38.4%</div>
          <div className="stat-delta">Conservative target</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Unlock Window</div>
          <div className="stat-value">6-12 mo</div>
          <div className="stat-delta">Sample schedule</div>
        </div>
      </div>
      <div className="holo-card">
        <h3 className="holo-title">Testnet Notice</h3>
        <div className="muted">
          This flow is a prototype. Risk previews are illustrative and depend on
          the connected testnet contracts.
        </div>
      </div>
      <BorrowWizard />
      <div className="grid-2">
        <ValuationForm
          onUpdate={setValuationState}
          prefill={vestingDetails?.verified ? vestingDetails : null}
        />
        <BorrowActions
          onDetails={setVestingDetails}
          maxBorrowUsd={assessment.maxLoan}
        />
      </div>
      <TokenAssessment
        vestingDetails={vestingDetails}
        ltvBps={valuationState.ltvBps}
        onEstimate={setAssessment}
      />
      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Borrow Checklist</h3>
              <div className="section-subtitle">Before minting a loan</div>
            </div>
            <span className="tag">Step 2/4</span>
          </div>
          <div className="card-list">
            <div className="pill">Verify vesting ownership</div>
            <div className="pill">Confirm unlock schedule</div>
            <div className="pill">Review valuation + LTV</div>
            <div className="pill">Sign loan terms</div>
          </div>
        </div>
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Risk Summary</h3>
              <div className="section-subtitle">Auto-generated from inputs</div>
            </div>
            <span className="tag success">Low Risk</span>
          </div>
          <div className="card-list">
            <div className="pill">Haircut: {assessment.haircut ? `${(assessment.haircut * 100).toFixed(1)}%` : '--'}</div>
            <div className="pill">Adj Price: {assessment.adjustedPrice ? `$${assessment.adjustedPrice.toFixed(2)}` : '--'}</div>
            <div className="pill">Max Borrow: {assessment.maxLoan ? `$${assessment.maxLoan.toFixed(2)}` : '--'}</div>
          </div>
        </div>
      </div>
      <FaucetCard />
      <Suspense fallback={holoFallback}>
        <ValuationPreview3D paths={simPaths} />
      </Suspense>
    </div>
  );
}
