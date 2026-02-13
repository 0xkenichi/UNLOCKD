import { lazy, Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import RepaySlider from '../components/repay/RepaySlider.jsx';
import RepayActions from '../components/repay/RepayActions.jsx';
import FundWallet from '../components/common/FundWallet.jsx';
import DemoAccessCard from '../components/common/DemoAccessCard.jsx';
import AdvancedSection from '../components/common/AdvancedSection.jsx';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import { apiDownload, fetchRepaySchedule } from '../utils/api.js';

const DebtClock = lazy(() => import('../components/repay/DebtClock.jsx'));

export default function Repay() {
  const navigate = useNavigate();
  const location = useLocation();
  const [schedule, setSchedule] = useState([]);
  const [scheduleError, setScheduleError] = useState('');
  const [fundingStatus, setFundingStatus] = useState(null);
  const searchParams = new URLSearchParams(location.search);
  const loanIdPrefill = searchParams.get('loanId') || '';

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
        <div className="inline-actions" style={{ marginTop: 8 }}>
          <span className="chip">Testnet execution</span>
          <span className="chip">Use borrower wallet only</span>
        </div>
        <div className="inline-actions">
          <button className="button" type="button" onClick={() => navigate('/borrow')}>
            Back to borrow
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/features')}>
            Repay flow guide
          </button>
          <button className="button ghost" type="button" onClick={() => navigate('/docs?doc=technical-spec')}>
            Technical spec
          </button>
        </div>
      </div>
      <EssentialsPanel />
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Repayment playbook</h3>
            <div className="section-subtitle">Simple path to preserve collateral and credit quality</div>
          </div>
        </div>
        <div className="card-list">
          <div className="pill">Review due timeline and outstanding obligation</div>
          <div className="pill">Fund wallet before transaction windows close</div>
          <div className="pill">Repay early when possible to reduce rollover risk</div>
          <div className="pill">Use schedule export for treasury operations</div>
        </div>
      </div>

      <FundWallet mode="repay" onStatusChange={setFundingStatus} />
      <DemoAccessCard />

      <div className="grid-2">
        <Suspense fallback={holoFallback}>
          <DebtClock />
        </Suspense>
        <RepaySlider />
      </div>
      <RepayActions fundingStatus={fundingStatus} initialLoanId={loanIdPrefill} />

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
