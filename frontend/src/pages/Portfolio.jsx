import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi';
import { getContractAddress, loanManagerAbi, usdcAbi } from '../utils/contracts.js';
import { formatValue } from '../utils/format.js';
import { apiDownload, fetchActivity } from '../utils/api.js';
import AdvancedSection from '../components/common/AdvancedSection.jsx';

const MAX_POSITIONS = 12;
const MAX_ACTIVITY = 8;

export default function Portfolio() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');
  const [activity, setActivity] = useState([]);
  const [activityError, setActivityError] = useState('');
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [positionQuery, setPositionQuery] = useState('');
  const [positionSort, setPositionSort] = useState('unlock-asc');
  const [showInactive, setShowInactive] = useState(false);

  const handleExportActivity = () => {
    apiDownload('/api/exports/activity', 'vestra-activity.csv');
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoadingActivity(true);
      try {
        const { items } = await fetchActivity();
        if (active) {
          setActivity(items.slice(0, MAX_ACTIVITY));
          setActivityError('');
        }
      } catch (error) {
        if (active) setActivityError(error?.message || 'Failed to load.');
      } finally {
        if (active) setIsLoadingActivity(false);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const { data: loanCount } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loanCount',
    query: { enabled: Boolean(loanManager) }
  });

  const { data: usdcBalance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [address || '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(usdc && address) }
  });

  const formattedBalance = useMemo(() => formatValue(usdcBalance, 6), [usdcBalance]);
  const recentIds = useMemo(() => {
    if (!loanCount || loanCount === 0n) return [];
    const count = Number(loanCount);
    const start = Math.max(count - MAX_POSITIONS, 0);
    return Array.from({ length: count - start }, (_, idx) => BigInt(start + idx));
  }, [loanCount]);

  const { data: loanReads } = useReadContracts({
    contracts: recentIds.map((id) => ({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'loans',
      args: [id]
    })),
    query: { enabled: Boolean(loanManager && recentIds.length) }
  });

  const positions = useMemo(() => {
    if (!loanReads) return [];
    return loanReads
      .filter((r) => r.status === 'success')
      .map((read, i) => {
        const loan = read.result;
        const unlockTs = loan ? Number(loan[4]) : 0;
        return {
          id: `Loan-${recentIds[i]?.toString() || i}`,
          principal: loan ? loan[1].toString() : '0',
          interest: loan ? loan[2].toString() : '0',
          unlock: unlockTs ? new Date(unlockTs * 1000).toLocaleDateString() : '--',
          unlockTimestamp: unlockTs,
          active: Boolean(loan?.[5])
        };
      });
  }, [loanReads, recentIds]);

  const visiblePositions = useMemo(() => {
    const q = positionQuery.trim().toLowerCase();
    let list = positions.filter((p) => {
      if (!showInactive && !p.active) return false;
      if (!q) return true;
      return [p.id, p.principal].some((v) => String(v).toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) => {
      if (positionSort === 'amount-desc') return Number(b.principal || 0) - Number(a.principal || 0);
      if (positionSort === 'amount-asc') return Number(a.principal || 0) - Number(b.principal || 0);
      if (positionSort === 'unlock-desc') return (b.unlockTimestamp || 0) - (a.unlockTimestamp || 0);
      return (a.unlockTimestamp || 0) - (b.unlockTimestamp || 0);
    });
    return list;
  }, [positions, positionQuery, positionSort, showInactive]);

  const activityRows = useMemo(
    () =>
      activity.map((item) => ({
        event: item.type === 'LoanCreated' ? 'Borrowed' : item.type === 'LoanRepaid' ? 'Repay' : 'Settlement',
        amount: item.amount || '--',
        status: item.type === 'LoanSettled' && item.defaulted ? 'Defaulted' : 'Confirmed'
      })),
    [activity]
  );

  const totals = useMemo(
    () =>
      positions.reduce(
        (acc, p) => ({
          principal: acc.principal + Number(p.principal || 0),
          interest: acc.interest + Number(p.interest || 0),
          activeCount: acc.activeCount + (p.active ? 1 : 0)
        }),
        { principal: 0, interest: 0, activeCount: 0 }
      ),
    [positions]
  );

  const nextUnlock = useMemo(() => {
    const ts = positions.map((p) => p.unlockTimestamp).filter(Boolean).sort((a, b) => a - b)[0];
    return ts ? new Date(ts * 1000).toLocaleDateString() : '--';
  }, [positions]);

  return (
    <motion.div
      className="stack page-minimal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div className="page-header">
        <h1 className="page-title holo-glow">Portfolio</h1>
        <p className="page-subtitle">Balances and positions.</p>
      </div>

      <div className="stat-row portfolio-stats">
        <div className="stat-card stat-card-minimal">
          <div className="stat-value">{totals.activeCount}</div>
          <div className="stat-label">Loans</div>
        </div>
        <div className="stat-card stat-card-minimal">
          <div className="stat-value">{formattedBalance}</div>
          <div className="stat-label">USDC</div>
        </div>
        <div className="stat-card stat-card-minimal">
          <div className="stat-value">{nextUnlock}</div>
          <div className="stat-label">Next unlock</div>
        </div>
      </div>

      <div className="dashboard-hero-actions">
        <button className="button" onClick={() => navigate('/borrow')}>
          Borrow
        </button>
        <button className="button ghost" onClick={() => navigate('/repay')}>
          Repay
        </button>
      </div>

      <div className="holo-card">
        <h3 className="section-title">Positions</h3>
        {visiblePositions.length ? (
          <div className="data-table">
            <div className="table-row header">
              <div>Loan</div>
              <div>Principal</div>
              <div>Unlock</div>
              <div>Status</div>
            </div>
            {visiblePositions.map((pos) => (
              <div key={pos.id} className="table-row">
                <div>{pos.id}</div>
                <div>{pos.principal}</div>
                <div>{pos.unlock}</div>
                <div>
                  <span className={`tag ${pos.active ? 'success' : ''}`}>
                    {pos.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{showInactive ? 'No positions.' : 'No active positions.'}</p>
        )}
      </div>

      <AdvancedSection title="Filters & activity">
        <div className="advanced-block">
          <div className="stack-row" style={{ gap: 8, marginBottom: 12 }}>
            <input
              className="form-input"
              placeholder="Search"
              value={positionQuery}
              onChange={(e) => setPositionQuery(e.target.value)}
            />
            <select
              className="form-input"
              value={positionSort}
              onChange={(e) => setPositionSort(e.target.value)}
            >
              <option value="unlock-asc">Unlock soonest</option>
              <option value="unlock-desc">Unlock latest</option>
              <option value="amount-desc">Largest</option>
              <option value="amount-asc">Smallest</option>
            </select>
            <button className="button ghost" type="button" onClick={() => setShowInactive((p) => !p)}>
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </button>
          </div>
        </div>
        <div className="advanced-block">
          <h4 className="section-title">Recent activity</h4>
          <div className="stack-row" style={{ gap: 8, marginBottom: 12 }}>
            <button className="button ghost" type="button" onClick={handleExportActivity}>
              Export
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={isLoadingActivity}
              onClick={() => {
                setIsLoadingActivity(true);
                fetchActivity()
                  .then(({ items }) => {
                    setActivity(items.slice(0, MAX_ACTIVITY));
                    setActivityError('');
                  })
                  .catch((e) => setActivityError(e?.message || 'Failed'))
                  .finally(() => setIsLoadingActivity(false));
              }}
            >
              {isLoadingActivity ? '…' : 'Refresh'}
            </button>
          </div>
          {activityError ? (
            <p className="muted">{activityError}</p>
          ) : activityRows.length ? (
            <div className="data-table">
              <div className="table-row header">
                <div>Event</div>
                <div>Amount</div>
                <div>Status</div>
              </div>
              {activityRows.map((row, i) => (
                <div key={i} className="table-row">
                  <div>{row.event}</div>
                  <div>{row.amount}</div>
                  <div className="tag success">{row.status}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No recent activity.</p>
          )}
        </div>
        <div className="advanced-block">
          <div className="card-list">
            <div className="pill">Principal: {totals.principal.toLocaleString()}</div>
            <div className="pill">Interest: {totals.interest.toLocaleString()}</div>
          </div>
        </div>
      </AdvancedSection>
    </motion.div>
  );
}
