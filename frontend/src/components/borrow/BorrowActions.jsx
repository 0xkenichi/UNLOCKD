// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSimulateContract,
  useSignTypedData,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import {
  erc20Abi,
  getContractAddress,
  lendingPoolAbi,
  loanManagerAbi,
  sablierV2LockupAbi,
  vestingAdapterAbi,
  vestingWalletAbi
} from '../../utils/contracts.js';
import { getEvmChainById } from '../../utils/chains.js';
import { LOAN_NFT_ABI, getLoanNFTAddress } from '../../utils/loanNFT.js';
import { decodeEventLog } from 'viem';
import { toUnits } from '../../utils/format.js';
import { acceptMatchOffer, apiGet, apiPost, fetchVestedContracts } from '../../utils/api.js';
import { makeRelayerAuth } from '../../utils/privacy.js';
import TxStatusBanner from '../common/TxStatusBanner.jsx';
import { trackEvent } from '../../utils/analytics.js';
import { FEATURE_SABLIER_IMPORT } from '../../utils/featureFlags.js';
import loanTermsDoc from '../../../../docs/LOAN_TERMS_AND_RISK_DISCLOSURE_OUTLINE.md?raw';

const USDC_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STABLE_PRIORITY = ['USDC', 'USDT', 'DAI'];
const MAJOR_PRIORITY = ['ETH', 'SOL', 'BTC'];
const formatPriority = (nativeSymbol) =>
  `${STABLE_PRIORITY.join('/')} → ${MAJOR_PRIORITY.join('/')} (where available) → ${nativeSymbol || 'Native token'
  } → Long-tail tokens`;

const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(value);
const formatBorrowUsd = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(2);
};
const makeCollateralId = () => String(Math.floor(Date.now() / 1000));
const clampPercent = (value) => {
  if (!Number.isFinite(value)) return 100;
  if (value < 1) return 1;
  if (value > 100) return 100;
  return Math.round(value);
};

export default function BorrowActions({
  privacyMode = false,
  prefill,
  onDetails,
  maxBorrowUsd,
  fundingStatus,
  offerBorrowUsd,
  ltvBps,
  selectedOffer,
  matchOffers = [],
  matchLoading = false,
  matchError = '',
  onSelectOffer,
  onBorrowAmountUsdChange,
  matchContext,
  showAdvanced = false,
  onToggleAdvanced,
  detectedPositions = [],
  selectedDetectedFromParent = '',
  onSelectDetectedFromParent
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const vestingAdapter = getContractAddress(chainId, 'vestingAdapter');
  const lendingPool = getContractAddress(chainId, 'lendingPool');
  const nativeSymbol = getEvmChainById(chainId)?.nativeCurrency?.symbol;

  const [collateralId, setCollateralId] = useState(() => {
    const raw = prefill?.collateralId;
    const normalized = raw != null ? String(raw).trim() : '';
    return normalized || makeCollateralId();
  });
  const [vestingContract, setVestingContract] = useState(() => {
    const raw = prefill?.vestingContract;
    return raw != null ? String(raw).trim() : '';
  });
  const [importProtocol, setImportProtocol] = useState('manual');
  const [sablierLockup, setSablierLockup] = useState('');
  const [sablierStreamId, setSablierStreamId] = useState('');
  const [sablierWrapperAddress, setSablierWrapperAddress] = useState('');
  const [borrowAmount, setBorrowAmount] = useState(() => {
    const raw = Number(prefill?.desiredAmountUsd ?? prefill?.borrowAmountUsd ?? 0);
    if (Number.isFinite(raw) && raw > 0) return String(raw);
    return '200';
  });
  const [borrowAgainstPct, setBorrowAgainstPct] = useState(100);
  const [autoBorrow, setAutoBorrow] = useState(true);
  const [autoRepay, setAutoRepay] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [matchAcceptWarning, setMatchAcceptWarning] = useState('');
  const [showTerms, setShowTerms] = useState(false);
  const [termsViewed, setTermsViewed] = useState(false);
  const [termsScrolledToEnd, setTermsScrolledToEnd] = useState(false);
  const [autoFlowStatus, setAutoFlowStatus] = useState('');
  const termsScrollRef = useRef(null);
  const [selectedDetected, setSelectedDetected] = useState('');
  const [volatility, setVolatility] = useState(0);

  useEffect(() => {
    apiGet('/api/simulation/state').then(res => {
      if (res.ok) setVolatility(res.volatility || 0);
    }).catch(() => {});
  }, []);

  const effectiveVestingContract =
    importProtocol === 'sablier' && sablierWrapperAddress
      ? sablierWrapperAddress
      : vestingContract;
  const vestingContractValid = isAddress(effectiveVestingContract);

  const syncDesiredBorrowUsd = (nextBorrowAmount) => {
    if (!onBorrowAmountUsdChange) return;
    const next = Number(nextBorrowAmount);
    if (Number.isFinite(next) && next > 0) {
      onBorrowAmountUsdChange(next);
    } else {
      onBorrowAmountUsdChange(null);
    }
  };

  const borrowUnits = useMemo(
    () => toUnits(borrowAmount, USDC_DECIMALS),
    [borrowAmount]
  );

  useEffect(() => {
    syncDesiredBorrowUsd(borrowAmount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowAmount]);

  const {
    data: vestingDetails,
    isFetching: isDetailsLoading,
    error: detailsError
  } = useReadContract({
    address: vestingAdapter,
    abi: vestingAdapterAbi,
    functionName: 'getDetails',
    args: [BigInt(collateralId || 0)],
    query: {
      enabled: Boolean(vestingAdapter && collateralId)
    }
  });

  // Pre-escrow: read directly from vesting contract when user enters address (so Token Assessment shows token info before escrow)
  const vestingContractForRead = vestingContractValid ? effectiveVestingContract : undefined;
  const { data: vestingPreviewBatch } = useReadContracts({
    contracts: vestingContractForRead
      ? [
        {
          address: vestingContractForRead,
          abi: vestingWalletAbi,
          functionName: 'token'
        },
        {
          address: vestingContractForRead,
          abi: vestingWalletAbi,
          functionName: 'totalAllocation'
        },
        {
          address: vestingContractForRead,
          abi: vestingWalletAbi,
          functionName: 'start'
        },
        {
          address: vestingContractForRead,
          abi: vestingWalletAbi,
          functionName: 'duration'
        }
      ]
      : [],
    query: { enabled: Boolean(vestingContractForRead) }
  });

  const prev0 = vestingPreviewBatch?.[0];
  const prev1 = vestingPreviewBatch?.[1];
  const prev2 = vestingPreviewBatch?.[2];
  const prev3 = vestingPreviewBatch?.[3];
  const previewToken = prev0?.status === 'success' ? prev0.result : undefined;
  const previewTotal = prev1?.status === 'success' ? prev1.result : undefined;
  const previewStart = prev2?.status === 'success' ? prev2.result : undefined;
  const previewDuration = prev3?.status === 'success' ? prev3.result : undefined;

  const { data: previewReleased } = useReadContract({
    address: vestingContractForRead,
    abi: vestingWalletAbi,
    functionName: 'released',
    args: [previewToken],
    query: {
      enabled: Boolean(vestingContractForRead && previewToken)
    }
  });

  const previewQuantity =
    previewTotal != null && previewReleased != null
      ? BigInt(previewTotal) - BigInt(previewReleased)
      : undefined;
  const previewUnlockTime =
    previewStart != null && previewDuration != null
      ? BigInt(previewStart) + BigInt(previewDuration)
      : undefined;

  const quantityRaw = vestingDetails?.[0];
  const tokenAddress = vestingDetails?.[1] ?? previewToken;
  const unlockTimeRaw = vestingDetails?.[2] ?? previewUnlockTime;
  const quantityFromSource = quantityRaw ?? previewQuantity;
  const pledgedCollateralUnits = useMemo(() => {
    if (!quantityFromSource) return 0n;
    const total = BigInt(quantityFromSource);
    if (total <= 0n) return 0n;
    const pct = BigInt(clampPercent(borrowAgainstPct));
    const partial = (total * pct) / 100n;
    return partial > 0n ? partial : 1n;
  }, [quantityFromSource, borrowAgainstPct]);
  const tokenAddressValid =
    typeof tokenAddress === 'string' &&
    isAddress(tokenAddress) &&
    tokenAddress !== ZERO_ADDRESS;
  const verified =
    Boolean(quantityRaw) &&
    tokenAddressValid &&
    Boolean(unlockTimeRaw) &&
    Number(unlockTimeRaw) > 0;
  const hasPreview =
    Boolean(quantityFromSource) &&
    tokenAddressValid &&
    Boolean(unlockTimeRaw) &&
    Number(unlockTimeRaw) > 0;

  const { data: tokenDecimals } = useReadContract({
    address: tokenAddressValid ? tokenAddress : undefined,
    abi: erc20Abi,
    functionName: 'decimals',
    query: {
      enabled: tokenAddressValid
    }
  });

  // Internal detection logic removed; now passed via props from Borrow.jsx

  // Sync with parent selection
  useEffect(() => {
    if (selectedDetectedFromParent && selectedDetectedFromParent !== selectedDetected) {
      setSelectedDetected(selectedDetectedFromParent);
      const picked = detectedPositions.find(
        (item) => `${item.collateralId}:${item.vestingContract}` === selectedDetectedFromParent
      );
      if (picked) {
        setImportProtocol('manual');
        setCollateralId(String(picked.collateralId || ''));
        setVestingContract(String(picked.vestingContract || ''));
      }
    }
  }, [selectedDetectedFromParent, detectedPositions, selectedDetected]);

  const [autoSelected, setAutoSelected] = useState(false);
  useEffect(() => {
    if (detectedPositions.length > 0 && !vestingContract && !selectedDetected && !autoSelected) {
      const first = detectedPositions[0];
      const val = `${first.collateralId}:${first.vestingContract}`;
      setSelectedDetected(val);
      if (onSelectDetectedFromParent) onSelectDetectedFromParent(val);
      setImportProtocol('manual');
      setCollateralId(String(first.collateralId || ''));
      setVestingContract(String(first.vestingContract || ''));
      setAutoSelected(true);
      trackEvent('vesting_auto_selected', { collateralId: first.collateralId });
    }
  }, [detectedPositions, vestingContract, selectedDetected, autoSelected, onSelectDetectedFromParent]);

  useEffect(() => {
    if (!onDetails) return;
    if (!verified && !hasPreview) {
      onDetails(null);
      return;
    }
    onDetails({
      collateralId,
      vestingContract: effectiveVestingContract,
      quantity: quantityFromSource,
      tokenAddress,
      unlockTime: unlockTimeRaw,
      tokenDecimals,
      verified
    });
  }, [
    onDetails,
    collateralId,
    effectiveVestingContract,
    quantityFromSource,
    tokenAddress,
    unlockTimeRaw,
    tokenDecimals,
    verified,
    hasPreview
  ]);

  useEffect(() => {
    if (!autoBorrow) return;
    if (!maxBorrowUsd || !Number.isFinite(maxBorrowUsd)) return;
    const targetBorrow = maxBorrowUsd * (borrowAgainstPct / 100);
    const next = formatBorrowUsd(targetBorrow);
    if (next && next !== borrowAmount) {
      setBorrowAmount(next);
    }
  }, [autoBorrow, borrowAmount, borrowAgainstPct, maxBorrowUsd]);

  useEffect(() => {
    if (!offerBorrowUsd || !Number.isFinite(offerBorrowUsd)) return;
    const next = formatBorrowUsd(offerBorrowUsd);
    if (next && next !== borrowAmount) {
      if (maxBorrowUsd && Number.isFinite(maxBorrowUsd) && maxBorrowUsd > 0) {
        const pct = clampPercent((offerBorrowUsd / maxBorrowUsd) * 100);
        setBorrowAgainstPct(pct);
      }
      setAutoBorrow(false);
      setBorrowAmount(next);
    }
  }, [offerBorrowUsd, borrowAmount, maxBorrowUsd]);

  useEffect(() => {
    if (!maxBorrowUsd || !Number.isFinite(maxBorrowUsd) || maxBorrowUsd <= 0) return;
    const enteredBorrow = Number(borrowAmount);
    if (!Number.isFinite(enteredBorrow) || enteredBorrow <= 0) return;
    const pct = clampPercent((enteredBorrow / maxBorrowUsd) * 100);
    if (pct !== borrowAgainstPct) {
      setBorrowAgainstPct(pct);
    }
  }, [borrowAmount, maxBorrowUsd, borrowAgainstPct]);

  const {
    data: borrowHash,
    writeContract: writeBorrow,
    writeContractAsync: writeBorrowAsync,
    isPending: isBorrowPending,
    error: borrowError
  } = useWriteContract();

  const { signTypedDataAsync } = useSignTypedData();

  const {
    data: borrowReceipt,
    isLoading: isBorrowMining,
    isSuccess: borrowConfirmed,
    error: borrowReceiptError
  } = useWaitForTransactionReceipt({ hash: borrowHash });

  const [isMintingProof, setIsMintingProof] = useState(false);
  const [mintProofHash, setMintProofHash] = useState('');
  const { writeContractAsync: writeNftAsync } = useWriteContract();

  const hasWallet = Boolean(address);
  const hasGas = fundingStatus?.hasGas ?? true;
  const fundingReady = fundingStatus?.ready ?? true;
  const collateralIdValid = Boolean(collateralId) && Number(collateralId) > 0;
  const borrowValid = Boolean(borrowUnits) && borrowUnits > 0n;
  const termsGateReady = termsViewed && termsScrolledToEnd && agreeTerms;
  const offerGateOk =
    !matchOffers?.length || (selectedOffer && selectedOffer.canAccess !== false);
  const canBorrow =
    Boolean(loanManager) &&
    hasWallet &&
    collateralIdValid &&
    vestingContractValid &&
    borrowValid &&
    pledgedCollateralUnits > 0n &&
    hasPreview &&
    fundingReady &&
    termsGateReady &&
    offerGateOk;

  const MAX_UINT256 = (1n << 256n) - 1n;
  const erc20ApprovalAbi = useMemo(
    () => [
      {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' }
        ],
        outputs: [{ name: '', type: 'bool' }]
      },
      {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' }
        ],
        outputs: [{ name: '', type: 'uint256' }]
      }
    ],
    []
  );

  const { data: poolRateBps } = useReadContract({
    address: lendingPool || undefined,
    abi: lendingPoolAbi,
    functionName: 'getInterestRateBps',
    query: { enabled: Boolean(lendingPool) }
  });
  const { data: originationFeeBps } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'originationFeeBps',
    query: { enabled: Boolean(loanManager) }
  });
  const { data: autoRepayBoostBps } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'autoRepayLtvBoostBps',
    query: { enabled: Boolean(loanManager) }
  });
  const { data: autoRepayDiscountBps } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'autoRepayInterestDiscountBps',
    query: { enabled: Boolean(loanManager) }
  });
  const { data: autoRepayRequiredTokens } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'getAutoRepayRequiredTokens',
    query: { enabled: Boolean(loanManager) }
  });
  const { data: autoRepayOptInOnchain } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'autoRepayOptIn',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(loanManager && address) }
  });
  const { data: hasAutoRepayPermissions } = useReadContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'hasAutoRepayPermissions',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(loanManager && address) }
  });

  const requiredTokens = Array.isArray(autoRepayRequiredTokens)
    ? autoRepayRequiredTokens.filter(Boolean)
    : [];

  const requiredAllowances = useReadContracts({
    contracts:
      address && loanManager && requiredTokens.length
        ? requiredTokens.map((token) => ({
          address: token,
          abi: erc20ApprovalAbi,
          functionName: 'allowance',
          args: [address, loanManager]
        }))
        : [],
    query: { enabled: Boolean(address && loanManager && requiredTokens.length) }
  });

  const requiredSymbols = useReadContracts({
    contracts:
      requiredTokens.length
        ? requiredTokens.map((token) => ({
          address: token,
          abi: erc20Abi,
          functionName: 'symbol'
        }))
        : [],
    query: { enabled: Boolean(requiredTokens.length) }
  });

  const tokenApprovalRows = useMemo(() => {
    return requiredTokens.map((token, idx) => {
      const allowanceRow = requiredAllowances.data?.[idx];
      const allowance =
        allowanceRow?.status === 'success' ? allowanceRow.result : 0n;
      const symbolRow = requiredSymbols.data?.[idx];
      const symbol =
        symbolRow?.status === 'success' ? symbolRow.result : token?.slice(0, 6);
      return {
        token,
        symbol,
        allowance,
        ok: allowance > 0n
      };
    });
  }, [requiredTokens, requiredAllowances.data, requiredSymbols.data]);

  const permissionsComplete =
    requiredTokens.length === 0 ? true : tokenApprovalRows.every((row) => row.ok);

  const ltvBase = typeof ltvBps === 'bigint' ? ltvBps : BigInt(ltvBps || 0);
  const boost = typeof autoRepayBoostBps === 'bigint' ? autoRepayBoostBps : BigInt(autoRepayBoostBps || 0);
  const discount = typeof autoRepayDiscountBps === 'bigint' ? autoRepayDiscountBps : BigInt(autoRepayDiscountBps || 0);
  const baseRate = typeof poolRateBps === 'bigint' ? poolRateBps : BigInt(poolRateBps || 0);
  const origFee = typeof originationFeeBps === 'bigint' ? originationFeeBps : BigInt(originationFeeBps || 0);

  const ltvWithPerm = ltvBase > 0n ? (ltvBase + boost > 10000n ? 10000n : ltvBase + boost) : 0n;
  const maxBorrowWithPerm =
    ltvBase > 0n && Number(maxBorrowUsd || 0) > 0
      ? Number(maxBorrowUsd) * Number(ltvWithPerm) / Number(ltvBase)
      : Number(maxBorrowUsd || 0);

  const discountedRate = baseRate > discount ? baseRate - discount : 0n;
  const borrowUsdNum = Number(borrowAmount || 0);
  const feeStandard = borrowUsdNum * Number(baseRate + origFee) / 10000;
  const feeWithPerm = borrowUsdNum * Number(discountedRate + origFee) / 10000;

  const borrowDisabledReason = (() => {
    if (!hasWallet) return 'Connect a wallet to create a loan.';
    if (!hasGas) return 'Add gas to cover transaction fees.';
    if (!loanManager) return 'Unsupported network for loan creation.';
    if (!collateralIdValid) return 'Enter a valid collateral ID.';
    if (!vestingContractValid) return 'Enter a valid vesting contract address.';
    if (!hasPreview) {
      if (vestingContractValid) {
        return 'Vesting contract not readable on current network (or collateral not found for this ID).';
      }
      return 'Enter a valid vesting position to preview collateral.';
    }
    if (!borrowValid) return 'Enter a borrow amount.';
    if (pledgedCollateralUnits <= 0n) return 'Choose collateral amount to pledge.';
    if (!fundingReady) return fundingStatus?.reason || 'Fund your wallet first.';
    if (!permissionsComplete) return 'You must approve the Secondary Asset Recourse to protect lenders from default deficits.';
    if (!termsViewed) return 'Open the full loan agreement to continue.';
    if (!termsScrolledToEnd) return 'Scroll to the end of the loan agreement to continue.';
    if (!agreeTerms) return 'Accept the loan agreement to continue.';
    if (matchOffers?.length && !selectedOffer) return 'Select a pool offer to continue.';
    if (selectedOffer && selectedOffer.canAccess === false) {
      return 'Selected offer is peek-only for your wallet. Choose an accessible pool.';
    }
    return '';
  })();

  const { error: borrowSimError } = useSimulateContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'createLoanWithCollateralAmount',
    args: [
      BigInt(collateralId || 0),
      effectiveVestingContract,
      borrowUnits || 0n,
      pledgedCollateralUnits
    ],
    account: address,
    query: {
      enabled: Boolean(canBorrow)
    }
  });

  useEffect(() => {
    const processMint = async () => {
      if (borrowConfirmed && borrowReceipt && address) {
        if (isMintingProof || mintProofHash) return;
        try {
          setIsMintingProof(true);
          setAutoFlowStatus('Generating IPFS metadata...');
          
          let loanId = 0n;
          if (borrowReceipt.logs) {
            for (const log of borrowReceipt.logs) {
              try {
                const decoded = decodeEventLog({
                  abi: loanManagerAbi,
                  data: log.data,
                  topics: log.topics
                });
                if (decoded.eventName === 'LoanCreated') {
                  loanId = decoded.args.loanId;
                  break;
                }
              } catch(e) {}
            }
          }

          const ipfsResp = await apiPost('/api/loans/ipfs-metadata', {
            borrower: address,
            loanId: Number(loanId),
            principal: borrowUnits.toString(),
            ltvBps: ltvBps ? Number(ltvBps) : 0,
            timestamp: Date.now()
          });
          const tokenURI = ipfsResp.uri || 'ipfs://placeholder';

          setAutoFlowStatus('Minting vLOAN NFT Proof...');
          const nftAddress = getLoanNFTAddress(chainId);
          const tx = await writeNftAsync({
            address: nftAddress,
            abi: LOAN_NFT_ABI,
            functionName: 'mintProof',
            args: [
              address,
              loanId,
              borrowUnits,
              pledgedCollateralUnits,
              ltvBps || 0n,
              0n, // omegaBps placeholder
              'ipfs://VESTRA-TERMS-V1',
              tokenURI
            ]
          });
          setMintProofHash(tx);
          toast.success('vLOAN NFT Minted Successfully!');
          setAutoFlowStatus('');
          trackEvent('borrow_create_confirmed', { chainId });
        } catch (err) {
          console.error('Minting failed', err);
          toast.error('NFT Mint Failed');
          setAutoFlowStatus('');
        } finally {
          setIsMintingProof(false);
        }
      }
    };
    processMint();
  }, [borrowConfirmed, borrowReceipt, chainId, address, borrowUnits, pledgedCollateralUnits, ltvBps, isMintingProof, mintProofHash, writeNftAsync]);

  const {
    data: approvalHash,
    writeContract: writeApproval,
    writeContractAsync: writeApprovalAsync,
    isPending: isApprovalPending,
    error: approvalError
  } = useWriteContract();
  const {
    data: optInHash,
    writeContract: writeOptIn,
    writeContractAsync: writeOptInAsync,
    isPending: isOptInPending,
    error: optInError
  } = useWriteContract();

  const approveToken = (token) => {
    if (!token || !loanManager) return;
    setPermissionError('');
    writeApproval({
      address: token,
      abi: erc20ApprovalAbi,
      functionName: 'approve',
      args: [loanManager, MAX_UINT256]
    });
  };

  const setOptIn = (enabled) => {
    if (!loanManager) return;
    setPermissionError('');
    writeOptIn({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'setAutoRepayOptIn',
      args: [Boolean(enabled)]
    });
  };

  const openTermsModal = () => {
    setShowTerms(true);
    setTermsViewed(true);
    setTermsScrolledToEnd(false);
    setTimeout(() => {
      if (termsScrollRef.current) {
        termsScrollRef.current.scrollTop = 0;
      }
    }, 0);
  };

  const handleTermsScroll = () => {
    const el = termsScrollRef.current;
    if (!el) return;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    if (atEnd) setTermsScrolledToEnd(true);
  };

  const waitForTxReceipt = async (hash) => {
    if (!hash || !publicClient) return null;
    return publicClient.waitForTransactionReceipt({ hash });
  };

  const handleCreateLoanStandard = async () => {
    if (!canBorrow) return;
    setPermissionError('');
    setMatchAcceptWarning('');
    setAutoFlowStatus('');
    trackEvent('borrow_start', {
      collateralId,
      vestingContract: effectiveVestingContract,
      borrowAmountUsdc: borrowAmount,
      utilizationPct: borrowAgainstPct,
      mode: 'standard'
    });
    // Best-effort: persist offchain match metadata before onchain tx.
    if (
      selectedOffer?.offerId &&
      selectedOffer?.poolId &&
      matchContext?.chain &&
      selectedOffer?.canAccess !== false
    ) {
      acceptMatchOffer({
        offerId: String(selectedOffer.offerId),
        poolId: String(selectedOffer.poolId),
        chain: matchContext.chain,
        borrower: privacyMode ? undefined : address || undefined,
        collateralId: matchContext.collateralId || collateralId || undefined,
        desiredAmountUsd: Number(borrowAmount || 0),
        terms: {
          interestBps: selectedOffer.interestBps,
          maxBorrowUsd: selectedOffer.maxBorrowUsd,
          riskTier: selectedOffer.riskTier,
          accessType: selectedOffer.accessType,
          score: selectedOffer.score
        }
      }).catch((error) => {
        // Non-fatal: onchain tx should still proceed.
        setMatchAcceptWarning(
          error?.message
            ? `Could not persist offer selection (continuing onchain): ${error.message}`
            : 'Could not persist offer selection (continuing onchain).'
        );
      });
    }

    if (privacyMode) {
      try {
        setAutoFlowStatus('Submitting private loan via relayer...');
        if (!signTypedDataAsync || !address) {
          throw new Error('Wallet signature unavailable for private-mode relayer auth.');
        }
        const vaultResp = await apiGet('/api/privacy/evm/vault');
        const vaultAddress = vaultResp?.vaultAddress || '';
        if (!vaultAddress) {
          throw new Error('No private vault registered. Run Privacy Upgrade first.');
        }
        const payload = {
          collateralId: String(collateralId || 0),
          vestingContract: effectiveVestingContract,
          borrowAmount: borrowUnits.toString(),
          collateralAmount: pledgedCollateralUnits.toString()
        };
        const auth = makeRelayerAuth({
          chainId,
          verifyingContract: loanManager,
          user: address,
          vault: vaultAddress,
          action: 'create-private-loan',
          payload
        });
        const signature = await signTypedDataAsync(auth.typedData);
        const result = await apiPost('/api/relayer/evm/create-private-loan', {
          ...payload,
          signature,
          nonce: auth.nonce,
          issuedAt: auth.issuedAt,
          expiresAt: auth.expiresAt,
          payloadHash: auth.payloadHash
        });
        setAutoFlowStatus(
          result?.txHash
            ? `Relayer tx submitted: ${String(result.txHash).slice(0, 10)}…`
            : 'Relayer tx submitted.'
        );
      } catch (error) {
        setAutoFlowStatus('');
        setPermissionError(error?.message || 'Private-mode relayer submission failed.');
      }
      return;
    }

    writeBorrow({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'createLoanWithCollateralAmount',
      args: [
        BigInt(collateralId || 0),
        effectiveVestingContract,
        borrowUnits,
        pledgedCollateralUnits
      ],
      gas: 1_000_000n
    });
  };

  const handleCreateLoanBestTerms = async () => {
    if (!canBorrow) return;
    setPermissionError('');
    setMatchAcceptWarning('');
    setAutoFlowStatus('Preparing best-terms flow...');

    if (privacyMode) {
      setPermissionError('Best-terms automation is not yet supported in private mode.');
      setAutoFlowStatus('');
      return;
    }

    if (!autoRepay) {
      setPermissionError('Enable auto-repay to use best-terms automation.');
      setAutoFlowStatus('');
      return;
    }

    if (!requiredTokens.length) {
      setPermissionError('No required tokens configured for auto-repay on this network yet.');
      setAutoFlowStatus('');
      return;
    }

    try {
      // Best-effort: persist offchain match metadata before onchain tx.
      if (
        selectedOffer?.offerId &&
        selectedOffer?.poolId &&
        matchContext?.chain &&
        selectedOffer?.canAccess !== false
      ) {
        setAutoFlowStatus('Recording selected offer...');
        await acceptMatchOffer({
          offerId: String(selectedOffer.offerId),
          poolId: String(selectedOffer.poolId),
          chain: matchContext.chain,
          borrower: privacyMode ? undefined : address || undefined,
          collateralId: matchContext.collateralId || collateralId || undefined,
          desiredAmountUsd: Number(borrowAmount || 0),
          terms: {
            interestBps: selectedOffer.interestBps,
            maxBorrowUsd: selectedOffer.maxBorrowUsd,
            riskTier: selectedOffer.riskTier,
            accessType: selectedOffer.accessType,
            score: selectedOffer.score
          }
        });
      }

      // 1) Verify Recourse Approvals are complete
      if (!permissionsComplete) {
        setPermissionError('Secondary Asset Approval is missing. Please approve recourse above.');
        setAutoFlowStatus('');
        return;
      }

      // 2) Create the loan.
      setAutoFlowStatus('Creating loan...');
      trackEvent('borrow_start', {
        collateralId,
        vestingContract: effectiveVestingContract,
        borrowAmountUsdc: borrowAmount,
        utilizationPct: borrowAgainstPct,
        mode: 'best_terms'
      });
      const hash = await writeBorrowAsync({
        address: loanManager,
        abi: loanManagerAbi,
        functionName: 'createLoanWithCollateralAmount',
        args: [
          BigInt(collateralId || 0),
          effectiveVestingContract,
          borrowUnits,
          pledgedCollateralUnits
        ],
        gas: 1_000_000n
      });
      await waitForTxReceipt(hash);
      setAutoFlowStatus('Submitted. Waiting for confirmation...');
    } catch (error) {
      setAutoFlowStatus('');
      setPermissionError(error?.shortMessage || error?.message || 'Best-terms flow failed.');
    }
  };

  return (
    <div className="holo-card borrow-actions-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Borrow Actions</h3>
          <div className="section-subtitle">
            Review your vesting collateral, then create a loan (pool creation alone does not move USDC).
          </div>
        </div>
        <span className={`tag ${verified ? 'success' : ''}`}>
          {hasPreview ? 'Ready' : 'Pending'}
        </span>
        {volatility > 10 && (
          <span className="tag info animate-pulse" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.4)' }}>
            MeTTA Optimized
          </span>
        )}
      </div>


      {autoSelected && verified && (
        <div className="holo-card success-banner" style={{ marginBottom: 16, border: '1px solid var(--color-success)' }}>
          <div className="stack-row" style={{ gap: 12 }}>
            <span className="w-2 h-2 bg-success rounded-full animate-pulse"></span>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-success">Vesting Detected</div>
              <p className="muted text-[10px]">Automatically linked your {detectedPositions[0]?.tokenSymbol || 'collateral'} position from your wallet.</p>
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
              <div>Collateral</div>
              <div>Token</div>
            </div>
            <div className="table-row">
              <div>
                {detailsError
                  ? 'Error'
                  : verified
                    ? 'Verified'
                    : hasPreview
                      ? 'Preview'
                      : isDetailsLoading
                        ? 'Reading'
                        : 'Waiting'}
              </div>
              <div>
                {verified
                  ? new Date(Number(unlockTimeRaw) * 1000).toLocaleDateString()
                  : '--'}
              </div>
              <div>{collateralId || '--'}</div>
              <div>{tokenAddressValid ? tokenAddress : '--'}</div>
            </div>
          </div>
          <div className="section-head" style={{ marginTop: 14 }}>
            <div>
              <h3 className="section-title">Pool Offer</h3>
              <div className="section-subtitle">
                Choose a lender pool match. Offers are advisory in this MVP; settlement is Base-only.
              </div>
            </div>
            <span className="tag">Matcher</span>
          </div>
          {matchError && <div className="error-banner">{matchError}</div>}
          {matchLoading && <div className="muted">Fetching pool offers…</div>}
          {!matchLoading && (!matchOffers || matchOffers.length === 0) && (
            <div className="muted">
              No offers yet. Lenders create pools on the Lender page.
            </div>
          )}
          {Boolean(matchOffers?.length) && (
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label className="form-field">
                Select offer
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
                  <option value="">Choose a pool offer</option>
                  {matchOffers.map((offer) => {
                    const name = offer.poolName || `${offer.poolId?.slice?.(0, 8) || 'pool'}...`;
                    const accessLabel = offer.canAccess ? (offer.accessType || 'open') : 'peek-only';
                    const maxLabel = Number(offer.maxBorrowUsd || 0).toFixed(0);
                    return (
                      <option key={offer.offerId} value={String(offer.offerId)}>
                        {name} · {accessLabel} · max ${maxLabel}
                      </option>
                    );
                  })}
                </select>
                <div className="muted" style={{ marginTop: 6 }}>
                  {selectedOffer
                    ? `Selected: ${selectedOffer.poolName || selectedOffer.poolId?.slice(0, 8)}...`
                    : 'Pick an offer to proceed.'}
                </div>
              </label>
              <div className="form-field">
                Selected max borrow
                <div className="form-value">
                  {selectedOffer ? `$${Number(selectedOffer.maxBorrowUsd || 0).toFixed(2)}` : '--'}
                </div>
              </div>
              <div className="form-field">
                Interest (bps)
                <div className="form-value">
                  {selectedOffer ? Number(selectedOffer.interestBps || 0) : '--'}
                </div>
              </div>
              <div className="form-field">
                Risk tier
                <div className="form-value">
                  {selectedOffer?.riskTier || '--'}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {(borrowError || borrowReceiptError) && (
        <div className="error-banner">
          {borrowReceiptError?.message || borrowError?.message}
        </div>
      )}
      {(approvalError || optInError) && (
        <div className="error-banner">
          {optInError?.message || approvalError?.message}
        </div>
      )}
      {permissionError && <div className="error-banner">{permissionError}</div>}
      {matchAcceptWarning && <div className="muted">{matchAcceptWarning}</div>}
      {borrowSimError && (
        <div className="muted">
          Simulation: {borrowSimError.shortMessage || borrowSimError.message}
        </div>
      )}
      <TxStatusBanner
        label="Loan Transaction"
        hash={borrowHash}
        status={
          borrowConfirmed
            ? 'Confirmed'
            : isBorrowMining
              ? 'Confirming'
              : isBorrowPending
                ? 'Pending'
                : ''
        }
      />
      {borrowDisabledReason && (
        <div className="muted">{borrowDisabledReason}</div>
      )}
      {showAdvanced && (
        <div className="form-field import-protocol-section">
          <span className="section-subtitle">Collateral source</span>
          <div className="stack-row" style={{ gap: 8, marginTop: 6 }}>
            <button
              type="button"
              className={`button ghost ${importProtocol === 'manual' ? 'active' : ''}`}
              onClick={() => setImportProtocol('manual')}
            >
              Manual
            </button>
            {FEATURE_SABLIER_IMPORT && (
              <button
                type="button"
                className={`button ghost ${importProtocol === 'sablier' ? 'active' : ''}`}
                onClick={() => setImportProtocol('sablier')}
              >
                Import from Sablier v2
              </button>
            )}
          </div>
          {importProtocol === 'sablier' && FEATURE_SABLIER_IMPORT && (
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label className="form-field">
                Lockup contract
                <input
                  className="form-input"
                  value={sablierLockup}
                  onChange={(e) => setSablierLockup(e.target.value)}
                  placeholder="0x..."
                />
              </label>
              <label className="form-field">
                Stream ID
                <input
                  className="form-input"
                  value={sablierStreamId}
                  onChange={(e) => setSablierStreamId(e.target.value)}
                  inputMode="numeric"
                  placeholder="Enter stream ID"
                />
              </label>
              <label className="form-field">
                Wrapper address
                <input
                  className="form-input"
                  value={sablierWrapperAddress}
                  onChange={(e) => setSablierWrapperAddress(e.target.value)}
                  placeholder="Paste SablierV2OperatorWrapper address (0x...)"
                />
              </label>
            </div>
          )}
          {importProtocol === 'sablier' && FEATURE_SABLIER_IMPORT && (
            <p className="muted" style={{ marginTop: 8 }}>
              Use a Sablier stream wrapper so we can escrow your claim. Deploy one with{' '}
              <code>SEED_SABLIER=1 npx hardhat run scripts/seed-sepolia-vesting.js --network sepolia</code> or paste an existing wrapper address.
            </p>
          )}
        </div>
      )}
      <div className="form-grid">
        {(showAdvanced || (detectedPositions && detectedPositions.length > 0)) && (
          <label className="form-field">
            {detectedPositions?.length > 0 ? "Switch position (detected)" : "Vesting selection"}
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
                setImportProtocol('manual');
                setCollateralId(String(picked.collateralId || ''));
                setVestingContract(String(picked.vestingContract || ''));
              }}
            >
              <option value="">{detectedPositions?.length > 0 ? "Choose detected collateral" : "Select detected collateral (optional)"}</option>
              {detectedPositions?.map((item) => (
                <option
                  key={`${item.loanId || item.collateralId}-${item.vestingContract}`}
                  value={`${item.collateralId}:${item.vestingContract}`}
                >
                  {(item.tokenSymbol || 'Token').toString()} · ID {String(item.collateralId)} · unlock{' '}
                  {item.unlockTime ? new Date(Number(item.unlockTime) * 1000).toLocaleDateString() : '--'}
                </option>
              ))}
            </select>
          </label>
        )}
        {showAdvanced && (
          <>
            <label className="form-field">
              Collateral ID
              <input
                className="form-input"
                value={collateralId}
                onChange={(event) => setCollateralId(event.target.value)}
                inputMode="numeric"
              />
              <div className="inline-actions" style={{ marginTop: 8 }}>
                <button
                  className="button ghost"
                  type="button"
                  onClick={() => setCollateralId(makeCollateralId())}
                >
                  Generate New ID
                </button>
              </div>
            </label>
            {(importProtocol === 'manual' || !FEATURE_SABLIER_IMPORT) && (
              <label className="form-field">
                Vesting Contract
                <input
                  className="form-input"
                  value={vestingContract}
                  onChange={(event) => setVestingContract(event.target.value)}
                  placeholder="0x..."
                />
              </label>
            )}
          </>
        )}
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
          Borrow Against Collateral (% of max)
          <input
            className="form-input"
            type="range"
            min="1"
            max="100"
            step="1"
            value={borrowAgainstPct}
            aria-label="Borrow percentage of max collateral capacity"
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
            {borrowAgainstPct}% of max borrow capacity
          </div>
        </label>
      </div>
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
        <button
          className="button"
          type="button"
          onClick={() => setAutoBorrow((prev) => !prev)}
        >
          {autoBorrow ? 'Auto-fill On' : 'Auto-fill Off'}
        </button>
      </div>
      <div className="muted">
        Loan utilization target: ~{borrowAgainstPct}% of collateral borrowing power.
      </div>

      {!showAdvanced && verified && (
        <div className="pill" style={{ marginBottom: 16 }}>
          Linked: {detectedPositions?.find?.(p => `${p.collateralId}:${p.vestingContract}` === selectedDetected)?.tokenSymbol || 'Vesting Position'} · ID {collateralId}
        </div>
      )}

      {showAdvanced && (
        <>
          <div className="section-head">
            <div>
              <h3 className="section-title">Institutional Recourse Agreement</h3>
              <div className="section-subtitle">Read before signing with your wallet</div>
            </div>
            <span className="tag warning">Strict Recourse</span>
          </div>

          <div className="card-list borrow-agreement-list">
            <div className="pill">Debt due at unlock: principal + interest + origination fee.</div>
            <div className="pill" style={{ color: '#ff4d4f', borderColor: 'rgba(255, 77, 79, 0.3)' }}>
              <strong>Absolute Accountability:</strong> If the token crashes and causes a deficit on default, Vestra will automatically execute `sweepSecondaryAssets` to seize WETH/USDC from your wallet.
            </div>
            <div className="pill">
              MVP support: loans settle on Base. Solana vesting streams can be discovered/scored, but settlement remains Base-only.
            </div>
            <div className="pill">
              Strategic Liquidation: Defaults will trigger a 7-day Time-Released Fractional Auction rather than a market-dumping Dutch Auction.
            </div>
          </div>
        </>
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
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: 12,
                background: 'rgba(10,14,20,0.44)'
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

      {(showAdvanced || !permissionsComplete) && (
        <div className="holo-card" style={{ marginTop: 12, border: '1px solid rgba(255, 77, 79, 0.3)' }}>
          <div className="section-head">
            <div>
              <h4 className="section-title" style={{ color: '#ff4d4f' }}>Secondary Asset Recourse Approval</h4>
              <div className="section-subtitle">Mandatory for Institutional Liquidity Protection.</div>
            </div>
            <span className={`tag ${permissionsComplete ? 'success' : 'danger'}`}>
              {permissionsComplete ? 'Approved' : 'Missing Approvals'}
            </span>
          </div>

          <div className="muted" style={{ marginTop: 10 }}>
            You must pre-approve the Protocol to sweep the following reserve assets from your wallet. These will ONLY be seized if your loan defaults AND there is a systemic deficit.
          </div>

          {!requiredTokens.length ? (
            <div className="muted" style={{ marginTop: 8 }}>
              No secondary assets configured by the protocol yet. Ready to proceed.
            </div>
          ) : (
            <div className="card-list" style={{ marginTop: 10 }}>
              {tokenApprovalRows.map((row) => (
                <div key={row.token} className="pill" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, border: row.ok ? '' : '1px solid rgba(255, 77, 79, 0.3)' }}>
                  <span>
                    <strong>{row.symbol}</strong> {row.ok ? 'Recourse Approved' : 'Recourse Required'}
                  </span>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() => approveToken(row.token)}
                    disabled={row.ok || isApprovalPending || !hasWallet}
                    style={row.ok ? {} : { color: '#ff4d4f', borderColor: '#ff4d4f' }}
                  >
                    {row.ok ? 'Approved' : 'Approve Recourse'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <TxStatusBanner
            label="Permissions Tx"
            hash={approvalHash}
            status={isApprovalPending ? 'Pending' : ''}
          />
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
          Auto-repay at unlock (wallet sweep)
          <input
            type="checkbox"
            className="form-checkbox"
            checked={autoRepay}
            onChange={(event) => setAutoRepay(event.target.checked)}
          />
        </label>
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

      <div className="muted">
        Repayment priority: {formatPriority(nativeSymbol)}
      </div>

      <div className="inline-actions borrow-actions-cta">
        <button
          className="button"
          type="button"
          onClick={handleCreateLoanBestTerms}
          data-guide-id="borrow-create-loan"
          disabled={isBorrowPending || isMintingProof || !canBorrow}
        >
          Create Loan (Best Terms)
        </button>
        <button
          className="button ghost"
          type="button"
          onClick={handleCreateLoanStandard}
          disabled={isBorrowPending || isMintingProof || !canBorrow}
        >
          Create Loan (Standard)
        </button>
      </div>
      {autoFlowStatus && <div className="muted">{autoFlowStatus}</div>}
    </div>
  );
}
