import { useEffect, useMemo, useState } from 'react';
import {
  fetchAdminAirdropLeaderboard,
  downloadAdminAirdropLeaderboard
} from '../utils/api.js';

const DAY_OPTIONS = [7, 14, 30, 60, 90];
const PHASE_OPTIONS = [
  { id: 'all', label: 'All activity' },
  { id: 'phase1', label: 'Phase 1 (onboarding)' },
  { id: 'phase2', label: 'Phase 2 (usage depth)' },
  { id: 'content', label: 'Phase 3 (content/community)' }
];
const ALLOCATION_MODE_OPTIONS = [
  { id: 'weighted', label: 'Score weighted (100%)' },
  { id: 'hybrid', label: 'Hybrid (equal + weighted)' }
];

const shortWallet = (wallet = '') =>
  wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : '--';

export default function AdminAirdrop() {
  const [windowDays, setWindowDays] = useState(30);
  const [limit, setLimit] = useState(200);
  const [phase, setPhase] = useState('all');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [allocExporting, setAllocExporting] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [tokenPool, setTokenPool] = useState('1000000');
  const [recipientLimit, setRecipientLimit] = useState(200);
  const [minScore, setMinScore] = useState(1);
  const [allocationMode, setAllocationMode] = useState('weighted');
  const [hybridEqualPct, setHybridEqualPct] = useState(30);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchAdminAirdropLeaderboard(windowDays, limit, phase);
      setData(response);
    } catch (nextError) {
      setData(null);
      setError(nextError?.message || 'Unable to load admin leaderboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [windowDays, limit, phase]);

  const onExport = async () => {
    setExporting(true);
    setError('');
    try {
      await downloadAdminAirdropLeaderboard(windowDays, limit, phase);
    } catch (nextError) {
      setError(nextError?.message || 'Unable to export leaderboard CSV');
    } finally {
      setExporting(false);
    }
  };

  const topRow = useMemo(() => data?.leaderboard?.[0] || null, [data]);
  const parsedTokenPool = useMemo(() => Math.max(0, Number(tokenPool) || 0), [tokenPool]);

  const allocationRows = useMemo(() => {
    const sourceRows = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
    const filtered = sourceRows
      .filter((row) => Number(row.score || 0) >= minScore)
      .slice(0, Math.max(1, recipientLimit));
    const totalScore = filtered.reduce((sum, row) => sum + Number(row.score || 0), 0);
    if (!filtered.length || parsedTokenPool <= 0) {
      return [];
    }

    if (allocationMode === 'weighted' && totalScore <= 0) {
      return [];
    }

    const safeHybridEqualPct = Math.max(0, Math.min(100, Number(hybridEqualPct) || 0));
    const equalPool =
      allocationMode === 'hybrid' ? (parsedTokenPool * safeHybridEqualPct) / 100 : 0;
    const weightedPool = parsedTokenPool - equalPool;
    const equalPerRecipient = filtered.length ? equalPool / filtered.length : 0;

    return filtered.map((row) => {
      const weightedSharePct = totalScore > 0 ? (Number(row.score || 0) / totalScore) * 100 : 0;
      const weightedAllocation = (weightedPool * weightedSharePct) / 100;
      const allocation = equalPerRecipient + weightedAllocation;
      const sharePct = parsedTokenPool > 0 ? (allocation / parsedTokenPool) * 100 : 0;
      return {
        ...row,
        weightedSharePct,
        equalAllocation: equalPerRecipient,
        weightedAllocation,
        sharePct,
        allocation
      };
    });
  }, [
    data?.leaderboard,
    minScore,
    recipientLimit,
    parsedTokenPool,
    allocationMode,
    hybridEqualPct
  ]);

  const onExportAllocations = () => {
    if (!allocationRows.length) return;
    setAllocExporting(true);
    try {
      const rows = [
        [
          'mode',
          'equal_percent',
          'rank',
          'wallet_address',
          'score',
          'weighted_share_percent',
          'final_share_percent',
          'equal_allocation',
          'weighted_allocation',
          'allocation_tokens'
        ],
        ...allocationRows.map((row) => [
          allocationMode,
          allocationMode === 'hybrid' ? Number(hybridEqualPct || 0) : 0,
          row.rank,
          row.walletAddress,
          row.score,
          row.weightedSharePct.toFixed(6),
          row.sharePct.toFixed(6),
          row.equalAllocation.toFixed(6),
          row.weightedAllocation.toFixed(6),
          row.allocation.toFixed(6)
        ])
      ];
      const csv = rows
        .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `airdrop-allocation-${phase}-${windowDays}d.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setAllocExporting(false);
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Admin Airdrop Leaderboard</h1>
        <div className="page-subtitle">
          Private team dashboard. Scores are computed from testnet activity and feedback signals.
        </div>
      </div>

      <div className="inline-actions">
        <label className="form-field">
          Phase
          <select
            className="form-input"
            value={phase}
            onChange={(event) => setPhase(event.target.value)}
          >
            {PHASE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Window
          <select
            className="form-input"
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value))}
          >
            {DAY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value} days
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Limit
          <input
            className="form-input"
            type="number"
            min={1}
            max={1000}
            value={limit}
            onChange={(event) => setLimit(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))}
          />
        </label>
        <button className="button" type="button" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
        <button className="button ghost" type="button" onClick={onExport} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Eligible wallets</div>
          <div className="stat-value">
            {loading ? '...' : (data?.totalEligibleWallets ?? 0).toLocaleString()}
          </div>
          <div className="stat-delta">{data?.phaseLabel || 'In selected activity window'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Top score</div>
          <div className="stat-value">{loading ? '...' : topRow?.score ?? 0}</div>
          <div className="stat-delta">
            {topRow ? `Wallet ${shortWallet(topRow.walletAddress)}` : 'No ranked wallets yet'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Feedback linked</div>
          <div className="stat-value">
            {loading
              ? '...'
              : (data?.leaderboard || []).reduce((sum, row) => sum + Number(row.feedbackCount || 0), 0)}
          </div>
          <div className="stat-delta">Submissions tied to wallets</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Ranked wallets</h3>
            <div className="section-subtitle">Use as a working shortlist for testnet airdrop allocation.</div>
          </div>
        </div>
        <div className="data-table">
          <div className="table-row header">
            <div>Rank</div>
            <div>Wallet</div>
            <div>Score</div>
            <div>Events</div>
            <div>Unique Events</div>
            <div>High-Value</div>
            <div>Feedback</div>
            <div>Last seen</div>
          </div>
          {(data?.leaderboard || []).map((row) => (
            <div className="table-row" key={row.walletAddress}>
              <div>{row.rank}</div>
              <div title={row.walletAddress}>{shortWallet(row.walletAddress)}</div>
              <div>{row.score}</div>
              <div>{row.eventCount}</div>
              <div>{row.uniqueEvents}</div>
              <div>{row.highValueActions}</div>
              <div>{row.feedbackCount}</div>
              <div>{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '--'}</div>
            </div>
          ))}
          {!loading && !(data?.leaderboard || []).length && (
            <div className="table-row">
              <div>No data yet for this window.</div>
            </div>
          )}
        </div>
      </div>

      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Allocation Simulator</h3>
            <div className="section-subtitle">
              Build score-only or hybrid distributions for the selected phase/window.
            </div>
          </div>
        </div>
        <div className="inline-actions">
          <label className="form-field">
            Allocation mode
            <select
              className="form-input"
              value={allocationMode}
              onChange={(event) => setAllocationMode(event.target.value)}
            >
              {ALLOCATION_MODE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Token pool
            <input
              className="form-input"
              type="number"
              min={0}
              step="0.000001"
              value={tokenPool}
              onChange={(event) => setTokenPool(event.target.value)}
            />
          </label>
          {allocationMode === 'hybrid' && (
            <label className="form-field">
              Equal split %
              <input
                className="form-input"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={hybridEqualPct}
                onChange={(event) =>
                  setHybridEqualPct(Math.max(0, Math.min(100, Number(event.target.value) || 0)))
                }
              />
            </label>
          )}
          <label className="form-field">
            Max recipients
            <input
              className="form-input"
              type="number"
              min={1}
              max={1000}
              value={recipientLimit}
              onChange={(event) =>
                setRecipientLimit(Math.min(1000, Math.max(1, Number(event.target.value) || 1)))
              }
            />
          </label>
          <label className="form-field">
            Min score
            <input
              className="form-input"
              type="number"
              min={0}
              value={minScore}
              onChange={(event) => setMinScore(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
          <button
            className="button ghost"
            type="button"
            onClick={onExportAllocations}
            disabled={!allocationRows.length || allocExporting}
          >
            {allocExporting ? 'Exporting...' : 'Export Allocation CSV'}
          </button>
        </div>

        <div className="stat-row">
          <div className="stat-card">
            <div className="stat-label">Selected recipients</div>
            <div className="stat-value">{allocationRows.length}</div>
            <div className="stat-delta">After min score and max recipient filters</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Token pool</div>
            <div className="stat-value">{parsedTokenPool.toLocaleString()}</div>
            <div className="stat-delta">Input allocation amount</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Distributed</div>
            <div className="stat-value">
              {allocationRows.reduce((sum, row) => sum + row.allocation, 0).toLocaleString(
                undefined,
                {
                  maximumFractionDigits: 4
                }
              )}
            </div>
            <div className="stat-delta">
              {allocationMode === 'hybrid'
                ? `Hybrid model (${Number(hybridEqualPct || 0)}% equal)`
                : 'Score-proportional model'}
            </div>
          </div>
        </div>

        <div className="data-table">
          <div className="table-row header">
            <div>Rank</div>
            <div>Wallet</div>
            <div>Score</div>
            <div>Share %</div>
            <div>Allocation</div>
          </div>
          {allocationRows.map((row) => (
            <div className="table-row" key={`alloc-${row.walletAddress}`}>
              <div>{row.rank}</div>
              <div title={row.walletAddress}>{shortWallet(row.walletAddress)}</div>
              <div>{row.score}</div>
              <div>{row.sharePct.toFixed(4)}%</div>
              <div>{row.allocation.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
            </div>
          ))}
          {!loading && !allocationRows.length && (
            <div className="table-row">
              <div>No allocation rows for current filters.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
