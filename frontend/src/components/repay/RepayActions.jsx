import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import {
  getContractAddress,
  loanManagerAbi,
  usdcAbi
} from '../../utils/contracts.js';
import { toUnits } from '../../utils/format.js';
import TxStatusBanner from '../common/TxStatusBanner.jsx';
import { trackEvent } from '../../utils/analytics.js';

const USDC_DECIMALS = 6;

export default function RepayActions({ fundingStatus }) {
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

  const {
    data: approveHash,
    writeContract: writeApprove,
    isPending: isApprovePending,
    error: approveError
  } = useWriteContract();
  const {
    data: repayHash,
    writeContract: writeRepay,
    isPending: isRepayPending,
    error: repayError
  } = useWriteContract();

  const {
    isLoading: isApproveMining,
    isSuccess: approveConfirmed,
    error: approveReceiptError
  } = useWaitForTransactionReceipt({ hash: approveHash });
  const {
    isLoading: isRepayMining,
    isSuccess: repayConfirmed,
    error: repayReceiptError
  } = useWaitForTransactionReceipt({ hash: repayHash });

  const hasAllowance =
    allowance !== undefined && repayUnits !== null
      ? allowance >= repayUnits
      : false;
  const fundingReady = fundingStatus?.ready ?? true;

  const handleApprove = () => {
    setActionError('');
    if (!usdc || !repayUnits || !loanManager) return;
    writeApprove({
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
      writeRepay({
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

  const { error: repaySimError } = useSimulateContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'repayLoan',
    args: [BigInt(loanId || 0), repayUnits || 0n],
    account: address,
    query: {
      enabled: Boolean(loanManager && repayUnits && address)
    }
  });

  useEffect(() => {
    if (approveConfirmed) {
      trackEvent('repay_approve_confirmed', { chainId });
    }
  }, [approveConfirmed, chainId]);

  useEffect(() => {
    if (repayConfirmed) {
      trackEvent('repay_confirmed', { chainId });
    }
  }, [repayConfirmed, chainId]);

  return (
    <div className="holo-card" id="repay-actions">
      <div className="section-head">
        <div>
          <h3 className="section-title">Repay Live Loan</h3>
          <div className="section-subtitle">
            Approve USDC then submit a repayment.
          </div>
        </div>
        <span className="tag">USDC</span>
      </div>
      {(approveError ||
        repayError ||
        approveReceiptError ||
        repayReceiptError ||
        actionError) && (
        <div className="error-banner">
          {actionError ||
            repayReceiptError?.message ||
            approveReceiptError?.message ||
            repayError?.message ||
            approveError?.message}
        </div>
      )}
      {repaySimError && (
        <div className="muted">
          Simulation: {repaySimError.shortMessage || repaySimError.message}
        </div>
      )}
      <TxStatusBanner
        label="Approve Transaction"
        hash={approveHash}
        status={
          approveConfirmed
            ? 'Confirmed'
            : isApproveMining
              ? 'Confirming'
              : isApprovePending
                ? 'Pending'
                : ''
        }
      />
      <TxStatusBanner
        label="Repay Transaction"
        hash={repayHash}
        status={
          repayConfirmed
            ? 'Confirmed'
            : isRepayMining
              ? 'Confirming'
              : isRepayPending
                ? 'Pending'
                : ''
        }
      />
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
        <button
          className="button"
          onClick={handleApprove}
          disabled={isApprovePending || !fundingReady}
        >
          Approve
        </button>
        <button
          className="button"
          onClick={handleRepay}
          disabled={isRepayPending || !hasAllowance || !fundingReady}
        >
          Repay
        </button>
      </div>
    </div>
  );
}
