import { useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract
} from 'wagmi';
import {
  getContractAddress,
  loanManagerAbi,
  usdcAbi
} from '../../utils/contracts.js';
import { toUnits } from '../../utils/format.js';

const USDC_DECIMALS = 6;

export default function RepayActions() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');

  const [loanId, setLoanId] = useState('0');
  const [repayAmount, setRepayAmount] = useState('50');
  const [actionError, setActionError] = useState('');

  const repayUnits = useMemo(
    () => toUnits(repayAmount, USDC_DECIMALS),
    [repayAmount]
  );

  const { data: loan } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'loans',
    args: [BigInt(loanId || 0)],
    query: { enabled: Boolean(loanManager) }
  });

  const { data: allowance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'allowance',
    args: [address || '0x0000000000000000000000000000000000000000', loanManager],
    query: { enabled: Boolean(usdc && loanManager && address) }
  });

  const { writeContract, isPending, error } = useWriteContract();

  const hasAllowance =
    allowance !== undefined && repayUnits !== null
      ? allowance >= repayUnits
      : false;

  const handleApprove = () => {
    setActionError('');
    if (!usdc || !repayUnits || !loanManager) return;
    writeContract({
      address: usdc,
      abi: usdcAbi,
      functionName: 'approve',
      args: [loanManager, repayUnits]
    });
  };

  const handleRepay = async () => {
    setActionError('');
    if (!loanManager || !repayUnits || !publicClient || !address) return;
    try {
      const args = [BigInt(loanId || 0), repayUnits];
      const gasEstimate = await publicClient.estimateContractGas({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'repayLoan',
        args,
        account: address
      });
      const block = await publicClient.getBlock();
      const blockGasLimit =
        typeof block?.gasLimit === 'bigint' ? block.gasLimit - 1_000n : null;
      let gasLimit = gasEstimate + gasEstimate / 5n;
      if (blockGasLimit && gasLimit > blockGasLimit) {
        gasLimit = blockGasLimit;
      }
      writeContract({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'repayLoan',
        args,
        gas: gasLimit
      });
    } catch (err) {
      setActionError(err?.shortMessage || err?.message || 'Gas estimate failed.');
    }
  };

  return (
    <div className="holo-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Repay Live Loan</h3>
          <div className="section-subtitle">
            Approve USDC then submit a repayment.
          </div>
        </div>
        <span className="tag">USDC</span>
      </div>
      {(error || actionError) && (
        <div className="error-banner">
          {actionError || error?.message}
        </div>
      )}
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
        <label className="form-field">
          Repay Amount (USDC)
          <input
            className="form-input"
            value={repayAmount}
            onChange={(event) => setRepayAmount(event.target.value)}
            inputMode="decimal"
          />
        </label>
      </div>
      <div className="data-table">
        <div className="table-row header">
          <div>Allowance</div>
          <div>Needed</div>
          <div>Principal</div>
          <div>Interest</div>
        </div>
        <div className="table-row">
          <div>{allowance ? allowance.toString() : '--'}</div>
          <div>{repayUnits ? repayUnits.toString() : '--'}</div>
          <div>{loan ? loan[1].toString() : '--'}</div>
          <div>{loan ? loan[2].toString() : '--'}</div>
        </div>
      </div>
      <div className="inline-actions">
        <button className="button" onClick={handleApprove} disabled={isPending}>
          Approve
        </button>
        <button
          className="button"
          onClick={handleRepay}
          disabled={isPending || !hasAllowance}
        >
          Repay
        </button>
      </div>
    </div>
  );
}
