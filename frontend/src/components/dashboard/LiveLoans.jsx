import { useMemo, useState } from 'react';
import { useChainId, useReadContract } from 'wagmi';
import { getContractAddress, loanManagerAbi } from '../../utils/contracts.js';

function formatDate(timestamp) {
  if (!timestamp) return '--';
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString();
}

export default function LiveLoans() {
  const chainId = useChainId();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const [loanId, setLoanId] = useState('0');

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

  const { data: lastLoan } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loans',
    args: lastLoanId ? [lastLoanId] : undefined,
    query: { enabled: Boolean(loanManager && lastLoanId !== null) }
  });

  const { data: selectedLoan } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loans',
    args: [BigInt(loanId || 0)],
    query: { enabled: Boolean(loanManager) }
  });

  return (
    <div className="grid-2">
      <div className="holo-card">
        <h3 className="holo-title">Latest Loan</h3>
        <div className="muted">Live contract read.</div>
        {lastLoan ? (
          <div className="stack">
            <div className="pill">Borrower: {lastLoan[0]}</div>
            <div className="pill">Principal: {lastLoan[1].toString()}</div>
            <div className="pill">Interest: {lastLoan[2].toString()}</div>
            <div className="pill">Unlock: {formatDate(lastLoan[4])}</div>
          </div>
        ) : (
          <div className="muted">No loans yet.</div>
        )}
      </div>
      <div className="holo-card">
        <h3 className="holo-title">Loan Inspector</h3>
        <div className="muted">Inspect a specific loan ID.</div>
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
          <div className="stack">
            <div className="pill">Borrower: {selectedLoan[0]}</div>
            <div className="pill">Principal: {selectedLoan[1].toString()}</div>
            <div className="pill">Interest: {selectedLoan[2].toString()}</div>
            <div className="pill">Active: {selectedLoan[5] ? 'Yes' : 'No'}</div>
          </div>
        )}
      </div>
    </div>
  );
}
