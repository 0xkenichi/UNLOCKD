import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi';
import EssentialsPanel from '../components/common/EssentialsPanel.jsx';
import PageIllustration from '../components/illustrations/PageIllustration.jsx';
import { getContractAddress, loanManagerAbi, usdcAbi } from '../utils/contracts.js';
import { formatValue } from '../utils/format.js';
import { apiDownload, fetchActivity } from '../utils/api.js';

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
        if (active) {
          setActivityError(error?.message || 'Failed to load activity.');
        }
      } finally {
        if (active) {
          setIsLoadingActivity(false);
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleExportActivity = () => {
    apiDownload('/api/exports/activity', 'vestra-activity.csv');
  };

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

  const formattedBalance = useMemo(
    () => formatValue(usdcBalance, 6),
    [usdcBalance]
  );

  const recentIds = useMemo(() => {
    if (!loanCount || loanCount === 0n) {
      return [];
    }
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
      .filter((read) => read.status === 'success')
      .map((read, index) => {
        const loan = read.result;
        const unlockTimestamp = loan ? Number(loan[4]) : 0;
        return {
          id: `Loan-${recentIds[index]?.toString() || index}`,
          token: 'USDC',
          quantity: loan ? loan[1].toString() : '0',
          principal: loan ? loan[1].toString() : '0',
          interest: loan ? loan[2].toString() : '0',
          ltv: loan ? `${(Number(loan[2]) / 100).toFixed(2)}%` : '--',
          unlock: unlockTimestamp ? new Date(unlockTimestamp * 1000).toLocaleDateString() : '--',
          unlockTimestamp,
          active: Boolean(loan?.[5])
        };
      });
  }, [loanReads, recentIds]);

  const nextUnlock = useMemo(() => {
    if (!positions.length) return '--';
    return positions
      .map((pos) => pos.unlockTimestamp)
      .filter((value) => value)
      .sort((a, b) => a - b)[0];
  }, [positions]);

  const formattedNextUnlock = useMemo(() => {
    if (!nextUnlock) return '--';
    return new Date(nextUnlock * 1000).toLocaleDateString();
  }, [nextUnlock]);

  const totals = useMemo(() => {
    const sum = (value) => (Number.isFinite(value) ? value : 0);
    return positions.reduce(
      (acc, pos) => {
        const principal = Number(pos.principal || 0);
        const interest = Number(pos.interest || 0);
        return {
          principal: acc.principal + sum(principal),
          interest: acc.interest + sum(interest),
          activeCount: acc.activeCount + (pos.active ? 1 : 0)
        };
      },
      { principal: 0, interest: 0, activeCount: 0 }
    );
  }, [positions]);

  const visiblePositions = useMemo(() => {
    const normalized = positionQuery.trim().toLowerCase();
    const filtered = positions.filter((pos) => {
      if (!showInactive && !pos.active) return false;
      if (!normalized) return true;
      return [
        pos.id,
        pos.token,
        pos.quantity,
        pos.ltv
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalized));
    });

    const sorted = [...filtered];
    sorted.sort((left, right) => {
      if (positionSort === 'amount-desc') {
        return Number(right.quantity || 0) - Number(left.quantity || 0);
      }
      if (positionSort === 'amount-asc') {
        return Number(left.quantity || 0) - Number(right.quantity || 0);
      }
      if (positionSort === 'unlock-desc') {
        return Number(right.unlockTimestamp || 0) - Number(left.unlockTimestamp || 0);
      }
      return Number(left.unlockTimestamp || 0) - Number(right.unlockTimestamp || 0);
    });
    return sorted;
  }, [positions, positionQuery, positionSort, showInactive]);

  const activityRows = useMemo(() => {
    if (!activity.length) return [];
    return activity.map((item) => ({
      event: item.type === 'LoanCreated'
        ? 'Borrowed'
        : item.type === 'LoanRepaid'
          ? 'Repayment'
          : 'Settlement',
      asset: 'USDC',
      amount: item.amount ? item.amount : '--',
      status: item.type === 'LoanSettled' && item.defaulted ? 'Defaulted' : 'Confirmed'
    }));
  }, [activity]);

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Portfolio</h1>
        <div className="page-subtitle">
          Your balances, positions, and activity in one place.
        </div>
      </div>
      <div className="grid-2 essentials-row">
        <EssentialsPanel />
        <PageIllustration variant="portfolio" />
      </div>
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Active Loans</div>
          <div className="stat-value">{totals.activeCount}</div>
          <div className="stat-delta">Active positions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">USDC Balance</div>
          <div className="stat-value">{formattedBalance}</div>
          <div className="stat-delta">Wallet balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Next Unlock</div>
          <div className="stat-value">{formattedNextUnlock}</div>
          <div className="stat-delta">Earliest vest</div>
        </div>
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <h3 className="holo-title">Account</h3>
          <div className="stack">
            <div>Wallet: {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '--'}</div>
            <div>Network ID: {chainId || '--'}</div>
          </div>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Next Actions</h3>
          <div className="muted">Start a flow when you are ready.</div>
          <div className="stack">
            <button className="button" onClick={() => navigate('/borrow')}>
              Borrow
            </button>
            <button className="button ghost" onClick={() => navigate('/repay')}>
              Repay
            </button>
          </div>
        </div>
      </div>
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Positions</h3>
            <div className="section-subtitle">Most recent loans and unlocks</div>
          </div>
          <div className="stack-row">
            <label className="form-field">
              <input
                className="form-input"
                placeholder="Search positions"
                value={positionQuery}
                onChange={(event) => setPositionQuery(event.target.value)}
              />
            </label>
            <label className="form-field">
              <select
                className="form-input"
                value={positionSort}
                onChange={(event) => setPositionSort(event.target.value)}
              >
                <option value="unlock-asc">Unlock soonest</option>
                <option value="unlock-desc">Unlock latest</option>
                <option value="amount-desc">Largest amount</option>
                <option value="amount-asc">Smallest amount</option>
              </select>
            </label>
            <button
              className="button ghost"
              type="button"
              onClick={() => setShowInactive((prev) => !prev)}
            >
              {showInactive ? 'Hide inactive' : 'Show inactive'}
            </button>
          </div>
        </div>
        <div className="grid-2">
          <div className="pill">Total principal: {totals.principal.toLocaleString()}</div>
          <div className="pill">Total interest: {totals.interest.toLocaleString()}</div>
        </div>
        {visiblePositions.length ? (
          <div className="data-table">
            <div className="table-row header">
              <div>Loan</div>
              <div>Amount</div>
              <div>Interest</div>
              <div>Unlock</div>
              <div>Status</div>
            </div>
            {visiblePositions.map((position) => (
              <div key={position.id} className="table-row">
                <div>{position.id}</div>
                <div>{position.quantity}</div>
                <div>{position.interest}</div>
                <div>{position.unlock}</div>
                <div>
                  <span className={`tag ${position.active ? 'success' : ''}`}>
                    {position.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">
            {showInactive ? 'No positions found.' : 'No active positions yet.'}
          </div>
        )}
      </div>
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Recent Activity</h3>
            <div className="section-subtitle">Latest vault and loan events</div>
          </div>
          <div className="stack-row">
            <button
              className="button ghost"
              type="button"
              onClick={handleExportActivity}
            >
              Export
            </button>
            <button
              className="button ghost"
              type="button"
              onClick={() => {
                setIsLoadingActivity(true);
                fetchActivity()
                  .then(({ items }) => {
                    setActivity(items.slice(0, MAX_ACTIVITY));
                    setActivityError('');
                  })
                  .catch((error) => {
                    setActivityError(error?.message || 'Failed to load activity.');
                  })
                  .finally(() => {
                    setIsLoadingActivity(false);
                  });
              }}
              disabled={isLoadingActivity}
            >
              {isLoadingActivity ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        {activityError ? (
          <div className="muted">{activityError}</div>
        ) : isLoadingActivity ? (
          <div className="muted">Loading activity…</div>
        ) : activityRows.length ? (
          <div className="data-table">
            <div className="table-row header">
              <div>Event</div>
              <div>Asset</div>
              <div>Amount</div>
              <div>Status</div>
            </div>
            {activityRows.map((row, index) => (
              <div key={`${row.event}-${index}`} className="table-row">
                <div>{row.event}</div>
                <div className="asset-cell">
                  <span className="asset-icon usdc" />
                  {row.asset}
                </div>
                <div>{row.amount}</div>
                <div className="tag success">{row.status}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted">No recent activity yet.</div>
        )}
      </div>
    </div>
  );
}
