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
              <div>{lastLoan[0]}</div>
              <div>{lastLoan[1].toString()}</div>
              <div>{lastLoan[2].toString()}</div>
              <div>{formatDate(lastLoan[4])}</div>
            </div>
          </div>
        ) : (
          <div className="muted">No loans yet.</div>
        )}
      </div>
      <div className="holo-card">
        <div className="section-head">
          <div>
            <h3 className="section-title">Loan Inspector</h3>
            <div className="section-subtitle">Inspect a specific loan ID</div>
          </div>
          <button className="button ghost" type="button">
            Refresh
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
              <div>{selectedLoan[0]}</div>
              <div>{selectedLoan[1].toString()}</div>
              <div>{selectedLoan[2].toString()}</div>
              <div>
                <span className={`tag ${selectedLoan[5] ? 'success' : ''}`}>
                  {selectedLoan[5] ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
