// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSignTypedData,
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
import { apiPost } from '../../utils/api.js';
import { makeRelayerAuth } from '../../utils/privacy.js';
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

export default function RepayActions({ fundingStatus, initialLoanId = '', privacyMode = false }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');
  const { signTypedDataAsync } = useSignTypedData();

  const [loanId, setLoanId] = useState('0');
  const [repayAmount, setRepayAmount] = useState('50');
  const [actionError, setActionError] = useState('');
  const [relayerStatus, setRelayerStatus] = useState('');
  const [relayerBusy, setRelayerBusy] = useState(false);
  const [settleBusy, setSettleBusy] = useState(false);

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

  const { data: isPrivateLoan } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'isPrivateLoan',
    args: [BigInt(loanId || 0)],
    query: { enabled: Boolean(loanManager) }
  });

  const { data: privateLoan } = useReadContract({
    address: loanManager,
    abi: loanManagerAbi,
    functionName: 'privateLoans',
    args: [BigInt(loanId || 0)],
    query: { enabled: Boolean(loanManager && isPrivateLoan) }
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

  const privateVault = privateLoan?.[0] || ZERO_ADDRESS;
  const privatePrincipal = privateLoan?.[1] ?? 0n;
  const privateInterest = privateLoan?.[2] ?? 0n;
  const privateTotalDue = privatePrincipal + privateInterest;
  const privateUnlockTime = privateLoan?.[5] ?? 0n;
  const privateActive = Boolean(privateLoan?.[6]);

  const effectiveIsPrivate = Boolean(isPrivateLoan);
  const effectiveActive = effectiveIsPrivate ? privateActive : active;
  const effectiveTotalDue = effectiveIsPrivate ? privateTotalDue : totalDue;
  const effectivePrincipal = effectiveIsPrivate ? privatePrincipal : principal;
  const effectiveInterest = effectiveIsPrivate ? privateInterest : interest;
  const hasWallet = Boolean(address);
  const isBorrower =
    hasWallet && loanBorrower !== ZERO_ADDRESS
      ? loanBorrower.toLowerCase() === address.toLowerCase()
      : false;
  const overpaying = Boolean(repayUnits && effectiveTotalDue > 0n && repayUnits > effectiveTotalDue);
  const repayDisabledReason = (() => {
    if (privacyMode && effectiveIsPrivate) {
      if (!fundingReady) return fundingStatus?.reason || 'Ensure relayer is reachable.';
      if (!effectiveActive) return 'Private loan is inactive or not found.';
      if (!repayUnits || repayUnits <= 0n) return 'Enter a valid repay amount.';
      if (overpaying) return 'Repay amount exceeds total due.';
      return '';
    }
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

  const canSettlePrivate =
    privacyMode &&
    effectiveIsPrivate &&
    effectiveActive &&
    privateUnlockTime &&
    privateUnlockTime > 0n &&
    Math.floor(Date.now() / 1000) >= Number(privateUnlockTime);

  const handleSettlePrivate = async () => {
    setActionError('');
    setRelayerStatus('');
    setSettleBusy(true);
    try {
      setRelayerStatus('Submitting private settlement via relayer...');
      if (!signTypedDataAsync || !address) {
        throw new Error('Wallet signature unavailable for private-mode relayer auth.');
      }
      const payload = { loanId: String(loanId || 0) };
      const auth = makeRelayerAuth({
        chainId,
        verifyingContract: loanManager,
        user: address,
        vault: privateVault,
        action: 'settle-private-loan',
        payload
      });
      const signature = await signTypedDataAsync(auth.typedData);
      const result = await apiPost('/api/relayer/evm/settle-private-loan', {
        ...payload,
        signature,
        nonce: auth.nonce,
        issuedAt: auth.issuedAt,
        expiresAt: auth.expiresAt,
        payloadHash: auth.payloadHash
      });
      setRelayerStatus(
        result?.txHash
          ? `Settlement tx submitted: ${String(result.txHash).slice(0, 10)}…`
          : 'Settlement tx submitted.'
      );
      trackEvent('settle_private_relayer_submitted', { chainId, loanId });
    } catch (err) {
      setActionError(err?.message || 'Relayer settlement failed.');
      trackEvent('settle_private_relayer_error', {
        chainId,
        loanId,
        message: String(err?.message || '').slice(0, 160)
      });
    } finally {
      setSettleBusy(false);
    }
  };

  const handleApprove = () => {
    setActionError('');
    setRelayerStatus('');
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
    setRelayerStatus('');
    trackEvent('repay_start', {
      chainId,
      loanId,
      repayAmountUsdc: repayAmount,
      hasAllowance
    });
    if (privacyMode && effectiveIsPrivate) {
      setRelayerBusy(true);
      try {
        setRelayerStatus('Submitting private repayment via relayer...');
        if (!signTypedDataAsync || !address) {
          throw new Error('Wallet signature unavailable for private-mode relayer auth.');
        }
        const payload = { loanId: String(loanId || 0), amount: repayUnits.toString() };
        const auth = makeRelayerAuth({
          chainId,
          verifyingContract: loanManager,
          user: address,
          vault: privateVault,
          action: 'repay-private-loan',
          payload
        });
        const signature = await signTypedDataAsync(auth.typedData);
        const result = await apiPost('/api/relayer/evm/repay-private-loan', {
          ...payload,
          signature,
          nonce: auth.nonce,
          issuedAt: auth.issuedAt,
          expiresAt: auth.expiresAt,
          payloadHash: auth.payloadHash
        });
        setRelayerStatus(
          result?.txHash
            ? `Relayer tx submitted: ${String(result.txHash).slice(0, 10)}…`
            : 'Relayer tx submitted.'
        );
        trackEvent('repay_private_relayer_submitted', { chainId, loanId });
      } catch (err) {
        setActionError(err?.message || 'Relayer repayment failed.');
        trackEvent('repay_private_relayer_error', {
          chainId,
          loanId,
          message: String(err?.message || '').slice(0, 160)
        });
      } finally {
        setRelayerBusy(false);
      }
      return;
    }
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
      enabled: Boolean(loanManager && repayUnits && address && !(privacyMode && effectiveIsPrivate))
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
            {privacyMode && effectiveIsPrivate
              ? 'Private loans repay via relayer/vault (borrower wallet not required).'
              : 'Approve USDC then submit a repayment.'}
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
          <div>{effectiveIsPrivate ? 'Private' : 'Borrower Match'}</div>
          <div>Allowance</div>
          <div>Needed</div>
          <div>Principal</div>
          <div>Interest</div>
          <div>Total Due</div>
        </div>
        <div className="table-row">
          <div>{effectiveActive ? 'Active' : 'Inactive'}</div>
          <div>{effectiveIsPrivate ? 'Yes' : isBorrower ? 'Yes' : 'No'}</div>
          <div>{formatUsdc(allowance)} USDC</div>
          <div>{formatUsdc(repayUnits)} USDC</div>
          <div>{formatUsdc(effectivePrincipal)} USDC</div>
          <div>{formatUsdc(effectiveInterest)} USDC</div>
          <div>{formatUsdc(effectiveTotalDue)} USDC</div>
        </div>
      </div>
      {privacyMode && effectiveIsPrivate && privateVault !== ZERO_ADDRESS && (
        <div className="muted" style={{ marginTop: 10 }}>
          Private vault: {String(privateVault).slice(0, 8)}…{String(privateVault).slice(-6)} · Unlock:{' '}
          {privateUnlockTime && privateUnlockTime > 0n
            ? new Date(Number(privateUnlockTime) * 1000).toLocaleDateString()
            : '--'}
        </div>
      )}
      {repayDisabledReason && <div className="muted">{repayDisabledReason}</div>}
      <div className="inline-actions">
        <button
          className="button"
          data-guide-id="repay-approve-usdc"
          onClick={handleApprove}
          disabled={
            privacyMode && effectiveIsPrivate
              ? true
              : isApprovePending || isApproveMining || !canApprove
          }
        >
          Approve
        </button>
        <button
          className="button"
          data-guide-id="repay-submit"
          onClick={handleRepay}
          disabled={
            relayerBusy ||
            isRepayPending ||
            isRepayMining ||
            Boolean(repayDisabledReason)
          }
        >
          {privacyMode && effectiveIsPrivate ? (relayerBusy ? 'Working…' : 'Repay (Relayer)') : 'Repay'}
        </button>
        <button
          className="button ghost"
          type="button"
          data-guide-id="repay-use-total-due"
          onClick={() => setRepayAmount(formatUnits(effectiveTotalDue, USDC_DECIMALS))}
          disabled={!effectiveActive || effectiveTotalDue <= 0n}
        >
          Use Total Due
        </button>
        {privacyMode && effectiveIsPrivate && (
          <button
            className="button ghost"
            type="button"
            onClick={handleSettlePrivate}
            disabled={settleBusy || !canSettlePrivate}
            aria-disabled={settleBusy || !canSettlePrivate}
          >
            {settleBusy ? 'Settling…' : 'Settle at unlock (Relayer)'}
          </button>
        )}
      </div>
      {relayerStatus && <div className="muted">{relayerStatus}</div>}
    </div>
  );
}
