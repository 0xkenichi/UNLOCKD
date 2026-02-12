import { lazy, Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import RepaySlider from '../components/repay/RepaySlider.jsx';
import RepayActions from '../components/repay/RepayActions.jsx';
import FundWallet from '../components/common/FundWallet.jsx';
import AdvancedSection from '../components/common/AdvancedSection.jsx';
import { apiDownload, fetchRepaySchedule } from '../utils/api.js';

const DebtClock = lazy(() => import('../components/repay/DebtClock.jsx'));

export default function Repay() {
  const [schedule, setSchedule] = useState([]);
  const [scheduleError, setScheduleError] = useState('');
  const [fundingStatus, setFundingStatus] = useState(null);

  useEffect(() => {
    let active = true;
    let timer = null;
    const load = async () => {
      try {
        const items = await fetchRepaySchedule();
        if (active) {
          setSchedule(items);
          setScheduleError('');
        }
      } catch (error) {
        if (active) setScheduleError(error?.message || 'Failed to load.');
      }
    };

    const scheduleNext = (delayMs = 45000) => {
      timer = setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await load();
        }
        scheduleNext(45000 + Math.floor(Math.random() * 5000));
      }, delayMs);
    };

    load();
    scheduleNext();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleDownload = () => {
    apiDownload('/api/exports/repay-schedule', 'vestra-repay-schedule.csv');
  };

  const holoFallback = (
    <div className="holo-card">
      <div className="loading-row"><div className="spinner" /></div>
    </div>
  );

  return (
    <motion.div
      className="stack page-minimal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div className="page-header">
        <h1 className="page-title holo-glow">Repay</h1>
        <p className="page-subtitle">Reduce debt or settle at unlock.</p>
      </div>

      <FundWallet mode="repay" onStatusChange={setFundingStatus} />

      <div className="grid-2">
        <Suspense fallback={holoFallback}>
          <DebtClock />
        </Suspense>
        <RepaySlider />
      </div>
      <RepayActions fundingStatus={fundingStatus} />

      <AdvancedSection title="Schedule">
        <div className="section-head">
          <h4 className="section-title">Repayment schedule</h4>
          <button className="button ghost" type="button" onClick={handleDownload}>
            Download
          </button>
        </div>
        {scheduleError ? (
          <p className="muted">{scheduleError}</p>
        ) : schedule.length ? (
          <div className="data-table">
            <div className="table-row header">
              <div>Loan</div>
              <div>Due</div>
              <div>Status</div>
            </div>
            {schedule.map((row) => (
              <div key={row.loanId} className="table-row">
                <div>#{row.loanId}</div>
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
          <p className="muted">No scheduled repayments.</p>
        )}
      </AdvancedSection>
    </motion.div>
  );
}
