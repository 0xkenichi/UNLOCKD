import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWatchContractEvent
} from 'wagmi';
import ChainPrompt from '../components/common/ChainPrompt.jsx';
import LiveLoans from '../components/dashboard/LiveLoans.jsx';
import LiveVestedContracts from '../components/dashboard/LiveVestedContracts.jsx';
import SpotlightVestedContracts from '../components/dashboard/SpotlightVestedContracts.jsx';
import {
  getContractAddress,
  loanManagerAbi,
  usdcAbi
} from '../utils/contracts.js';
import { formatValue } from '../utils/format.js';
import { apiDownload, fetchActivity } from '../utils/api.js';

const HoloCard = lazy(() => import('../components/common/HoloCard.jsx'));
const DashboardHolo = lazy(() => import('../components/dashboard/DashboardHolo.jsx'));

export default function Dashboard() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');
  const [activity, setActivity] = useState([]);
  const [activityMeta, setActivityMeta] = useState(null);
  const [activityError, setActivityError] = useState('');

  const mergeActivity = (incoming) => {
    setActivity((prev) => {
      const merged = new Map();
      [...incoming, ...prev].forEach((item) => {
        if (!item) return;
        const key = `${item.txHash || ''}-${item.logIndex || item.type}-${item.loanId || ''}`;
        merged.set(key, item);
      });
      return Array.from(merged.values()).slice(0, 12);
    });
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { items, meta } = await fetchActivity();
        if (active) {
          setActivity(items.slice(0, 12));
          setActivityMeta(meta);
          setActivityError('');
        }
      } catch (error) {
        if (active) {
          setActivityError(error?.message || 'Failed to load activity.');
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

  const { data: loanCount } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loanCount',
    query: { enabled: Boolean(loanManager) }
  });

  const recentIds = useMemo(() => {
    if (!loanCount || loanCount === 0n) {
      return [];
    }
    const count = Number(loanCount);
    const start = Math.max(count - 3, 0);
    return Array.from({ length: count - start }, (_, idx) => BigInt(start + idx));
  }, [loanCount]);

  const { data: usdcBalance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [address || '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(usdc && address) }
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

  const positions = useMemo(() => {
    if (!loanReads) return [];
    return loanReads
      .filter((read) => read.status === 'success')
      .map((read, index) => {
        const loan = read.result;
        return {
          id: `Loan-${recentIds[index]?.toString() || index}`,
          token: 'USDC',
          quantity: loan ? loan[1].toString() : '0',
          pv: loan ? loan[1].toString() : '0',
          ltv: loan ? `${(Number(loan[2]) / 100).toFixed(2)}%` : '--',
          unlock: loan ? new Date(Number(loan[4]) * 1000).toLocaleDateString() : '--'
        };
      });
  }, [loanReads, recentIds]);

  const nextUnlock = useMemo(() => {
    if (!positions.length) return '--';
    return positions
      .map((pos) => pos.unlock)
      .filter(Boolean)
      .sort()[0];
  }, [positions]);

  const handleExportActivity = () => {
    apiDownload('/api/exports/activity', 'vestra-activity.csv');
  };

  useWatchContractEvent({
    address: loanManager,
    abi: loanManagerAbi,
    eventName: 'LoanCreated',
    enabled: Boolean(loanManager && publicClient),
    onLogs: async (logs) => {
      if (!publicClient) return;
      const incoming = await Promise.all(
        logs.map(async (log) => {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          return {
            type: 'LoanCreated',
            loanId: log.args?.loanId?.toString?.() || '',
            borrower: log.args?.borrower,
            amount: log.args?.amount?.toString?.() || '',
            txHash: log.transactionHash,
            logIndex: Number(log.logIndex),
            timestamp: Number(block?.timestamp || 0)
          };
        })
      );
      mergeActivity(incoming);
    }
  });

  useWatchContractEvent({
    address: loanManager,
    abi: loanManagerAbi,
    eventName: 'LoanRepaid',
    enabled: Boolean(loanManager && publicClient),
    onLogs: async (logs) => {
      if (!publicClient) return;
      const incoming = await Promise.all(
        logs.map(async (log) => {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          return {
            type: 'LoanRepaid',
            loanId: log.args?.loanId?.toString?.() || '',
            amount: log.args?.amount?.toString?.() || '',
            txHash: log.transactionHash,
            logIndex: Number(log.logIndex),
            timestamp: Number(block?.timestamp || 0)
          };
        })
      );
      mergeActivity(incoming);
    }
  });

  useWatchContractEvent({
    address: loanManager,
    abi: loanManagerAbi,
    eventName: 'LoanSettled',
    enabled: Boolean(loanManager && publicClient),
    onLogs: async (logs) => {
      if (!publicClient) return;
      const incoming = await Promise.all(
        logs.map(async (log) => {
          const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
          return {
            type: 'LoanSettled',
            loanId: log.args?.loanId?.toString?.() || '',
            defaulted: Boolean(log.args?.defaulted),
            txHash: log.transactionHash,
            logIndex: Number(log.logIndex),
            timestamp: Number(block?.timestamp || 0)
          };
        })
      );
      mergeActivity(incoming);
    }
  });

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
        <h1 className="page-title holo-glow">Dashboard</h1>
        <div className="page-subtitle">
          Track positions, unlock timelines, and conservative borrow power.
        </div>
      </div>
      <ChainPrompt />
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-value">$184,220</div>
          <div className="stat-delta">+2.4% weekly</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Borrow Capacity</div>
          <div className="stat-value">$92,110</div>
          <div className="stat-delta">Conservative LTV</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Health Factor</div>
          <div className="stat-value">1.74</div>
          <div className="stat-delta">Low risk</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Next Unlock</div>
          <div className="stat-value">{nextUnlock}</div>
          <div className="stat-delta">Earliest vest</div>
        </div>
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <h3 className="holo-title">Active Loans</h3>
          <div className="metric-value">
            {loanCount ? loanCount.toString() : '0'}
          </div>
          <div className="muted">Loan count from LoanManager</div>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Next Unlock</h3>
          <div className="metric-value">{nextUnlock}</div>
          <div className="muted">Earliest unlock date</div>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">USDC Balance</h3>
          <div className="metric-value">
            {formatValue(usdcBalance, 6)}
          </div>
          <div className="muted">Wallet balance (6 decimals)</div>
        </div>
      </div>
      <Suspense fallback={holoFallback}>
        <HoloCard>
          <DashboardHolo positions={positions} />
        </HoloCard>
      </Suspense>
      <LiveLoans />
      <LiveVestedContracts />
      <SpotlightVestedContracts />
      <div className="grid-2">
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Market Overview</h3>
              <div className="section-subtitle">Top collateral markets</div>
            </div>
            <button
              className="button ghost"
              type="button"
              onClick={() => navigate('/features')}
            >
              View Markets
            </button>
          </div>
          <div className="data-table">
            <div className="table-row header">
              <div>Asset</div>
              <div>Supply</div>
              <div>Borrow APY</div>
              <div>Utilization</div>
            </div>
            <div className="table-row">
              <div className="asset-cell">
                <span className="asset-icon eth" />
                ETH
              </div>
              <div>$8.2M</div>
              <div>6.1%</div>
              <div>72%</div>
            </div>
            <div className="table-row">
              <div className="asset-cell">
                <span className="asset-icon usdc" />
                USDC
              </div>
              <div>$5.4M</div>
              <div>4.3%</div>
              <div>64%</div>
            </div>
            <div className="table-row">
              <div className="asset-cell">
                <span className="asset-icon arb" />
                ARB
              </div>
              <div>$2.1M</div>
              <div>9.8%</div>
              <div>81%</div>
            </div>
          </div>
        </div>
        <div className="holo-card">
          <div className="section-head">
            <div>
              <h3 className="section-title">Recent Activity</h3>
              <div className="section-subtitle">Vault & loan events</div>
            </div>
            <button
              className="button ghost"
              type="button"
              onClick={handleExportActivity}
            >
              Export
            </button>
          </div>
          {activityError ? (
            <div className="muted">{activityError}</div>
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
            <div className="muted">
              {activityMeta?.lookbackBlocks
                ? `No recent activity in the last ${activityMeta.lookbackBlocks} blocks.`
                : 'No recent activity yet.'}
            </div>
          )}
        </div>
      </div>
      <div className="grid-2">
        {positions.length ? (
          positions.map((position) => (
          <div key={position.id} className="holo-card">
            <div className="holo-title">{position.token} Vault</div>
            <div className="muted">Unlocks: {position.unlock}</div>
            <div className="stack">
              <div>Quantity: {position.quantity}</div>
              <div>PV: {position.pv}</div>
              <div>LTV: {position.ltv}</div>
            </div>
          </div>
          ))
        ) : (
          <div className="holo-card">
            <h3 className="holo-title">No Live Loans</h3>
            <div className="muted">
              Create a loan on Sepolia to populate live positions.
            </div>
          </div>
        )}
      </div>
      <div className="grid-2">
        <div className="holo-card">
          <h3 className="holo-title">Quick Actions</h3>
          <div className="muted">Move fast with prefilled flows.</div>
          <div className="stack">
            <button className="button" onClick={() => navigate('/borrow')}>
              Start Borrow Flow
            </button>
            <button className="button ghost" onClick={() => navigate('/repay')}>
              Repay or Settle
            </button>
          </div>
        </div>
        <div className="holo-card">
          <h3 className="holo-title">Protocol Health</h3>
          <div className="muted">Testnet metrics not yet available.</div>
          <div className="stack">
            <div className="pill">Utilization: --</div>
            <div className="pill">Avg LTV: --</div>
            <div className="pill">Defaults: --</div>
          </div>
        </div>
      </div>
    </div>
  );
}
