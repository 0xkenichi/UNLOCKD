import { lazy, Suspense, useEffect, useState } from 'react';
import RepaySlider from '../components/repay/RepaySlider.jsx';
import RepayActions from '../components/repay/RepayActions.jsx';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import FundWallet from '../components/common/FundWallet.jsx';
import { apiDownload, fetchRepaySchedule } from '../utils/api.js';

const DebtClock = lazy(() => import('../components/repay/DebtClock.jsx'));

export default function Repay() {
  const [schedule, setSchedule] = useState([]);
  const [scheduleError, setScheduleError] = useState('');
  const [fundingStatus, setFundingStatus] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const items = await fetchRepaySchedule();
        if (active) {
          setSchedule(items);
          setScheduleError('');
        }
      } catch (error) {
        if (active) {
          setScheduleError(error?.message || 'Failed to load schedule.');
        }
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleDownload = () => {
    apiDownload('/api/exports/repay-schedule', 'vestra-repayment-schedule.csv');
  };
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
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration variant="repay" />
      </div>
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
      <FundWallet mode="repay" onStatusChange={setFundingStatus} />
      <div className="grid-2">
        <Suspense fallback={holoFallback}>
          <DebtClock />
        </Suspense>
        <RepaySlider />
      </div>
      <RepayActions fundingStatus={fundingStatus} />
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Repayment Schedule</h3>
            <div className="section-subtitle">Upcoming obligations</div>
          </div>
          <button className="button ghost" type="button" onClick={handleDownload}>
            Download
          </button>
        </div>
        {scheduleError ? (
          <div className="muted">{scheduleError}</div>
        ) : schedule.length ? (
          <div className="data-table">
            <div className="table-row header">
              <div>Loan</div>
              <div>Asset</div>
              <div>Due</div>
              <div>Status</div>
            </div>
            {schedule.map((row) => (
              <div key={row.loanId} className="table-row">
                <div>#{row.loanId}</div>
                <div className="asset-cell">
                  <span className="asset-icon usdc" />
                  USDC
                </div>
                <div>
                  {row.unlockTime
                    ? new Date(row.unlockTime * 1000).toLocaleDateString()
                    : '--'}
                </div>
                <div className="tag">{row.status || 'Scheduled'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">No scheduled repayments yet.</div>
        )}
      </div>
    </div>
  );
}
