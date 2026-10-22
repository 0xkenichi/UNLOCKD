// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSimulateContract,
  useWriteContract
} from 'wagmi';
import { decodeEventLog, formatUnits } from 'viem';
import {
  erc20Abi,
  erc721Abi,
  getContractAddress,
  loanManagerAbi,
  sablierV2LockupAbi,
  VESTING_PROTOCOL
} from '../../utils/contracts.js';
import { toUnits } from '../../utils/format.js';
import { apiGet } from '../../utils/api.js';
import TxStatusBanner from '../common/TxStatusBanner.jsx';
import { trackEvent } from '../../utils/analytics.js';
import loanTermsDoc from '../../../../packages/docs/LOAN_TERMS_AND_RISK_DISCLOSURE_OUTLINE.md?raw';

const USDC_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const PROTOCOL_OPTIONS = [
  { value: VESTING_PROTOCOL.SABLIER_V2, label: 'Sablier v2 Lockup' },
  { value: VESTING_PROTOCOL.STREAMFLOW_EVM, label: 'Streamflow (EVM wrapper)' },
  { value: VESTING_PROTOCOL.GENERIC_ERC721, label: 'Whitelisted ERC-721 claim' }
];

const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(value);
const formatBorrowUsd = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(2);
};
const formatUsdc = (value) => {
  if (value === null || value === undefined) return '--';
  const asNumber = Number(formatUnits(BigInt(value), USDC_DECIMALS));
  if (!Number.isFinite(asNumber)) return '--';
  return asNumber.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const clampPercent = (value) => {
  if (!Number.isFinite(value)) return 100;
  if (value < 1) return 1;
  if (value > 100) return 100;
  return Math.round(value);
};
const protocolFromLabel = (label) => {
  const text = String(label ?? '').toLowerCase();
  if (text.includes('streamflow')) return VESTING_PROTOCOL.STREAMFLOW_EVM;
  if (text.includes('sablier') || !text) return VESTING_PROTOCOL.SABLIER_V2;
  return VESTING_PROTOCOL.GENERIC_ERC721;
};
const toDateInput = (unixSeconds) => {
  if (!unixSeconds) return '';
  const date = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};
const normalizeTxError = (error) => {
  const message = String(error?.shortMessage || error?.message || '');
  if (message.includes('exceeds max borrow')) return 'Amount exceeds the max borrow for this stream.';
  if (message.includes('below minimum')) return 'Amount is below the protocol minimum borrow.';
  if (message.includes('bad maturity')) return 'Maturity must be in the future and no later than the unlock time.';
  if (message.includes('ltv >= liquidation threshold')) return 'This collateral is not eligible: LTV is at or above its liquidation threshold.';
  if (message.includes('NotWhitelisted')) return 'This vesting contract is not whitelisted on the VestingAdapter.';
  if (message.includes('StreamCancelable')) return 'Cancelable streams cannot be used as collateral.';
  if (message.includes('NotOwner')) return 'Connected wallet does not own this stream NFT.';
  return message;
};

export default function BorrowActions({
  prefill,
  onDetails,
  maxBorrowUsd: maxBorrowUsdFromParent,
  fundingStatus,
  offerBorrowUsd,
  selectedOffer,
  matchOffers = [],
  matchLoading = false,
  matchError = '',
  onSelectOffer,
  onBorrowAmountUsdChange,
  showAdvanced = false,
  detectedPositions = [],
  selectedDetectedFromParent = '',
  onSelectDetectedFromParent
}) {
  const navigate = useNavigate();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const vestingAdapter = getContractAddress(chainId, 'vestingAdapter');

  const [streamId, setStreamId] = useState(() => {
    const raw = prefill?.streamId ?? prefill?.collateralId;
    return raw != null ? String(raw).trim() : '';
  });
  const [nftContract, setNftContract] = useState(() => {
    const raw = prefill?.nftContract ?? prefill?.vestingContract;
    return raw != null ? String(raw).trim() : '';
  });
  const [protocol, setProtocol] = useState(() => protocolFromLabel(prefill?.protocol));
  const [maturityDate, setMaturityDate] = useState('');
  const [borrowAmount, setBorrowAmount] = useState(() => {
    const raw = Number(prefill?.desiredAmountUsd ?? prefill?.borrowAmountUsd ?? 0);
    if (Number.isFinite(raw) && raw > 0) return String(raw);
    return '200';
  });
  const [borrowAgainstPct, setBorrowAgainstPct] = useState(100);
  const [autoBorrow, setAutoBorrow] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsViewed, setTermsViewed] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
  const termsScrollRef = useRef(null);
  const [selectedDetected, setSelectedDetected] = useState('');
  const [autoSelected, setAutoSelected] = useState(false);
  const [volatility, setVolatility] = useState(0);
  const [flowStatus, setFlowStatus] = useState('');
  const [flowError, setFlowError] = useState('');
  const [approveHash, setApproveHash] = useState('');
  const [approveState, setApproveState] = useState('');
  const [borrowHash, setBorrowHash] = useState('');
  const [borrowState, setBorrowState] = useState('');
  const [openedLoanId, setOpenedLoanId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet('/api/simulation/state').then(res => {
      if (res.ok) setVolatility(res.volatility || 0);
    }).catch(() => {});
  }, []);

  const nftContractValid = isAddress(nftContract);
  const streamIdValid = /^\d+$/.test(streamId);
  const streamIdBig = streamIdValid ? BigInt(streamId) : 0n;
  const isSablier = protocol === VESTING_PROTOCOL.SABLIER_V2;

  const borrowUnits = useMemo(() => toUnits(borrowAmount, USDC_DECIMALS), [borrowAmount]);

  useEffect(() => {
    if (!onBorrowAmountUsdChange) return;
    const next = Number(borrowAmount);
    onBorrowAmountUsdChange(Number.isFinite(next) && next > 0 ? next : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowAmount]);

  // Stream preview. The contract reads quantity/token/unlock from the stream itself at borrow
  // time; this read is only used to quote a max borrow before escrow.
  const streamReadEnabled = Boolean(isSablier && nftContractValid && streamIdValid);
  const { data: streamBatch, isFetching: isStreamLoading } = useReadContracts({
    contracts: streamReadEnabled
      ? [
        { address: nftContract, abi: sablierV2LockupAbi, functionName: 'getAsset', args: [streamIdBig] },
        { address: nftContract, abi: sablierV2LockupAbi, functionName: 'getEndTime', args: [streamIdBig] },
        { address: nftContract, abi: sablierV2LockupAbi, functionName: 'getDepositedAmount', args: [streamIdBig] },
        { address: nftContract, abi: sablierV2LockupAbi, functionName: 'getWithdrawnAmount', args: [streamIdBig] }
      ]
      : [],
    query: { enabled: streamReadEnabled }
  });
  const readOk = (row) => (row?.status === 'success' ? row.result : undefined);
  const tokenAddress = readOk(streamBatch?.[0]);
  const unlockTime = readOk(streamBatch?.[1]);
  const deposited = readOk(streamBatch?.[2]);
  const withdrawn = readOk(streamBatch?.[3]);
  const quantity =
    deposited != null && withdrawn != null && BigInt(deposited) > BigInt(withdrawn)
      ? BigInt(deposited) - BigInt(withdrawn)
      : undefined;
  const tokenAddressValid =
    typeof tokenAddress === 'string' && isAddress(tokenAddress) && tokenAddress !== ZERO_ADDRESS;
  const hasPreview = Boolean(quantity) && tokenAddressValid && Number(unlockTime || 0) > 0;

  const { data: tokenDecimals } = useReadContract({
    address: tokenAddressValid ? tokenAddress : undefined,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: tokenAddressValid }
  });

  const { data: maxBorrowQuote } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'quoteMaxBorrow',
    args: hasPreview ? [tokenAddress, quantity, BigInt(unlockTime), nftContract] : undefined,
    query: { enabled: Boolean(loanManager && hasPreview) }
  });
  const quotedMaxBorrow = maxBorrowQuote?.[0];
  const quotedPv = maxBorrowQuote?.[1];
  const quotedLtvBps = maxBorrowQuote?.[2];
  const maxBorrowUsd =
    quotedMaxBorrow != null
      ? Number(formatUnits(quotedMaxBorrow, USDC_DECIMALS))
      : maxBorrowUsdFromParent;

  const { data: protocolParams } = useReadContracts({
    contracts: loanManager
      ? [
        { address: loanManager, abi: loanManagerAbi, functionName: 'currentRateBps' },
        { address: loanManager, abi: loanManagerAbi, functionName: 'originationFeeBps' },
        { address: loanManager, abi: loanManagerAbi, functionName: 'minBorrow' }
      ]
      : [],
    query: { enabled: Boolean(loanManager) }
  });
  const currentRateBps = readOk(protocolParams?.[0]);
  const originationFeeBps = readOk(protocolParams?.[1]);
  const minBorrow = readOk(protocolParams?.[2]);

  const nftReadEnabled = Boolean(nftContractValid && streamIdValid && vestingAdapter);
  const { data: nftBatch, refetch: refetchApproval } = useReadContracts({
    contracts: nftReadEnabled
      ? [
        { address: nftContract, abi: erc721Abi, functionName: 'ownerOf', args: [streamIdBig] },
        { address: nftContract, abi: erc721Abi, functionName: 'getApproved', args: [streamIdBig] },
        {
          address: nftContract,
          abi: erc721Abi,
          functionName: 'isApprovedForAll',
          args: [address || ZERO_ADDRESS, vestingAdapter]
        }
      ]
      : [],
    query: { enabled: nftReadEnabled }
  });
  const nftOwner = readOk(nftBatch?.[0]);
  const approvedAddress = readOk(nftBatch?.[1]);
  const approvedForAll = readOk(nftBatch?.[2]);
  const isOwner =
    Boolean(address && nftOwner) && String(nftOwner).toLowerCase() === address.toLowerCase();
  const nftApproved =
    Boolean(approvedForAll) ||
    (Boolean(approvedAddress && vestingAdapter) &&
      String(approvedAddress).toLowerCase() === vestingAdapter.toLowerCase());

  const maturityUnix = useMemo(() => {
    if (!maturityDate) return 0n; // 0 = contract defaults maturity to the stream unlock time
    const ms = new Date(`${maturityDate}T00:00:00Z`).getTime();
    return Number.isFinite(ms) ? BigInt(Math.floor(ms / 1000)) : 0n;
  }, [maturityDate]);

  // Sync with parent selection of a detected position.
  useEffect(() => {
    if (selectedDetectedFromParent && selectedDetectedFromParent !== selectedDetected) {
      setSelectedDetected(selectedDetectedFromParent);
      const picked = detectedPositions.find(
        (item) => `${item.collateralId}:${item.vestingContract}` === selectedDetectedFromParent
      );
      if (picked) {
        setStreamId(String(picked.collateralId || ''));
        setNftContract(String(picked.vestingContract || ''));
        setProtocol(protocolFromLabel(picked.protocol));
      }
    }
  }, [selectedDetectedFromParent, detectedPositions, selectedDetected]);

  useEffect(() => {
    if (detectedPositions.length > 0 && !nftContract && !selectedDetected && !autoSelected) {
      const first = detectedPositions[0];
      const val = `${first.collateralId}:${first.vestingContract}`;
      setSelectedDetected(val);
      if (onSelectDetectedFromParent) onSelectDetectedFromParent(val);
      setStreamId(String(first.collateralId || ''));
      setNftContract(String(first.vestingContract || ''));
      setProtocol(protocolFromLabel(first.protocol));
      setAutoSelected(true);
      trackEvent('vesting_auto_selected', { collateralId: first.collateralId });
    }
  }, [detectedPositions, nftContract, selectedDetected, autoSelected, onSelectDetectedFromParent]);

  useEffect(() => {
    if (!onDetails) return;
    if (!hasPreview) {
      onDetails(null);
      return;
    }
    onDetails({
      collateralId: streamId,
      vestingContract: nftContract,
      quantity,
      tokenAddress,
      unlockTime,
      tokenDecimals,
      verified: hasPreview
    });
  }, [onDetails, streamId, nftContract, quantity, tokenAddress, unlockTime, tokenDecimals, hasPreview]);

  useEffect(() => {
    if (!autoBorrow) return;
    if (!maxBorrowUsd || !Number.isFinite(maxBorrowUsd)) return;
    const next = formatBorrowUsd(maxBorrowUsd * (borrowAgainstPct / 100));
    if (next && next !== borrowAmount) setBorrowAmount(next);
  }, [autoBorrow, borrowAmount, borrowAgainstPct, maxBorrowUsd]);

  useEffect(() => {
    if (!offerBorrowUsd || !Number.isFinite(offerBorrowUsd)) return;
    const capped = maxBorrowUsd && Number.isFinite(maxBorrowUsd)
      ? Math.min(offerBorrowUsd, maxBorrowUsd)
      : offerBorrowUsd;
    const next = formatBorrowUsd(capped);
    if (next && next !== borrowAmount) {
      setAutoBorrow(false);
      setBorrowAmount(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerBorrowUsd]);

  useEffect(() => {
    if (!maxBorrowUsd || !Number.isFinite(maxBorrowUsd) || maxBorrowUsd <= 0) return;
    const enteredBorrow = Number(borrowAmount);
    if (!Number.isFinite(enteredBorrow) || enteredBorrow <= 0) return;
    const pct = clampPercent((enteredBorrow / maxBorrowUsd) * 100);
    if (pct !== borrowAgainstPct) setBorrowAgainstPct(pct);
  }, [borrowAmount, maxBorrowUsd, borrowAgainstPct]);

  const { writeContractAsync } = useWriteContract();

  const hasWallet = Boolean(address);
  const hasGas = fundingStatus?.hasGas ?? true;
  const borrowValid = Boolean(borrowUnits) && borrowUnits > 0n;
  const exceedsQuote = Boolean(
    borrowValid && quotedMaxBorrow != null && borrowUnits > quotedMaxBorrow
  );
  const belowMinimum = Boolean(borrowValid && minBorrow != null && borrowUnits < minBorrow);
  const maturityAfterUnlock = Boolean(
    maturityUnix > 0n && unlockTime && maturityUnix > BigInt(unlockTime)
  );
  const termsGateReady = termsViewed && termsScrolledToEnd && agreeTerms;
  const inputsReady =
    Boolean(loanManager && vestingAdapter) &&
    hasWallet &&
    nftContractValid &&
    streamIdValid &&
    borrowValid &&
    !exceedsQuote &&
    !belowMinimum &&
    !maturityAfterUnlock &&
    (nftOwner === undefined || isOwner);
  const canApprove = inputsReady && termsGateReady && !nftApproved;
  const canBorrow = inputsReady && termsGateReady && nftApproved;

  const borrowDisabledReason = (() => {
    if (!hasWallet) return 'Connect a wallet to create a loan.';
    if (!hasGas) return 'Add gas to cover transaction fees.';
    if (!loanManager || !vestingAdapter) return 'Vestra contracts are not deployed on this network yet.';
    if (!nftContractValid) return 'Enter the vesting-stream NFT contract address.';
    if (!streamIdValid) return 'Enter a valid stream ID.';
    if (nftOwner !== undefined && !isOwner) return 'Connected wallet does not own this stream NFT.';
    if (isSablier && !hasPreview && !isStreamLoading) {
      return 'Stream not readable on this network (check the Lockup contract and stream ID).';
    }
    if (!borrowValid) return 'Enter a borrow amount.';
    if (exceedsQuote) return `Amount exceeds the max borrow of ${formatUsdc(quotedMaxBorrow)} USDC.`;
    if (belowMinimum) return `Minimum borrow is ${formatUsdc(minBorrow)} USDC.`;
    if (maturityAfterUnlock) return 'Maturity cannot be later than the stream unlock time.';
    if (!termsViewed) return 'Open the full loan agreement to continue.';
    if (!termsScrolledToEnd) return 'Scroll to the end of the loan agreement to continue.';
    if (!agreeTerms) return 'Accept the loan agreement to continue.';
    if (!nftApproved) return 'Approve the stream NFT to the VestingAdapter (step 1).';
    return '';
  })();

  const borrowArgs = [nftContractValid ? nftContract : ZERO_ADDRESS, streamIdBig, protocol, borrowUnits || 0n, maturityUnix];
  const { error: borrowSimError } = useSimulateContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'borrow',
    args: borrowArgs,
    account: address,
    query: { enabled: Boolean(canBorrow) }
  });

  const handleTermsScroll = () => {
    const el = termsScrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setTermsScrolledToEnd(true);
  };

  const openTermsModal = () => {
    setShowTerms(true);
    setTermsViewed(true);
    trackEvent('borrow_terms_opened', { streamId });
  };

  const waitForReceipt = async (hash) => {
    if (!publicClient) return null;
    return publicClient.waitForTransactionReceipt({ hash });
  };

  const handleApproveNft = async () => {
    if (!canApprove) return;
    setFlowError('');
    setFlowStatus('Approving stream NFT to the VestingAdapter...');
    setApproveState('Pending');
    try {
      const hash = await writeContractAsync({
        address: nftContract,
        abi: erc721Abi,
        functionName: 'approve',
        args: [vestingAdapter, streamIdBig]
      });
      setApproveHash(hash);
      setApproveState('Confirming');
      await waitForReceipt(hash);
      setApproveState('Confirmed');
      setFlowStatus('NFT approved. You can now create the loan.');
      await refetchApproval();
      trackEvent('borrow_nft_approved', { streamId, protocol });
    } catch (error) {
      setApproveState('');
      setFlowStatus('');
      setFlowError(normalizeTxError(error) || 'NFT approval failed.');
    }
  };

  const handleBorrow = async () => {
    if (!canBorrow) return;
    setFlowError('');
    setOpenedLoanId('');
    setBusy(true);
    setFlowStatus('Submitting borrow...');
    setBorrowState('Pending');
    trackEvent('borrow_start', {
      collateralId: streamId,
      vestingContract: nftContract,
      protocol,
      borrowAmountUsdc: borrowAmount,
      utilizationPct: borrowAgainstPct
    });
    try {
      const hash = await writeContractAsync({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'borrow',
        args: borrowArgs
      });
      setBorrowHash(hash);
      setBorrowState('Confirming');
      const receipt = await waitForReceipt(hash);
      setBorrowState('Confirmed');
      let loanId = '';
      for (const log of receipt?.logs || []) {
        if (String(log.address).toLowerCase() !== loanManager.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: loanManagerAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === 'LoanOpened') {
            loanId = decoded.args.loanId.toString();
            break;
          }
        } catch {
          // not a LoanManager event we know
        }
      }
      setOpenedLoanId(loanId);
      setFlowStatus(loanId ? `Loan #${loanId} opened. USDC (minus the origination fee) sent to your wallet.` : 'Loan confirmed.');
      trackEvent('borrow_confirmed', { loanId, chainId });
    } catch (error) {
      setBorrowState('');
      setFlowStatus('');
      setFlowError(normalizeTxError(error) || 'Borrow failed.');
    } finally {
      setBusy(false);
    }
  };

  const feeBps = originationFeeBps != null ? Number(originationFeeBps) : null;
  const borrowUsdNum = Number(borrowAmount || 0);
  const feeUsd = feeBps != null && Number.isFinite(borrowUsdNum) ? (borrowUsdNum * feeBps) / 10000 : null;

  return (
    <div className="holo-card borrow-actions-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Borrow Actions</h3>
          <div className="section-subtitle">
            Escrow a vesting-stream NFT with the VestingAdapter, then borrow USDC from the lending pool.
          </div>
        </div>
        <span className={`tag ${hasPreview ? 'success' : ''}`}>
          {hasPreview ? 'Ready' : 'Pending'}
        </span>
        {volatility > 10 && (
          <span className="tag info animate-pulse" style={{ background: 'rgba(196, 162, 108, 0.2)', color: '#c4a26c', borderColor: 'rgba(196, 162, 108, 0.4)' }}>
            MeTTA Optimized
          </span>
        )}
      </div>

      {autoSelected && hasPreview && (
        <div className="holo-card success-banner" style={{ marginBottom: 16, border: '1px solid var(--color-success)' }}>
          <div className="stack-row" style={{ gap: 12 }}>
            <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-success">Vesting Detected</div>
              <p className="muted text-[10px]">Automatically linked your {detectedPositions[0]?.tokenSymbol || 'collateral'} stream from your wallet.</p>
            </div>
          </div>
        </div>
      )}

      {showAdvanced && (
        <>
          <div className="data-table">
            <div className="table-row header">
              <div>Status</div>
              <div>Unlock</div>
              <div>Stream</div>
              <div>Token</div>
            </div>
            <div className="table-row">
              <div>{hasPreview ? 'Readable' : isStreamLoading ? 'Reading' : 'Waiting'}</div>
              <div>{hasPreview ? new Date(Number(unlockTime) * 1000).toLocaleDateString() : '--'}</div>
              <div>{streamId || '--'}</div>
              <div>{tokenAddressValid ? tokenAddress : '--'}</div>
            </div>
          </div>
          <div className="section-head" style={{ marginTop: 14 }}>
            <div>
              <h3 className="section-title">Pool Offers (advisory)</h3>
              <div className="section-subtitle">
                Offchain matcher output for reference only. All loans are funded by the single
                on-chain lending pool at its floating rate.
              </div>
            </div>
            <span className="tag">Matcher</span>
          </div>
          {matchError && <div className="error-banner">{matchError}</div>}
          {matchLoading && <div className="muted">Fetching offers…</div>}
          {!matchLoading && (!matchOffers || matchOffers.length === 0) && (
            <div className="muted">No advisory offers for this position.</div>
          )}
          {Boolean(matchOffers?.length) && (
            <label className="form-field" style={{ marginTop: 10 }}>
              Advisory offer
              <select
                className="form-select"
                value={selectedOffer?.offerId ? String(selectedOffer.offerId) : ''}
                onChange={(event) => {
                  const picked = matchOffers.find(
                    (offer) => String(offer.offerId) === String(event.target.value)
                  );
                  if (picked && onSelectOffer) onSelectOffer(picked);
                }}
              >
                <option value="">None</option>
                {matchOffers.map((offer) => {
                  const name = offer.poolName || `${offer.poolId?.slice?.(0, 8) || 'pool'}...`;
                  const maxLabel = Number(offer.maxBorrowUsd || 0).toFixed(0);
                  return (
                    <option key={offer.offerId} value={String(offer.offerId)}>
                      {name} · max ${maxLabel}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
        </>
      )}

      {flowError && <div className="error-banner">{flowError}</div>}
      {borrowSimError && (
        <div className="muted">Simulation: {normalizeTxError(borrowSimError)}</div>
      )}
      <TxStatusBanner label="NFT Approval" hash={approveHash} status={approveState} />
      <TxStatusBanner label="Loan Transaction" hash={borrowHash} status={borrowState} />
      {borrowDisabledReason && <div className="muted">{borrowDisabledReason}</div>}

      <div className="form-grid">
        {detectedPositions?.length > 0 && (
          <label className="form-field">
            Switch position (detected)
            <select
              className="form-select"
              value={selectedDetected}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedDetected(next);
                if (onSelectDetectedFromParent) onSelectDetectedFromParent(next);
                const picked = detectedPositions.find(
                  (item) => `${item.collateralId}:${item.vestingContract}` === next
                );
                if (!picked) return;
                setStreamId(String(picked.collateralId || ''));
                setNftContract(String(picked.vestingContract || ''));
                setProtocol(protocolFromLabel(picked.protocol));
              }}
            >
              <option value="">Choose detected stream</option>
              {detectedPositions.map((item) => (
                <option
                  key={`${item.loanId || item.collateralId}-${item.vestingContract}`}
                  value={`${item.collateralId}:${item.vestingContract}`}
                >
                  {(item.tokenSymbol || 'Token').toString()} · Stream {String(item.collateralId)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="form-field">
          Stream protocol
          <select
            className="form-select"
            value={String(protocol)}
            onChange={(event) => setProtocol(Number(event.target.value))}
          >
            {PROTOCOL_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          Stream NFT contract
          <input
            className="form-input"
            value={nftContract}
            onChange={(event) => setNftContract(event.target.value.trim())}
            placeholder="0x... (e.g. Sablier LockupLinear)"
          />
        </label>
        <label className="form-field">
          Stream ID
          <input
            className="form-input"
            value={streamId}
            onChange={(event) => setStreamId(event.target.value.trim())}
            inputMode="numeric"
          />
        </label>
        <label className="form-field">
          Maturity (optional)
          <input
            className="form-input"
            type="date"
            value={maturityDate}
            max={toDateInput(unlockTime)}
            onChange={(event) => setMaturityDate(event.target.value)}
          />
          <div className="muted" style={{ marginTop: 6 }}>
            {maturityDate ? 'Must be no later than the unlock time.' : 'Defaults to the stream unlock time.'}
          </div>
        </label>
        <label className="form-field">
          Borrow Amount (USDC)
          <input
            className="form-input"
            value={borrowAmount}
            onChange={(event) => {
              setAutoBorrow(false);
              setBorrowAmount(event.target.value);
            }}
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          Borrow (% of max)
          <input
            className="form-input"
            type="range"
            min="1"
            max="100"
            step="1"
            value={borrowAgainstPct}
            aria-label="Borrow percentage of max borrow"
            onChange={(event) => {
              const pct = clampPercent(Number(event.target.value));
              setBorrowAgainstPct(pct);
              setAutoBorrow(true);
              if (maxBorrowUsd && Number.isFinite(maxBorrowUsd)) {
                const next = formatBorrowUsd(maxBorrowUsd * (pct / 100));
                if (next) setBorrowAmount(next);
              }
            }}
            disabled={!maxBorrowUsd}
          />
          <div className="muted" style={{ marginTop: 6 }}>
            {borrowAgainstPct}% of max borrow
          </div>
        </label>
      </div>
      {!isSablier && (
        <div className="muted">
          Max-borrow preview is only available for Sablier v2 streams. For other protocols the
          LoanManager reads the stream at borrow time and reverts if the amount exceeds its limit.
        </div>
      )}
      <div className="inline-actions borrow-actions-inline">
        <button
          className="button"
          type="button"
          data-guide-id="borrow-use-max"
          onClick={() => {
            setAutoBorrow(true);
            setBorrowAgainstPct(100);
            const next = formatBorrowUsd(Number(maxBorrowUsd));
            if (next) setBorrowAmount(next);
          }}
          disabled={!maxBorrowUsd}
        >
          Use Max Borrow
        </button>
        <button className="button" type="button" onClick={() => setAutoBorrow((prev) => !prev)}>
          {autoBorrow ? 'Auto-fill On' : 'Auto-fill Off'}
        </button>
      </div>

      <div className="data-table" style={{ marginTop: 10 }}>
        <div className="table-row header">
          <div>Max borrow</div>
          <div>Collateral PV</div>
          <div>LTV</div>
          <div>Borrow APR (floating)</div>
          <div>Origination fee</div>
        </div>
        <div className="table-row">
          <div>{quotedMaxBorrow != null ? `${formatUsdc(quotedMaxBorrow)} USDC` : '--'}</div>
          <div>{quotedPv != null ? `${formatUsdc(quotedPv)} USDC` : '--'}</div>
          <div>{quotedLtvBps != null ? `${(Number(quotedLtvBps) / 100).toFixed(2)}%` : '--'}</div>
          <div>{currentRateBps != null ? `${(Number(currentRateBps) / 100).toFixed(2)}%` : '--'}</div>
          <div>
            {feeBps != null ? `${(feeBps / 100).toFixed(2)}%` : '--'}
            {feeUsd != null && borrowUsdNum > 0 ? ` (≈ $${feeUsd.toFixed(2)})` : ''}
          </div>
        </div>
      </div>

      {showAdvanced && (
        <div className="card-list borrow-agreement-list" style={{ marginTop: 12 }}>
          <div className="pill">Interest is floating: debt grows with the pool's utilization-based borrow rate until repaid.</div>
          <div className="pill">The origination fee is deducted from the USDC you receive.</div>
          <div className="pill">
            Loans are non-recourse: the escrowed stream is the only collateral. If the loan is not
            repaid by maturity + grace period, or debt exceeds the liquidation threshold, anyone can
            start a Dutch auction of the stream NFT. Any auction surplus is claimable by you.
          </div>
        </div>
      )}

      {showTerms && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Loan agreement">
          <div className="modal holo-card" style={{ maxWidth: 920 }}>
            <div className="section-head">
              <div>
                <h3 className="section-title">Loan Terms and Risk Disclosure</h3>
                <div className="section-subtitle">Scroll to the end to enable loan creation.</div>
              </div>
              <button className="button ghost" type="button" onClick={() => setShowTerms(false)}>
                Close
              </button>
            </div>
            <div
              ref={termsScrollRef}
              onScroll={handleTermsScroll}
              style={{
                maxHeight: 360,
                overflow: 'auto',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                padding: 12,
                background: 'var(--surface-soft)'
              }}
            >
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{loanTermsDoc}</pre>
            </div>
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <span className={`tag ${termsScrolledToEnd ? 'success' : ''}`}>
                {termsScrolledToEnd ? 'Scrolled to end' : 'Scroll required'}
              </span>
              <button
                className="button"
                type="button"
                onClick={() => setShowTerms(false)}
                disabled={!termsScrolledToEnd}
              >
                I have read this
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="form-grid">
        <div className="form-field">
          <span className="section-subtitle">Full agreement</span>
          <div className="inline-actions" style={{ marginTop: 8 }}>
            <button className="button ghost" type="button" onClick={openTermsModal}>
              Open loan agreement (required)
            </button>
            <span className={`tag ${termsViewed ? 'success' : ''}`}>
              {termsViewed ? 'Opened' : 'Not opened'}
            </span>
            <span className={`tag ${termsScrolledToEnd ? 'success' : ''}`}>
              {termsScrolledToEnd ? 'Scrolled' : 'Not scrolled'}
            </span>
          </div>
        </div>
        <label className="form-field">
          I agree to the loan terms and repayment policy
          <input
            type="checkbox"
            className="form-checkbox"
            checked={agreeTerms}
            onChange={(event) => setAgreeTerms(event.target.checked)}
          />
        </label>
      </div>

      <div className="inline-actions borrow-actions-cta">
        <button
          className="button ghost"
          type="button"
          onClick={handleApproveNft}
          disabled={busy || approveState === 'Pending' || approveState === 'Confirming' || !canApprove}
        >
          {nftApproved ? '1. NFT Approved' : '1. Approve Stream NFT'}
        </button>
        <button
          className="button"
          type="button"
          onClick={handleBorrow}
          data-guide-id="borrow-create-loan"
          disabled={busy || !canBorrow}
        >
          2. Create Loan
        </button>
        {openedLoanId && (
          <button
            className="button ghost"
            type="button"
            onClick={() => navigate(`/repay?loanId=${openedLoanId}`)}
          >
            Manage loan #{openedLoanId}
          </button>
        )}
      </div>
      {flowStatus && <div className="muted">{flowStatus}</div>}
    </div>
  );
}
