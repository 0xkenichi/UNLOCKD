// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useChainId, useReadContract } from 'wagmi';
import { getContractAddress, loanManagerAbi } from '../../utils/contracts.js';
import ZKShield from '../common/ZKShield.jsx';

function formatDate(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString();
}

export default function LiveLoans() {
  const chainId = useChainId();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const [loanId, setLoanId] = useState('0');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const cardProps = {
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
    whileHover: shouldReduceMotion ? undefined : { y: -4, scale: 1.01 },
    whileTap: shouldReduceMotion ? undefined : { scale: 0.995 }
  };

  const { data: loanCount } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loanCount',
    query: { enabled: Boolean(loanManager) }
  });

  const lastLoanId = useMemo(() => {
    if (!loanCount || loanCount === 0n) return null;
    return loanCount - 1n;
  }, [loanCount]);

  const { data: lastLoan, refetch: refetchLastLoan } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loans',
    args: lastLoanId ? [lastLoanId] : undefined,
    query: { enabled: Boolean(loanManager && lastLoanId !== null) }
  });

  const { data: selectedLoan, refetch: refetchSelectedLoan } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loans',
    args: [BigInt(loanId || 0)],
    query: { enabled: Boolean(loanManager) }
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchLastLoan(), refetchSelectedLoan()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="grid-2">
      <motion.div className="holo-card" {...cardProps}>
        <div className="section-head">
          <div>
            <h3 className="section-title">Latest Loan</h3>
            <div className="section-subtitle">Live contract read</div>
          </div>
          <span className="tag">On-chain</span>
        </div>
        {lastLoan ? (
          <div className="data-table">
            <div className="table-row header">
              <div>Borrower</div>
              <div>Principal</div>
              <div>Interest</div>
              <div>Unlock</div>
            </div>
            <div className="table-row">
              <div><ZKShield label="Borrower Address">{lastLoan[0]}</ZKShield></div>
              <div><ZKShield label="Principal Amount">{lastLoan[1].toString()}</ZKShield></div>
              <div><ZKShield label="Interest Accumulated">{lastLoan[2].toString()}</ZKShield></div>
              <div>{formatDate(lastLoan[4])}</div>
            </div>
          </div>
        ) : (
          <div className="muted">No loans yet.</div>
        )}
      </motion.div>
      <motion.div className="holo-card" {...cardProps}>
        <div className="section-head">
          <div>
            <h3 className="section-title">Loan Inspector</h3>
            <div className="section-subtitle">Inspect a specific loan ID</div>
          </div>
            <button
              className="button ghost"
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="form-grid">
          <label className="form-field">
            Loan ID
            <input
              className="form-input"
              value={loanId}
              onChange={(event) => setLoanId(event.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>
        {selectedLoan && (
          <div className="data-table">
            <div className="table-row header">
              <div>Borrower</div>
              <div>Principal</div>
              <div>Interest</div>
              <div>Status</div>
            </div>
            <div className="table-row">
              <div><ZKShield label="Borrower Address">{selectedLoan[0]}</ZKShield></div>
              <div><ZKShield label="Principal Amount">{selectedLoan[1].toString()}</ZKShield></div>
              <div><ZKShield label="Interest Accumulated">{selectedLoan[2].toString()}</ZKShield></div>
              <div>
                <span className={`tag ${selectedLoan[5] ? 'success' : ''}`}>
                  {selectedLoan[5] ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
