import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchAdminRiskFlags,
  createAdminRiskFlag,
  deleteAdminRiskFlag,
  fetchAdminRiskCohort
} from '../utils/api.js';

const FLAG_TYPES = [
  { id: 'insider', label: 'Insider / founder' },
  { id: 'cohort_alert', label: 'Cohort alert' },
  { id: 'manual_review', label: 'Manual review' }
];

const shortAddr = (addr = '') => (addr ? `${addr.slice(0, 8)}...${addr.slice(-6)}` : '--');

export default function AdminRisk() {
  const [tab, setTab] = useState('flags');
  const [flags, setFlags] = useState([]);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [flagsError, setFlagsError] = useState('');
  const [filterWallet, setFilterWallet] = useState('');
  const [filterToken, setFilterToken] = useState('');
  const [addWallet, setAddWallet] = useState('');
  const [addToken, setAddToken] = useState('');
  const [addFlagType, setAddFlagType] = useState('insider');
  const [addSource, setAddSource] = useState('manual');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [cohortBy, setCohortBy] = useState('borrower');
  const [cohortLimit, setCohortLimit] = useState(100);
  const [cohortData, setCohortData] = useState(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [cohortError, setCohortError] = useState('');

  const loadFlags = useCallback(async () => {
    setFlagsLoading(true);
    setFlagsError('');
    try {
      const list = await fetchAdminRiskFlags(
        filterWallet.trim() || null,
        filterToken.trim() || null
      );
      setFlags(Array.isArray(list) ? list : []);
    } catch (e) {
      setFlags([]);
      setFlagsError(e?.message || 'Failed to load flags');
    } finally {
      setFlagsLoading(false);
    }
  }, [filterWallet, filterToken]);

  useEffect(() => {
    if (tab === 'flags') loadFlags();
  }, [tab, loadFlags]);

  const loadCohort = useCallback(async () => {
    setCohortLoading(true);
    setCohortError('');
    try {
      const out = await fetchAdminRiskCohort(cohortBy, cohortLimit);
      setCohortData(out);
    } catch (e) {
      setCohortData(null);
      setCohortError(e?.message || 'Failed to load cohort');
    } finally {
      setCohortLoading(false);
    }
  }, [cohortBy, cohortLimit]);

  useEffect(() => {
    if (tab === 'cohort') loadCohort();
  }, [tab, loadCohort]);

  const onAddFlag = async (e) => {
    e.preventDefault();
    const wallet = addWallet.trim().toLowerCase();
    if (!wallet) return;
    setAdding(true);
    setFlagsError('');
    try {
      await createAdminRiskFlag({
        walletAddress: wallet,
        tokenAddress: addToken.trim() || null,
        flagType: addFlagType,
        source: addSource || 'manual'
      });
      setAddWallet('');
      setAddToken('');
      loadFlags();
    } catch (e) {
      setFlagsError(e?.message || 'Failed to add flag');
    } finally {
      setAdding(false);
    }
  };

  const onDeleteFlag = async (id) => {
    setDeletingId(id);
    setFlagsError('');
    try {
      await deleteAdminRiskFlag(id);
      loadFlags();
    } catch (e) {
      setFlagsError(e?.message || 'Failed to delete flag');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="stack">
      <div className="page-header">
        <h1 className="page-title holo-glow">Admin Risk &amp; Flagging</h1>
        <div className="page-subtitle">
          Founder/insider flags and cohort view. Flagged wallet+token pairs get reduced LTV on quote.
          {' '}
          <Link to="/admin/airdrop">Airdrop leaderboard</Link>
        </div>
      </div>

      <div className="inline-actions">
        <button
          type="button"
          className={`button ${tab === 'flags' ? 'primary' : 'ghost'}`}
          onClick={() => setTab('flags')}
        >
          Flags
        </button>
        <button
          type="button"
          className={`button ${tab === 'cohort' ? 'primary' : 'ghost'}`}
          onClick={() => setTab('cohort')}
        >
          Cohort
        </button>
      </div>

      {tab === 'flags' && (
        <>
          <div className="holo-card">
            <div className="section-head">
              <h3 className="section-title">Add flag</h3>
              <div className="section-subtitle">
                Wallet is required. Token is optional (wallet-only flags apply to all tokens).
              </div>
            </div>
            <form onSubmit={onAddFlag} className="inline-actions">
              <label className="form-field">
                Wallet address
                <input
                  className="form-input"
                  type="text"
                  placeholder="0x..."
                  value={addWallet}
                  onChange={(e) => setAddWallet(e.target.value)}
                />
              </label>
              <label className="form-field">
                Token (optional)
                <input
                  className="form-input"
                  type="text"
                  placeholder="0x... or leave blank"
                  value={addToken}
                  onChange={(e) => setAddToken(e.target.value)}
                />
              </label>
              <label className="form-field">
                Type
                <select
                  className="form-input"
                  value={addFlagType}
                  onChange={(e) => setAddFlagType(e.target.value)}
                >
                  {FLAG_TYPES.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                Source
                <input
                  className="form-input"
                  type="text"
                  placeholder="manual"
                  value={addSource}
                  onChange={(e) => setAddSource(e.target.value)}
                />
              </label>
              <button type="submit" className="button" disabled={adding || !addWallet.trim()}>
                {adding ? 'Adding...' : 'Add flag'}
              </button>
            </form>
          </div>

          <div className="inline-actions">
            <label className="form-field">
              Filter wallet
              <input
                className="form-input"
                type="text"
                placeholder="Optional"
                value={filterWallet}
                onChange={(e) => setFilterWallet(e.target.value)}
              />
            </label>
            <label className="form-field">
              Filter token
              <input
                className="form-input"
                type="text"
                placeholder="Optional"
                value={filterToken}
                onChange={(e) => setFilterToken(e.target.value)}
              />
            </label>
            <button type="button" className="button ghost" onClick={loadFlags} disabled={flagsLoading}>
              {flagsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {flagsError && <div className="error-banner">{flagsError}</div>}

          <div className="holo-card">
            <div className="section-head">
              <h3 className="section-title">Risk flags</h3>
              <div className="section-subtitle">
                These flags cap LTV to INSIDER_LTV_BPS (default 15%) when this wallet requests a quote for the token.
              </div>
            </div>
            <div className="data-table">
              <div className="table-row header">
                <div>Wallet</div>
                <div>Token</div>
                <div>Type</div>
                <div>Source</div>
                <div>Created</div>
                <div />
              </div>
              {(flags || []).map((f) => (
                <div className="table-row" key={f.id}>
                  <div title={f.walletAddress}>{shortAddr(f.walletAddress)}</div>
                  <div title={f.tokenAddress || ''}>{f.tokenAddress ? shortAddr(f.tokenAddress) : '—'}</div>
                  <div>{f.flagType}</div>
                  <div>{f.source || 'manual'}</div>
                  <div>{f.createdAt ? new Date(f.createdAt).toLocaleString() : '—'}</div>
                  <div>
                    <button
                      type="button"
                      className="button ghost small"
                      disabled={deletingId === f.id}
                      onClick={() => onDeleteFlag(f.id)}
                    >
                      {deletingId === f.id ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
              {!flagsLoading && (!flags || !flags.length) && (
                <div className="table-row">
                  <div style={{ gridColumn: '1 / -1' }}>No flags match the filter.</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'cohort' && (
        <>
          <div className="inline-actions">
            <label className="form-field">
              Group by
              <select
                className="form-input"
                value={cohortBy}
                onChange={(e) => setCohortBy(e.target.value)}
              >
                <option value="borrower">Borrower (loan count per wallet)</option>
                <option value="token">Token (borrowers per token)</option>
              </select>
            </label>
            <label className="form-field">
              Limit
              <input
                className="form-input"
                type="number"
                min={1}
                max={500}
                value={cohortLimit}
                onChange={(e) => setCohortLimit(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
              />
            </label>
            <button type="button" className="button ghost" onClick={loadCohort} disabled={cohortLoading}>
              {cohortLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {cohortError && <div className="error-banner">{cohortError}</div>}

          <div className="holo-card">
            <div className="section-head">
              <h3 className="section-title">
                {cohortBy === 'token' ? 'Cohort by token' : 'Cohort by borrower'}
              </h3>
              <div className="section-subtitle">
                {cohortBy === 'token'
                  ? 'Tokens with multiple borrowers (from indexer LoanCreated events with token).'
                  : 'Wallets with multiple loans (from indexer LoanCreated events).'}
              </div>
            </div>
            {cohortBy === 'token' ? (
              <div className="stack">
                {(cohortData?.byToken || []).map((row) => (
                  <div key={row.token} className="holo-card nested">
                    <div className="section-head">
                      <span className="section-title" title={row.token}>
                        Token {shortAddr(row.token)}
                      </span>
                      <span className="section-subtitle">
                        {row.borrowers?.length || 0} borrower(s),{' '}
                        {row.borrowers?.reduce((s, b) => s + (b.loanCount || 0), 0) || 0} loan(s)
                      </span>
                    </div>
                    <div className="data-table">
                      <div className="table-row header">
                        <div>Wallet</div>
                        <div>Loans</div>
                      </div>
                      {(row.borrowers || []).map((b) => (
                        <div className="table-row" key={b.wallet}>
                          <div title={b.wallet}>{shortAddr(b.wallet)}</div>
                          <div>{b.loanCount}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {!cohortLoading && (!cohortData?.byToken || !cohortData.byToken.length) && (
                  <div className="table-row">
                    <div>No token cohort data (indexer may not have token_address yet).</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="data-table">
                <div className="table-row header">
                  <div>Wallet</div>
                  <div>Loan count</div>
                </div>
                {(cohortData?.borrowers || []).map((b) => (
                  <div className="table-row" key={b.wallet}>
                    <div title={b.wallet}>{shortAddr(b.wallet)}</div>
                    <div>{b.loanCount}</div>
                  </div>
                ))}
                {!cohortLoading && (!cohortData?.borrowers || !cohortData.borrowers.length) && (
                  <div className="table-row">
                    <div>No borrower cohort data yet.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
