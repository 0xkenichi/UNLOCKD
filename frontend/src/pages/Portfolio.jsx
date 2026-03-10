// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi';
import { getContractAddress, loanManagerAbi, usdcAbi } from '../utils/contracts.js';
import { formatValue } from '../utils/format.js';
import {
  apiDownload,
  fetchActivity,
  fetchSolanaStatus,
  fetchVestedContracts
} from '../utils/api.js';
import { useOnchainSession } from '../utils/onchainSession.js';
import AdvancedSection from '../components/common/AdvancedSection.jsx';
import PrivacyModeToggle from '../components/privacy/PrivacyModeToggle.jsx';
import PrivacyUpgradeWizard from '../components/privacy/PrivacyUpgradeWizard.jsx';
import { usePrivacyMode } from '../utils/privacyMode.js';

const MAX_POSITIONS = 12;
const MAX_ACTIVITY = 8;
const isHttpStatusError = (error, code) =>
  new RegExp(`Request failed:\\s*${code}`, 'i').test(String(error?.message || ''));

export default function Portfolio() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const { session } = useOnchainSession();
  const { enabled: privacyMode } = usePrivacyMode();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');
  const [activity, setActivity] = useState([]);
  const [activityError, setActivityError] = useState('');
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [solanaPositions, setSolanaPositions] = useState([]);
  const [solanaError, setSolanaError] = useState('');
  const [isLoadingSolanaPositions, setIsLoadingSolanaPositions] = useState(false);
  const [hasLoadedSolanaPositions, setHasLoadedSolanaPositions] = useState(false);
  const [solanaStatus, setSolanaStatus] = useState(null);
  const [solanaStatusError, setSolanaStatusError] = useState('');
  const [positionQuery, setPositionQuery] = useState('');
  const [positionSort, setPositionSort] = useState('unlock-asc');
  const [showInactive, setShowInactive] = useState(false);
  const isSolanaSession =
    session.chainType === 'solana' || Boolean(session.solanaWalletAddress);
  const solanaWallet = session.solanaWalletAddress || '';

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

  useEffect(() => {
    let active = true;
    if (!isSolanaSession || !solanaWallet) {
      setSolanaPositions([]);
      setSolanaError('');
      setIsLoadingSolanaPositions(false);
      setHasLoadedSolanaPositions(false);
      return () => {
        active = false;
      };
    }

    const loadSolanaVesting = async () => {
      setIsLoadingSolanaPositions(true);
      setSolanaError('');
      setHasLoadedSolanaPositions(false);
      try {
        const items = await fetchVestedContracts({
          chain: 'solana',
          walletAddress: solanaWallet,
          privacyMode
        });
        if (!active) return;
        const mapped = (items || []).map((item, idx) => {
          const unlockTs = Number(item?.unlockTime || 0);
          const quantity = item?.quantity ? String(item.quantity) : '--';
          return {
            loanId: item?.loanId || item?.streamId || `solana-${idx}`,
            id: `Solana-${item?.loanId || item?.streamId || idx}`,
            principal: quantity,
            interest: item?.pv ? String(item.pv) : '0',
            unlock: unlockTs ? new Date(unlockTs * 1000).toLocaleDateString() : '--',
            unlockTimestamp: unlockTs,
            active: Boolean(item?.active)
          };
        });
        setSolanaPositions(mapped);
      } catch (error) {
        if (!active) return;
        setSolanaPositions([]);
        if (isHttpStatusError(error, 404)) {
          setSolanaError('Solana vesting endpoint is unavailable on backend (`/api/vested-contracts`).');
        } else if (String(error?.message || '').toLowerCase().includes('timed out')) {
          setSolanaError('Solana vesting request timed out. Please retry after backend stabilizes.');
        } else {
          setSolanaError(error?.message || 'Failed to load Solana vesting.');
        }
      } finally {
        if (active) {
          setIsLoadingSolanaPositions(false);
          setHasLoadedSolanaPositions(true);
        }
      }
    };

    loadSolanaVesting();
    return () => {
      active = false;
    };
  }, [isSolanaSession, solanaWallet, privacyMode]);

  useEffect(() => {
    let active = true;
    if (!isSolanaSession) {
      setSolanaStatus(null);
      setSolanaStatusError('');
      return () => {
        active = false;
      };
    }
    fetchSolanaStatus()
      .then((status) => {
        if (!active) return;
        setSolanaStatus(status);
        setSolanaStatusError('');
      })
      .catch((error) => {
        if (!active) return;
        setSolanaStatus(null);
        if (isHttpStatusError(error, 404) || String(error?.message || '').toLowerCase().includes('timed out')) {
          setSolanaStatusError('');
        } else {
          setSolanaStatusError(error?.message || 'Unable to read Solana indexer status.');
        }
      });
    return () => {
      active = false;
    };
  }, [isSolanaSession]);

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

  const { data: privateFlags } = useReadContracts({
    contracts: recentIds.map((id) => ({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'isPrivateLoan',
      args: [id]
    })),
    query: { enabled: Boolean(loanManager && recentIds.length) }
  });

  const { data: loanReads } = useReadContracts({
    contracts: recentIds.map((id) => ({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'loans',
      args: [id]
    })),
    query: { enabled: Boolean(loanManager && recentIds.length) }
  });

  const { data: privateLoanReads } = useReadContracts({
    contracts: recentIds.map((id) => ({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'privateLoans',
      args: [id]
    })),
    query: { enabled: Boolean(loanManager && recentIds.length) }
  });

  const evmPositions = useMemo(() => {
    if (!loanReads || !privateFlags || !privateLoanReads) return [];
    return recentIds.map((id, i) => {
      const privateFlagRow = privateFlags[i];
      const isPrivate =
        privateFlagRow?.status === 'success' ? Boolean(privateFlagRow.result) : false;
      const loanRow = loanReads[i];
      const privateLoanRow = privateLoanReads[i];

      const loan = loanRow?.status === 'success' ? loanRow.result : null;
      const priv = privateLoanRow?.status === 'success' ? privateLoanRow.result : null;

      // Loan struct:
      // 0 borrower, 1 principal, 2 interest, 3 collateralId, 4 collateralAmount, 5 unlockTime, 6 active
      const unlockTs = isPrivate
        ? priv
          ? Number(priv[5])
          : 0
        : loan
          ? Number(loan[5])
          : 0;
      const active = isPrivate ? Boolean(priv?.[6]) : Boolean(loan?.[6]);
      const principal = (isPrivate ? (priv?.[1] ?? 0n) : (loan?.[1] ?? 0n)) || 0n;
      const interest = (isPrivate ? (priv?.[2] ?? 0n) : (loan?.[2] ?? 0n)) || 0n;
      const loanId = id?.toString?.() || String(i);

      return {
        loanId,
        id: `${isPrivate ? 'PrivateLoan' : 'Loan'}-${loanId}`,
        principal: principal.toString(),
        interest: interest.toString(),
        unlock: unlockTs ? new Date(unlockTs * 1000).toLocaleDateString() : '--',
        unlockTimestamp: unlockTs,
        active
      };
    });
  }, [loanReads, privateFlags, privateLoanReads, recentIds]);

  const positions = useMemo(
    () => (isSolanaSession ? solanaPositions : evmPositions),
    [evmPositions, isSolanaSession, solanaPositions]
  );

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
        <div className="inline-actions" style={{ marginTop: 8 }}>
          <span className="chip">Testnet portfolio mode</span>
          <span className="chip">For demo verification</span>
        </div>
        <div className="inline-actions" style={{ marginTop: 10 }}>
          <PrivacyModeToggle />
        </div>
      </div>

      <PrivacyUpgradeWizard enabled={privacyMode} />

      <div className="stat-row portfolio-stats">
        <div className="stat-card stat-card-minimal">
          <div className="stat-value">{totals.activeCount}</div>
          <div className="stat-label">{isSolanaSession ? 'Vesting streams' : 'Loans'}</div>
        </div>
        <div className="stat-card stat-card-minimal">
          <div className="stat-value">{isSolanaSession ? (solanaWallet ? `${solanaWallet.slice(0, 6)}…${solanaWallet.slice(-4)}` : '--') : formattedBalance}</div>
          <div className="stat-label">{isSolanaSession ? 'Phantom wallet' : 'USDC'}</div>
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
        <button
          className="button ghost"
          onClick={() => {
            if (isSolanaSession) {
              navigate('/repay');
              return;
            }
            const firstActive = visiblePositions.find((pos) => pos.active);
            if (firstActive?.loanId) {
              navigate(`/repay?loanId=${encodeURIComponent(firstActive.loanId)}`);
              return;
            }
            navigate('/repay');
          }}
        >
          Repay
        </button>
      </div>

      <div className="holo-card">
        <h3 className="section-title">Positions</h3>
        {isSolanaSession && solanaStatus?.streamflowEnabled === false && (
          <p className="error-banner">
            Solana vesting indexer is disabled on backend (`SOLANA_STREAMFLOW_ENABLED=false`).
            Enable it and restart backend to load Phantom vesting streams.
          </p>
        )}
        {isSolanaSession && solanaStatus?.streamflowEnabled && (
          <p className="muted">
            Solana vesting indexer is enabled ({solanaStatus.cluster || 'mainnet'} cluster).
          </p>
        )}
        {isSolanaSession && solanaStatusError && !solanaError && (
          <p className="muted">{solanaStatusError}</p>
        )}
        {isLoadingSolanaPositions && (
          <p className="muted">Loading Solana vesting positions...</p>
        )}
        {solanaError && (
          <p className="muted">{solanaError}</p>
        )}
        {isSolanaSession && hasLoadedSolanaPositions && !isLoadingSolanaPositions && !solanaError && !visiblePositions.length && (
          <p className="muted">
            No Solana vesting streams found for this Phantom wallet. If Jup shows holdings but not vesting streams, those assets may not be Streamflow vesting contracts indexed by this backend.
          </p>
        )}
        {visiblePositions.length ? (
          <div className="data-table">
            <div className="table-row header">
              <div>Loan</div>
              <div>{isSolanaSession ? 'Quantity' : 'Principal'}</div>
              <div>Unlock</div>
              <div>Status</div>
              <div>Action</div>
            </div>
            {visiblePositions.map((pos) => (
              <div key={pos.id} className="table-row">
                <div data-label="Loan">{pos.id}</div>
                <div data-label="Principal">{pos.principal}</div>
                <div data-label="Unlock">{pos.unlock}</div>
                <div data-label="Status">
                  <span className={`tag ${pos.active ? 'success' : ''}`}>
                    {pos.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div data-label="Action">
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      isSolanaSession
                        ? navigate('/repay')
                        : navigate(`/repay?loanId=${encodeURIComponent(pos.loanId)}`)
                    }
                    disabled={!pos.active}
                  >
                    Repay
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          (!isSolanaSession || (hasLoadedSolanaPositions && !isLoadingSolanaPositions && !solanaError)) && (
            <p className="muted">{showInactive ? 'No positions.' : 'No active positions.'}</p>
          )
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
              aria-label="Search portfolio positions"
            />
            <select
              className="form-input"
              value={positionSort}
              onChange={(e) => setPositionSort(e.target.value)}
              aria-label="Sort portfolio positions"
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
                <div key={`${row.event}-${row.amount}-${i}`} className="table-row">
                  <div data-label="Event">{row.event}</div>
                  <div data-label="Amount">{row.amount}</div>
                  <div data-label="Status" className="tag success">{row.status}</div>
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
