// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import { formatUnits } from 'viem';
import {
  getContractAddress,
  LOAN_STATUS,
  LOAN_STATUS_LABELS,
  loanManagerAbi,
  usdcAbi
} from '../../utils/contracts.js';
import { toUnits } from '../../utils/format.js';
import TxStatusBanner from '../common/TxStatusBanner.jsx';
import { trackEvent } from '../../utils/analytics.js';

const USDC_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
// Debt accrues every second at a floating rate. When repaying in full we send a small buffer;
// LoanManager.repay() only pulls min(amount, debt), so the excess is never transferred.
const FULL_REPAY_BUFFER_BPS = 10n; // 0.1%

const formatUsdc = (value) => {
  if (value === null || value === undefined) return '--';
  const asNumber = Number(formatUnits(BigInt(value), USDC_DECIMALS));
  if (!Number.isFinite(asNumber)) return '--';
  return asNumber.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
};

const withBuffer = (debt) => {
  const value = BigInt(debt || 0);
  if (value <= 0n) return 0n;
  return value + (value * FULL_REPAY_BUFFER_BPS) / 10000n + 1n;
};

const normalizeTxError = (error) => {
  const message = String(error?.shortMessage || error?.message || '');
  if (!message) return '';
  if (message.includes('not repayable')) return 'Loan is not active (already repaid, liquidated, or does not exist on this network).';
  if (message.includes('full repayment required during auction')) return 'This loan is in auction: repay the full debt to cancel the auction.';
  if (message.includes('amount=0')) return 'Repay amount must be greater than 0.';
  if (message.includes('ERC20InsufficientAllowance')) return 'USDC allowance too low. Approve USDC first.';
  if (message.includes('ERC20InsufficientBalance')) return 'Insufficient USDC balance.';
  if (message.includes('nothing to claim')) return 'No auction surplus to claim.';
  return message;
};

export default function RepayActions({ fundingStatus, initialLoanId = '' }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const usdc = getContractAddress(chainId, 'usdc');

  const [loanId, setLoanId] = useState('');
  const [repayAmount, setRepayAmount] = useState('50');

  useEffect(() => {
    if (!initialLoanId) return;
    if (!/^\d+$/.test(initialLoanId)) return;
    setLoanId(initialLoanId);
  }, [initialLoanId]);

  const loanIdValid = /^\d+$/.test(loanId) && BigInt(loanId) > 0n;
  const loanIdBig = loanIdValid ? BigInt(loanId) : 0n;
  const repayUnits = useMemo(() => toUnits(repayAmount, USDC_DECIMALS), [repayAmount]);

  const { data: myLoanIds } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'loansOf',
    args: [address || ZERO_ADDRESS],
    query: { enabled: Boolean(loanManager && address) }
  });

  useEffect(() => {
    if (loanId || initialLoanId) return;
    if (Array.isArray(myLoanIds) && myLoanIds.length) {
      setLoanId(myLoanIds[myLoanIds.length - 1].toString());
    }
  }, [myLoanIds, loanId, initialLoanId]);

  const { data: loanBatch, refetch: refetchLoan } = useReadContracts({
    contracts: loanManager && loanIdValid
      ? [
        { address: loanManager, abi: loanManagerAbi, functionName: 'getLoan', args: [loanIdBig] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'debtOf', args: [loanIdBig] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'healthFactorBps', args: [loanIdBig] },
        { address: loanManager, abi: loanManagerAbi, functionName: 'isLiquidatable', args: [loanIdBig] }
      ]
      : [],
    query: { enabled: Boolean(loanManager && loanIdValid), refetchInterval: 15000 }
  });
  const readOk = (row) => (row?.status === 'success' ? row.result : undefined);
  const loan = readOk(loanBatch?.[0]);
  const debt = readOk(loanBatch?.[1]);
  const healthFactorBps = readOk(loanBatch?.[2]);
  const liquidatable = readOk(loanBatch?.[3]);

  const { data: rateBps } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'currentRateBps',
    query: { enabled: Boolean(loanManager) }
  });

  const { data: claimableSurplus, refetch: refetchClaimable } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'claimable',
    args: [address || ZERO_ADDRESS],
    query: { enabled: Boolean(loanManager && address) }
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'allowance',
    args: [address || ZERO_ADDRESS, loanManager || ZERO_ADDRESS],
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
    data: claimHash,
    writeContract: writeClaim,
    isPending: isClaimPending,
    error: claimError
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
  const {
    isLoading: isClaimMining,
    isSuccess: claimConfirmed,
    error: claimReceiptError
  } = useWaitForTransactionReceipt({ hash: claimHash });

  const status = loan ? Number(loan.status) : LOAN_STATUS.NONE;
  const statusLabel = LOAN_STATUS_LABELS[status] || 'Unknown';
  const repayable = status === LOAN_STATUS.ACTIVE || status === LOAN_STATUS.AUCTION;
  const inAuction = status === LOAN_STATUS.AUCTION;
  const principal = loan?.principal ?? 0n;
  const debtValue = debt ?? 0n;
  const interest = debtValue > principal ? debtValue - principal : 0n;
  const loanBorrower = loan?.borrower || ZERO_ADDRESS;
  const maturity = loan?.maturity ? Number(loan.maturity) : 0;

  const hasAllowance =
    allowance !== undefined && repayUnits !== null ? allowance >= repayUnits : false;
  const fundingReady = fundingStatus?.ready ?? true;
  const hasWallet = Boolean(address);
  const isBorrower =
    hasWallet && loanBorrower !== ZERO_ADDRESS
      ? loanBorrower.toLowerCase() === address.toLowerCase()
      : false;
  const auctionUnderpay = Boolean(inAuction && repayUnits && repayUnits < debtValue);

  const repayDisabledReason = (() => {
    if (!hasWallet) return 'Connect a wallet to repay.';
    if (!loanManager) return 'Vestra contracts are not deployed on this network yet.';
    if (!fundingReady) return fundingStatus?.reason || 'Fund wallet with gas and USDC.';
    if (!loanIdValid) return 'Enter a loan ID (ids start at 1).';
    if (!repayable) return `Loan is ${statusLabel.toLowerCase()} and cannot be repaid.`;
    if (!repayUnits || repayUnits <= 0n) return 'Enter a valid repay amount.';
    if (auctionUnderpay) return 'Loan is in auction: repay the full debt to cancel it.';
    if (!hasAllowance) return 'Approve USDC before repaying.';
    return '';
  })();
  const canApprove =
    hasWallet && fundingReady && Boolean(usdc && loanManager) && repayable && Boolean(repayUnits && repayUnits > 0n);

  const handleApprove = () => {
    trackEvent('repay_approve_start', { chainId, loanId, repayAmountUsdc: repayAmount });
    if (!usdc || !repayUnits || !loanManager) return;
    writeApprove({
      address: usdc,
      abi: usdcAbi,
      functionName: 'approve',
      args: [loanManager, repayUnits]
    });
  };

  const handleRepay = () => {
    trackEvent('repay_start', { chainId, loanId, repayAmountUsdc: repayAmount, hasAllowance });
    if (!loanManager || !repayUnits || !loanIdValid) return;
    writeRepay({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'repay',
      args: [loanIdBig, repayUnits]
    });
  };

  const handleClaim = () => {
    if (!loanManager) return;
    writeClaim({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'claim',
      args: []
    });
  };

  const { error: repaySimError } = useSimulateContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'repay',
    args: [loanIdBig, repayUnits || 0n],
    account: address,
    query: {
      enabled: Boolean(loanManager && repayUnits && address && loanIdValid && repayable && hasAllowance)
    }
  });

  useEffect(() => {
    if (approveConfirmed) {
      trackEvent('repay_approve_confirmed', { chainId });
      refetchAllowance();
    }
  }, [approveConfirmed, chainId, refetchAllowance]);

  useEffect(() => {
    if (repayConfirmed) {
      trackEvent('repay_confirmed', { chainId });
      refetchLoan();
      refetchAllowance();
    }
  }, [repayConfirmed, chainId, refetchLoan, refetchAllowance]);

  useEffect(() => {
    if (claimConfirmed) refetchClaimable();
  }, [claimConfirmed, refetchClaimable]);

  useEffect(() => {
    if (!repaySimError) return;
    trackEvent('repay_simulation_error', {
      chainId,
      loanId,
      reason: normalizeTxError(repaySimError).slice(0, 160)
    });
  }, [repaySimError, chainId, loanId]);

  const txError =
    claimReceiptError ||
    repayReceiptError ||
    approveReceiptError ||
    claimError ||
    repayError ||
    approveError;

  return (
    <div className="holo-card" id="repay-actions">
      <div className="section-head">
        <div>
          <h3 className="section-title">Repay Live Loan</h3>
          <div className="section-subtitle">
            Approve USDC then repay part or all of the floating-rate debt. Anyone can repay a loan.
          </div>
        </div>
        <span className="tag">USDC</span>
      </div>
      {txError && <div className="error-banner">{normalizeTxError(txError)}</div>}
      {repaySimError && (
        <div className="muted">Simulation: {normalizeTxError(repaySimError)}</div>
      )}
      <TxStatusBanner
        label="Approve Transaction"
        hash={approveHash}
        status={approveConfirmed ? 'Confirmed' : isApproveMining ? 'Confirming' : isApprovePending ? 'Pending' : ''}
      />
      <TxStatusBanner
        label="Repay Transaction"
        hash={repayHash}
        status={repayConfirmed ? 'Confirmed' : isRepayMining ? 'Confirming' : isRepayPending ? 'Pending' : ''}
      />
      <TxStatusBanner
        label="Claim Surplus"
        hash={claimHash}
        status={claimConfirmed ? 'Confirmed' : isClaimMining ? 'Confirming' : isClaimPending ? 'Pending' : ''}
      />
      <div className="form-grid">
        {Array.isArray(myLoanIds) && myLoanIds.length > 0 && (
          <label className="form-field">
            Your loans
            <select
              className="form-select"
              value={loanId}
              onChange={(event) => setLoanId(event.target.value)}
            >
              {myLoanIds.map((id) => (
                <option key={id.toString()} value={id.toString()}>
                  Loan #{id.toString()}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-field">
          Loan ID
          <input
            className="form-input"
            value={loanId}
            onChange={(event) => setLoanId(event.target.value.trim())}
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
          <div>Principal</div>
          <div>Accrued Interest</div>
          <div>Current Debt</div>
          <div>Health</div>
          <div>Maturity</div>
        </div>
        <div className="table-row">
          <div>{loan ? statusLabel : '--'}</div>
          <div>{loan ? (isBorrower ? 'Yes' : 'No') : '--'}</div>
          <div>{formatUsdc(principal)} USDC</div>
          <div>{formatUsdc(interest)} USDC</div>
          <div>{formatUsdc(debtValue)} USDC</div>
          <div>
            {healthFactorBps != null && repayable
              ? `${(Number(healthFactorBps) / 10000).toFixed(2)}x`
              : '--'}
            {liquidatable ? ' (liquidatable)' : ''}
          </div>
          <div>{maturity ? new Date(maturity * 1000).toLocaleDateString() : '--'}</div>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 8 }}>
        Floating borrow APR: {rateBps != null ? `${(Number(rateBps) / 100).toFixed(2)}%` : '--'} ·
        Allowance: {formatUsdc(allowance)} USDC
        {inAuction ? ' · In auction: a full repayment cancels the auction and returns your stream.' : ''}
      </div>
      {loan && !isBorrower && repayable && (
        <div className="muted">You are not the borrower. Repaying is allowed, but the collateral returns to the borrower.</div>
      )}
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
          onClick={() => setRepayAmount(formatUnits(withBuffer(debtValue), USDC_DECIMALS))}
          disabled={!repayable || debtValue <= 0n}
        >
          Repay In Full
        </button>
      </div>
      <div className="muted">
        "Repay In Full" adds a 0.1% buffer for interest that accrues before the transaction lands;
        the contract only takes what is owed.
      </div>
      {claimableSurplus != null && claimableSurplus > 0n && (
        <div className="inline-actions" style={{ marginTop: 10 }}>
          <span className="pill">Auction surplus claimable: {formatUsdc(claimableSurplus)} USDC</span>
          <button
            className="button ghost"
            type="button"
            onClick={handleClaim}
            disabled={isClaimPending || isClaimMining}
          >
            Claim Surplus
          </button>
        </div>
      )}
    </div>
  );
}
