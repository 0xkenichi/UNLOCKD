import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useChainId } from 'wagmi';
import {
  spotlightContracts,
  upcomingVestings
} from '../../data/spotlightContracts.js';
import { fetchVestedContracts, fetchVestedSnapshots } from '../../utils/api.js';

const NICHES = ['All', 'DeSci', 'DePIN', 'AI', 'AGI', 'DeSoc', 'DeFi'];
const GECKO_TERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
const GECKO_NETWORKS = {
  1: 'eth',
  8453: 'base'
};

function formatDate(value) {
  if (!value || value === 'TBD') return value || '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString();
}

function formatScore(score) {
  if (score === null || score === undefined) return '--';
  return `${score}/100`;
}

function formatUsd(value) {
  if (!value && value !== 0) return '--';
  return `$${Number(value).toLocaleString()}`;
}

function riskTag(risk) {
  if (!risk) return 'tag';
  if (risk.toLowerCase() === 'low') return 'tag success';
  if (risk.toLowerCase() === 'high') return 'tag danger';
  return 'tag';
}

function isLink(value) {
  return typeof value === 'string' && value.toLowerCase().startsWith('http');
}

function isVerified(item) {
  return (
    isLink(item.evidence?.escrowTx) &&
    isLink(item.evidence?.wallet) &&
    isLink(item.evidence?.tokenomics)
  );
}

function computeEligibilityScore(item) {
  const toNumber = (value) => {
    if (value === null || value === undefined) return 0;
    const numeric = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(numeric) ? numeric : 0;
  };
  const liquidityUsd = toNumber(
    item.metrics?.liquidityUsd ?? item.metrics?.pvUsd ?? item.metrics?.pv
  );
  const vestingSizeUsd = toNumber(
    item.metrics?.vestingSizeUsd ?? item.metrics?.pvUsd ?? item.metrics?.pv
  );
  const daysToUnlock = toNumber(item.metrics?.daysToUnlock ?? 0);
  const historicalUnlocks = toNumber(item.metrics?.historicalUnlocks ?? 0);
  const evidenceCount = Object.values(item.evidence || {}).filter(
    (value) => value && value.toLowerCase().startsWith('http')
  ).length;

  const liquidityScore = Math.min(40, (liquidityUsd / 20000000) * 40);
  const vestingPenalty = Math.min(20, (vestingSizeUsd / 15000000) * 20);
  const unlockPenalty = daysToUnlock <= 30 ? 18 : daysToUnlock <= 90 ? 8 : 0;
  const historyBonus = Math.min(10, historicalUnlocks * 2);
  const transparencyBonus = Math.min(12, evidenceCount * 4);

  const rawScore = 60 + liquidityScore - vestingPenalty - unlockPenalty + historyBonus + transparencyBonus;
  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function renderEvidence(value) {
  if (!value) return '--';
  return isLink(value) ? (
    <a className="button ghost" href={value} target="_blank" rel="noreferrer">
      View
    </a>
  ) : (
    value
  );
}

async function fetchLiquidityForToken(network, tokenAddress) {
  try {
    const url = `${GECKO_TERMINAL_BASE}/networks/${network}/tokens/${tokenAddress}`;
    const response = await fetch(url);
    const data = await response.json();
    const attributes = data?.data?.attributes || {};
    const liquidityUsd =
      Number(attributes.liquidity_usd) ||
      Number(attributes.liquidity?.usd) ||
      0;
    const volumeUsd =
      Number(attributes.volume_usd?.h24) ||
      Number(attributes.volume_usd?.h24_usd) ||
      Number(attributes.volume_usd) ||
      0;
    if (!liquidityUsd && !volumeUsd) {
      return null;
    }
    return { liquidityUsd, volumeUsd };
  } catch {
    return null;
  }
}

export default function SpotlightVestedContracts() {
  const chainId = useChainId();
  const [activeNiche, setActiveNiche] = useState('All');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [onChainContracts, setOnChainContracts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [liquidityByToken, setLiquidityByToken] = useState({});
  const [snapshotHistory, setSnapshotHistory] = useState([]);
  const shouldReduceMotion = useReducedMotion();

  const cardProps = {
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
    whileHover: shouldReduceMotion ? undefined : { y: -4, scale: 1.01 },
    whileTap: shouldReduceMotion ? undefined : { scale: 0.995 }
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    fetchVestedContracts()
      .then((data) => {
        if (isMounted) {
          setOnChainContracts(data);
        }
      })
      .catch(() => {
        if (isMounted) {
          setOnChainContracts([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadSnapshots = async () => {
      try {
        const snapshots = await fetchVestedSnapshots();
        if (isMounted) {
          setSnapshotHistory(snapshots);
        }
      } catch {
        if (isMounted) {
          setSnapshotHistory([]);
        }
      }
    };
    loadSnapshots();
    const interval = setInterval(loadSnapshots, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const enrichedContracts = useMemo(() => {
    if (!onChainContracts.length) {
      return spotlightContracts;
    }
    return spotlightContracts.map((item) => {
      const tokenMatch = onChainContracts.find((contract) => {
        if (item.tokenAddress && contract.token) {
          return contract.token.toLowerCase() === item.tokenAddress.toLowerCase();
        }
        if (contract.tokenSymbol) {
          return contract.tokenSymbol.toLowerCase() === item.token.toLowerCase();
        }
        return false;
      });

      if (!tokenMatch) {
        return item;
      }

      const resolvedToken = item.tokenAddress || tokenMatch.token;
      const liquidityData = resolvedToken ? liquidityByToken[resolvedToken] : null;
      const metrics = {
        ...item.metrics,
        vestingSizeUsd: Number(tokenMatch.pv || 0),
        liquidityUsd:
          liquidityData?.liquidityUsd ?? item.metrics?.liquidityUsd ?? Number(tokenMatch.pv || 0),
        volumeUsd: liquidityData?.volumeUsd ?? item.metrics?.volumeUsd ?? 0,
        daysToUnlock: tokenMatch.daysToUnlock ?? item.metrics?.daysToUnlock ?? 0,
        pv: tokenMatch.pv,
        ltvBps: tokenMatch.ltvBps
      };

      return {
        ...item,
        tokenAddress: resolvedToken,
        stage: tokenMatch.active ? 'Live vesting' : 'Inactive',
        vestingDate: tokenMatch.unlockTime
          ? new Date(tokenMatch.unlockTime * 1000).toISOString()
          : item.vestingDate,
        metrics,
        evidence: {
          escrowTx: tokenMatch.evidence?.escrowTx || item.evidence?.escrowTx,
          wallet: tokenMatch.evidence?.wallet || item.evidence?.wallet,
          tokenomics: item.evidence?.tokenomics,
          token: tokenMatch.evidence?.token || item.evidence?.token
        }
      };
    });
  }, [onChainContracts, liquidityByToken]);

  useEffect(() => {
    const network = GECKO_NETWORKS[chainId];
    if (!network) return;
    const tokens = new Set(
      enrichedContracts
        .map((item) => item.tokenAddress)
        .filter((value) => value && !liquidityByToken[value])
    );
    if (!tokens.size) return;

    let isMounted = true;
    Promise.all(
      Array.from(tokens).map(async (token) => ({
        token,
        data: await fetchLiquidityForToken(network, token)
      }))
    ).then((results) => {
      if (!isMounted) return;
      setLiquidityByToken((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          if (result.data) {
            next[result.token] = result.data;
          }
        });
        return next;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [chainId, enrichedContracts, liquidityByToken]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return enrichedContracts.filter((item) => {
      if (activeNiche !== 'All' && item.niche !== activeNiche) return false;
      if (!normalizedQuery) return true;
      return [item.project, item.token, item.niche]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [activeNiche, query, enrichedContracts]);

  const upcomingOnChain = useMemo(() => {
    if (!onChainContracts.length) return [];
    return onChainContracts
      .filter((contract) => contract.unlockTime && contract.active)
      .sort((a, b) => Number(a.unlockTime) - Number(b.unlockTime))
      .slice(0, 6)
      .map((contract) => ({
        id: `onchain-${contract.loanId}`,
        project: contract.tokenSymbol || `Loan ${contract.loanId}`,
        token: contract.tokenSymbol || contract.token?.slice(0, 6),
        type: 'Vesting unlock',
        expectedDate: new Date(contract.unlockTime * 1000).toISOString(),
        notes: `Loan ${contract.loanId} • ${contract.quantity} tokens`
      }));
  }, [onChainContracts]);

  const upcomingCombined = useMemo(
    () => [...upcomingOnChain, ...upcomingVestings],
    [upcomingOnChain]
  );

  return (
    <div className="stack brand-spotlight-wrap">
      <div className="grid-2">
        <motion.div className="holo-card brand-spotlight" {...cardProps}>
        <div className="section-head">
          <div>
              <div className="brand-title-row">
                <span className="brand-crest" aria-hidden="true" />
                <h3 className="section-title">Spotlight Vested Contracts</h3>
              </div>
            <div className="section-subtitle">
              High-eligibility candidates backed by transparent data
            </div>
          </div>
          <div className="stack-row">
            <span className="tag brand-tag">Curated</span>
            <span className="tag brand-tag subtle">Data-backed</span>
          </div>
        </div>
        {isLoading && <div className="muted">Loading on-chain data…</div>}
        <div className="stack-row">
          <label className="form-field">
            <input
              className="form-input"
              placeholder="Search project or token"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="stack-row">
            {NICHES.map((niche) => (
              <button
                key={niche}
                className={`pill ${activeNiche === niche ? 'active' : ''}`}
                type="button"
                onClick={() => setActiveNiche(niche)}
              >
                {niche}
              </button>
            ))}
          </div>
        </div>
        <div className="stack">
          {filtered.length ? (
            filtered.map((item, index) => (
              <motion.div
                key={item.id}
                className="holo-card brand-spotlight-card"
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.26, delay: shouldReduceMotion ? 0 : index * 0.025 }}
                whileHover={shouldReduceMotion ? undefined : { y: -3, scale: 1.005 }}
              >
                {isVerified(item) && (
                  <div className="brand-stamp">
                    <span className="brand-stamp-mark" />
                    Verified by Unlockd
                  </div>
                )}
                <div className="section-head">
                  <div>
                    <div className="brand-project-row">
                      <span className="brand-token-pill">{item.niche}</span>
                      <h4 className="holo-title">{item.project}</h4>
                    </div>
                    <div className="muted">
                      {item.niche} • {item.token} • {item.stage}
                    </div>
                  </div>
                  <div className="stack">
                    <div className="pill brand-pill">
                      Eligibility {formatScore(computeEligibilityScore(item))}
                    </div>
                    <span className={riskTag(item.riskRating)}>{item.riskRating} risk</span>
                    {isVerified(item) && <span className="tag success brand-verified">Verified</span>}
                  </div>
                </div>
                <div className="grid-2">
                  <div className="stack">
                    <div className="muted">Rationale</div>
                    <div>{item.rationale}</div>
                    <div className="muted">Next vesting</div>
                    <div>{formatDate(item.vestingDate)}</div>
                  </div>
                  <div className="stack">
                    <div className="muted">Tokenomics</div>
                    <div>Supply: {item.tokenomics.supply}</div>
                    <div>Float: {item.tokenomics.float}</div>
                    <div>FDV: {item.tokenomics.fdv}</div>
                  </div>
                </div>
                <div className="grid-2">
                  <div className="stack">
                    <div className="muted">Evidence</div>
                    <div>Escrow Tx: {renderEvidence(item.evidence.escrowTx)}</div>
                    <div>Wallet: {renderEvidence(item.evidence.wallet)}</div>
                    <div>Token: {renderEvidence(item.evidence.token)}</div>
                  </div>
                  <div className="stack">
                    <div className="muted">Transparency</div>
                    <div>Tokenomics: {renderEvidence(item.evidence.tokenomics)}</div>
                    <div className="muted">Risk assessment reflects liquidity and unlock profile.</div>
                  </div>
                </div>
                <div className="stack-row brand-actions">
                  <button
                    className="button ghost brand-ghost"
                    type="button"
                    onClick={() =>
                      setExpandedId((prev) => (prev === item.id ? null : item.id))
                    }
                  >
                    {expandedId === item.id ? 'Hide risk breakdown' : 'View risk breakdown'}
                  </button>
                </div>
                {expandedId === item.id && (
                  <div className="data-table brand-table">
                    <div className="table-row header">
                      <div>Metric</div>
                      <div>Value</div>
                      <div>Impact</div>
                    </div>
                    <div className="table-row">
                      <div>Liquidity</div>
                      <div>{formatUsd(item.metrics?.liquidityUsd)}</div>
                      <div>Higher liquidity improves eligibility.</div>
                    </div>
                    <div className="table-row">
                      <div>24h Volume</div>
                      <div>{formatUsd(item.metrics?.volumeUsd)}</div>
                      <div>Higher volume reduces liquidation risk.</div>
                    </div>
                    <div className="table-row">
                      <div>Vesting Size</div>
                      <div>{formatUsd(item.metrics?.vestingSizeUsd)}</div>
                      <div>Larger unlocks require stricter risk buffers.</div>
                    </div>
                    <div className="table-row">
                      <div>Days to Unlock</div>
                      <div>{item.metrics?.daysToUnlock ?? '--'}</div>
                      <div>Near-term unlocks raise volatility risk.</div>
                    </div>
                    <div className="table-row">
                      <div>Unlock History</div>
                      <div>{item.metrics?.historicalUnlocks ?? '--'}</div>
                      <div>More history improves confidence.</div>
                    </div>
                    <div className="table-row">
                      <div>Evidence Links</div>
                      <div>
                        {Object.values(item.evidence || {}).filter(
                          (value) => value && value.toLowerCase().startsWith('http')
                        ).length || 0}
                      </div>
                      <div>Verified links increase transparency score.</div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          ) : (
            <div className="muted">No spotlight contracts found for this niche.</div>
          )}
        </div>
      </motion.div>
        <motion.div className="holo-card brand-spotlight" {...cardProps}>
        <div className="section-head">
          <div>
              <div className="brand-title-row">
                <span className="brand-crest brand-crest-alt" aria-hidden="true" />
                <h3 className="section-title">Upcoming Vestings & Pre-TGE</h3>
              </div>
            <div className="section-subtitle">
              Track upcoming unlocks and pre-TGE contract reviews
            </div>
          </div>
          <span className="tag brand-tag">Tracking</span>
        </div>
        <div className="data-table brand-table">
          <div className="table-row header">
            <div>Project</div>
            <div>Token</div>
            <div>Type</div>
            <div>Expected</div>
            <div>Notes</div>
          </div>
          {upcomingCombined.map((event, index) => (
            <motion.div
              key={event.id}
              className="table-row"
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: shouldReduceMotion ? 0 : index * 0.02 }}
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
            >
              <div>{event.project}</div>
              <div>{event.token}</div>
              <div>{event.type}</div>
              <div>{formatDate(event.expectedDate)}</div>
              <div>{event.notes}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>
      </div>
      <motion.div className="holo-card brand-spotlight" {...cardProps}>
        <div className="section-head">
          <div>
            <div className="brand-title-row">
              <span className="brand-crest brand-crest-alt" aria-hidden="true" />
              <h3 className="section-title">Snapshot History</h3>
            </div>
            <div className="section-subtitle">
              Persisted snapshots for transparency and trend tracking
            </div>
          </div>
          <span className="tag brand-tag">History</span>
        </div>
        {snapshotHistory.length ? (
          <div className="data-table brand-table">
            <div className="table-row header">
              <div>Captured</div>
              <div>Total</div>
              <div>Active</div>
              <div>Avg LTV</div>
              <div>Avg PV</div>
            </div>
            {snapshotHistory.map((snapshot, index) => (
              <motion.div
                key={snapshot.timestamp}
                className="table-row"
                initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: shouldReduceMotion ? 0 : index * 0.02 }}
                whileHover={shouldReduceMotion ? undefined : { y: -2 }}
              >
                <div>{formatDateTime(snapshot.timestamp)}</div>
                <div>{snapshot.summary?.total ?? '--'}</div>
                <div>{snapshot.summary?.active ?? '--'}</div>
                <div>
                  {snapshot.summary?.avgLtvBps
                    ? `${(snapshot.summary.avgLtvBps / 100).toFixed(2)}%`
                    : '--'}
                </div>
                <div>{formatUsd(snapshot.summary?.avgPv)}</div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="muted">No snapshots yet.</div>
        )}
      </motion.div>
    </div>
  );
}
