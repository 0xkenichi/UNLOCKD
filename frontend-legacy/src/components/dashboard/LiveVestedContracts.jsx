// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWatchContractEvent
} from 'wagmi';
import {
  getContractAddress,
  loanManagerAbi,
  vestingAdapterAbi
} from '../../utils/contracts.js';

const MAX_ITEMS = 8;

function formatDate(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString();
}

function formatAddress(address) {
  if (!address) return '--';
  return address;
}

function mergeItems(incoming, existing) {
  const merged = new Map();

  [...existing, ...incoming].forEach((item) => {
    if (!item) return;
    merged.set(item.loanId, { ...merged.get(item.loanId), ...item });
  });

  return Array.from(merged.values()).slice(0, MAX_ITEMS);
}

export default function LiveVestedContracts() {
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const loanManager = getContractAddress(chainId, 'loanManager');
  const vestingAdapter = getContractAddress(chainId, 'vestingAdapter');
  const [items, setItems] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState('unlock-asc');
  const shouldReduceMotion = useReducedMotion();

  const cardProps = {
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
    whileHover: shouldReduceMotion ? undefined : { y: -4, scale: 1.01 },
    whileTap: shouldReduceMotion ? undefined : { scale: 0.995 }
  };

  const { data: loanCount } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loanCount',
    query: { enabled: Boolean(loanManager) }
  });

  const recentIds = useMemo(() => {
    if (!loanCount || loanCount === 0n) return [];
    const count = Number(loanCount);
    const start = Math.max(count - MAX_ITEMS, 0);
    return Array.from({ length: count - start }, (_, idx) => BigInt(start + idx)).reverse();
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

  const collateralIds = useMemo(() => {
    if (!loanReads) return [];
    return loanReads.map((read) => {
      if (read.status !== 'success' || !read.result) return null;
      return read.result[3];
    });
  }, [loanReads]);

  const { data: vestingReads } = useReadContracts({
    contracts: collateralIds
      .map((id) =>
        id === null
          ? null
          : {
              address: vestingAdapter,
              abi: vestingAdapterAbi,
              functionName: 'getDetails',
              args: [id]
            }
      )
      .filter(Boolean),
    query: { enabled: Boolean(vestingAdapter && collateralIds.length) }
  });

  const initialItems = useMemo(() => {
    if (!loanReads || !vestingReads) return [];
    return loanReads
      .map((loanRead, index) => {
        if (loanRead.status !== 'success' || !loanRead.result) return null;
        const loan = loanRead.result;
        const vestingRead = vestingReads[index];
        if (!vestingRead || vestingRead.status !== 'success') return null;
        const [quantity, token, unlockTime] = vestingRead.result;
        return {
          loanId: recentIds[index]?.toString() || `${index}`,
          borrower: loan[0],
          principal: loan[1],
          interest: loan[2],
          collateralId: loan[3],
          unlockTime: unlockTime || loan[4],
          active: loan[5],
          quantity,
          token
        };
      })
      .filter(Boolean);
  }, [loanReads, vestingReads, recentIds]);

  useEffect(() => {
    if (!initialItems.length) return;
    setItems((prev) => mergeItems(initialItems, prev));
  }, [initialItems]);

  useWatchContractEvent({
    address: loanManager,
    abi: loanManagerAbi,
    eventName: 'LoanCreated',
    enabled: Boolean(loanManager && vestingAdapter && publicClient),
    onLogs: async (logs) => {
      if (!publicClient || !vestingAdapter) return;
      const incoming = await Promise.all(
        logs.map(async (log) => {
          const loanId = log.args?.loanId;
          if (loanId === undefined) return null;
          const loan = await publicClient.readContract({
            address: loanManager,
            abi: loanManagerAbi,
            functionName: 'loans',
            args: [loanId]
          });
          const vesting = await publicClient.readContract({
            address: vestingAdapter,
            abi: vestingAdapterAbi,
            functionName: 'getDetails',
            args: [loan[3]]
          });
          return {
            loanId: loanId.toString(),
            borrower: loan[0],
            principal: loan[1],
            interest: loan[2],
            collateralId: loan[3],
            unlockTime: vesting[2] || loan[4],
            active: loan[5],
            quantity: vesting[0],
            token: vesting[1]
          };
        })
      );
      setItems((prev) => mergeItems(incoming.filter(Boolean), prev));
    }
  });

  useWatchContractEvent({
    address: loanManager,
    abi: loanManagerAbi,
    eventName: 'LoanRepaid',
    enabled: Boolean(loanManager),
    onLogs: (logs) => {
      setItems((prev) =>
        mergeItems(
          logs
            .map((log) => log.args?.loanId)
            .filter((loanId) => loanId !== undefined)
            .map((loanId) => ({
              loanId: loanId.toString(),
              active: false
            })),
          prev
        )
      );
    }
  });

  useWatchContractEvent({
    address: loanManager,
    abi: loanManagerAbi,
    eventName: 'LoanSettled',
    enabled: Boolean(loanManager),
    onLogs: (logs) => {
      setItems((prev) =>
        mergeItems(
          logs
            .map((log) => log.args?.loanId)
            .filter((loanId) => loanId !== undefined)
            .map((loanId) => ({
              loanId: loanId.toString(),
              active: false
            })),
          prev
        )
      );
    }
  });

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (!showInactive && !item.active) return false;
      if (!normalizedQuery) return true;
      return [
        item.loanId,
        item.borrower,
        item.token,
        item.collateralId?.toString?.()
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery));
    });

    return filtered.sort((left, right) => {
      if (sortMode === 'newest') {
        return Number(right.loanId) - Number(left.loanId);
      }
      if (sortMode === 'oldest') {
        return Number(left.loanId) - Number(right.loanId);
      }
      if (sortMode === 'unlock-desc') {
        return Number(right.unlockTime || 0) - Number(left.unlockTime || 0);
      }
      return Number(left.unlockTime || 0) - Number(right.unlockTime || 0);
    });
  }, [items, showInactive, query, sortMode]);

  return (
    <motion.div className="holo-card" {...cardProps}>
      <div className="section-head">
        <div>
          <h3 className="section-title">Live Vested Contracts</h3>
          <div className="section-subtitle">Auto-updating list of on-chain vesting</div>
        </div>
        <div className="stack-row">
          <label className="form-field">
            <input
              className="form-input"
              placeholder="Search by loan, borrower, token"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="form-field">
            <select
              className="form-input"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value)}
            >
              <option value="unlock-asc">Unlock date (soonest)</option>
              <option value="unlock-desc">Unlock date (latest)</option>
              <option value="newest">Newest loans</option>
              <option value="oldest">Oldest loans</option>
            </select>
          </label>
          <button
            className="button ghost"
            type="button"
            onClick={() => setShowInactive((prev) => !prev)}
          >
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </button>
          <span className="tag">Real-time</span>
        </div>
      </div>
      {visibleItems.length ? (
        <div className="data-table">
          <div className="table-row header">
            <div>Loan ID</div>
            <div>Borrower</div>
            <div>Vesting Token</div>
            <div>Quantity</div>
            <div>Unlock</div>
            <div>Status</div>
          </div>
          {visibleItems.map((item, index) => (
            <motion.div
              key={item.loanId}
              className="table-row"
              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: shouldReduceMotion ? 0 : index * 0.02 }}
              whileHover={shouldReduceMotion ? undefined : { y: -2 }}
            >
              <div>{item.loanId}</div>
              <div>{formatAddress(item.borrower)}</div>
              <div>{formatAddress(item.token)}</div>
              <div>{item.quantity?.toString?.() || '--'}</div>
              <div>{formatDate(item.unlockTime)}</div>
              <div>
                <span className={`tag ${item.active ? 'success' : ''}`}>
                  {item.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="muted">
          {showInactive ? 'No vested contracts yet.' : 'No active vested contracts yet.'}
        </div>
      )}
    </motion.div>
  );
}
