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
import { formatUnits } from 'viem';
import {
  getContractAddress,
  loanManagerAbi,
  usdcAbi
} from '../../utils/contracts.js';
import { toUnits } from '../../utils/format.js';
import TxStatusBanner from '../common/TxStatusBanner.jsx';
import { trackEvent } from '../../utils/analytics.js';

const USDC_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const formatUsdc = (value) => {
  if (value === null || value === undefined) return '--';
  const asNumber = Number(formatUnits(BigInt(value), USDC_DECIMALS));
  if (!Number.isFinite(asNumber)) return '--';
  return asNumber.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
};

const normalizeTxError = (error) => {
  const message = String(error?.shortMessage || error?.message || '');
  if (!message) return '';
  if (message.includes('inactive')) return 'Loan is inactive (or does not exist on this network).';
  if (message.includes('not borrower')) return 'Only the borrower wallet can repay this loan.';
  if (message.includes('amount=0')) return 'Repay amount must be greater than 0.';
  if (message.includes('transfer failed')) return 'USDC transfer failed. Check balance and allowance.';
  if (message.includes('0xfb8f41b2')) return 'Repay simulation failed. Check loan status and borrower wallet.';
  return message;
};

export default function RepayActions({ fundingStatus, initialLoanId = '' }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');

  const [loanId, setLoanId] = useState('0');
  const [repayAmount, setRepayAmount] = useState('50');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!initialLoanId) return;
    if (!/^\d+$/.test(initialLoanId)) return;
    setLoanId(initialLoanId);
  }, [initialLoanId]);

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
  const { data: usdcBalance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [address || ZERO_ADDRESS],
    query: { enabled: Boolean(usdc && address) }
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
  const loanBorrower = loan?.[0] || ZERO_ADDRESS;
  const principal = loan?.[1] ?? 0n;
  const interest = loan?.[2] ?? 0n;
  const totalDue = principal + interest;
  const active = Boolean(loan?.[6]);
  const hasWallet = Boolean(address);
  const isBorrower =
    hasWallet && loanBorrower !== ZERO_ADDRESS
      ? loanBorrower.toLowerCase() === address.toLowerCase()
      : false;
  const overpaying = Boolean(repayUnits && totalDue > 0n && repayUnits > totalDue);
  const repayDisabledReason = (() => {
    if (!hasWallet) return 'Connect the borrower wallet to repay.';
    if (!loanManager) return 'Unsupported network for repayments.';
    if (!fundingReady) return fundingStatus?.reason || 'Fund wallet with gas and USDC.';
    if (!active) return 'Loan is inactive or not found.';
    if (!isBorrower) return 'Connected wallet is not the borrower for this loan.';
    if (!repayUnits || repayUnits <= 0n) return 'Enter a valid repay amount.';
    if (overpaying) return 'Repay amount exceeds total due.';
    if (!hasAllowance) return 'Approve USDC before repaying.';
    return '';
  })();
  const canApprove =
    hasWallet &&
    fundingReady &&
    Boolean(usdc && loanManager) &&
    active &&
    isBorrower &&
    Boolean(repayUnits && repayUnits > 0n);

  const handleApprove = () => {
    setActionError('');
    trackEvent('repay_approve_start', {
      chainId,
      loanId,
      repayAmountUsdc: repayAmount
    });
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
    trackEvent('repay_start', {
      chainId,
      loanId,
      repayAmountUsdc: repayAmount,
      hasAllowance
    });
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
      trackEvent('repay_submit_error', {
        chainId,
        loanId,
        message: String(err?.shortMessage || err?.message || 'Gas estimate failed.').slice(
          0,
          160
        )
      });
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

  useEffect(() => {
    if (!repaySimError) return;
    trackEvent('repay_simulation_error', {
      chainId,
      loanId,
      reason: normalizeTxError(repaySimError).slice(0, 160)
    });
  }, [repaySimError, chainId, loanId]);

  useEffect(() => {
    if (!repayDisabledReason) return;
    trackEvent('repay_blocked', {
      chainId,
      loanId,
      reason: repayDisabledReason.slice(0, 160)
    });
  }, [repayDisabledReason, chainId, loanId]);

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
          Simulation: {normalizeTxError(repaySimError)}
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
        <label className="form-field">
          Wallet USDC
          <div className="form-value">{formatUsdc(usdcBalance)} USDC</div>
        </label>
      </div>
      <div className="data-table">
        <div className="table-row header">
          <div>Loan Status</div>
          <div>Borrower Match</div>
          <div>Allowance</div>
          <div>Needed</div>
          <div>Principal</div>
          <div>Interest</div>
          <div>Total Due</div>
        </div>
        <div className="table-row">
          <div>{active ? 'Active' : 'Inactive'}</div>
          <div>{isBorrower ? 'Yes' : 'No'}</div>
          <div>{formatUsdc(allowance)} USDC</div>
          <div>{formatUsdc(repayUnits)} USDC</div>
          <div>{formatUsdc(principal)} USDC</div>
          <div>{formatUsdc(interest)} USDC</div>
          <div>{formatUsdc(totalDue)} USDC</div>
        </div>
      </div>
      {repayDisabledReason && <div className="muted">{repayDisabledReason}</div>}
      <div className="inline-actions">
        <button
          className="button"
          data-guide-id="repay-approve-usdc"
          onClick={handleApprove}
          disabled={isApprovePending || isApproveMining || !canApprove}
        >
          Approve
        </button>
        <button
          className="button"
          data-guide-id="repay-submit"
          onClick={handleRepay}
          disabled={isRepayPending || isRepayMining || Boolean(repayDisabledReason)}
        >
          Repay
        </button>
        <button
          className="button ghost"
          type="button"
          data-guide-id="repay-use-total-due"
          onClick={() => setRepayAmount(formatUnits(totalDue, USDC_DECIMALS))}
          disabled={!active || totalDue <= 0n}
        >
          Use Total Due
        </button>
      </div>
    </div>
  );
}
