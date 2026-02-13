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
import {
  erc20Abi,
  getContractAddress,
  loanManagerAbi,
  sablierV2LockupAbi,
  vestingAdapterAbi,
  vestingWalletAbi
} from '../../utils/contracts.js';
import { getEvmChainById } from '../../utils/chains.js';
import { toUnits } from '../../utils/format.js';
import { fetchVestedContracts } from '../../utils/api.js';
import TxStatusBanner from '../common/TxStatusBanner.jsx';
import { trackEvent } from '../../utils/analytics.js';
import { FEATURE_SABLIER_IMPORT } from '../../utils/featureFlags.js';

const USDC_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const STABLE_PRIORITY = ['USDC', 'USDT', 'DAI'];
const MAJOR_PRIORITY = ['ETH', 'SOL', 'BTC'];
const formatPriority = (nativeSymbol) =>
  `${STABLE_PRIORITY.join('/')} → ${MAJOR_PRIORITY.join('/')} (where available) → ${
    nativeSymbol || 'Native token'
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
  onDetails,
  maxBorrowUsd,
  fundingStatus,
  offerBorrowUsd
}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const vestingAdapter = getContractAddress(chainId, 'vestingAdapter');
  const nativeSymbol = getEvmChainById(chainId)?.nativeCurrency?.symbol;

  const [collateralId, setCollateralId] = useState(makeCollateralId);
  const [vestingContract, setVestingContract] = useState('');
  const [importProtocol, setImportProtocol] = useState('manual');
  const [sablierLockup, setSablierLockup] = useState('');
  const [sablierStreamId, setSablierStreamId] = useState('');
  const [sablierWrapperAddress, setSablierWrapperAddress] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('200');
  const [borrowAgainstPct, setBorrowAgainstPct] = useState(100);
  const [autoBorrow, setAutoBorrow] = useState(true);
  const [autoRepay, setAutoRepay] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [detectedPositions, setDetectedPositions] = useState([]);
  const [selectedDetected, setSelectedDetected] = useState('');

  const effectiveVestingContract =
    importProtocol === 'sablier' && sablierWrapperAddress
      ? sablierWrapperAddress
      : vestingContract;
  const vestingContractValid = isAddress(effectiveVestingContract);

  const borrowUnits = useMemo(
    () => toUnits(borrowAmount, USDC_DECIMALS),
    [borrowAmount]
  );

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

  useEffect(() => {
    let active = true;
    const loadDetectedPositions = async () => {
      try {
        const items = await fetchVestedContracts();
        if (!active) return;
        const normalizedAddress = (address || '').toLowerCase();
        const filtered = (items || []).filter((item) => {
          if (!item) return false;
          if (!item.collateralId || !item.vestingContract) return false;
          if (item.active === false) return false;
          if (!normalizedAddress) return true;
          return String(item.borrower || '').toLowerCase() === normalizedAddress;
        });
        setDetectedPositions(filtered);
      } catch {
        if (!active) return;
        setDetectedPositions([]);
      }
    };
    loadDetectedPositions();
    return () => {
      active = false;
    };
  }, [address]);

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
    isPending: isBorrowPending,
    error: borrowError
  } = useWriteContract();

  const {
    isLoading: isBorrowMining,
    isSuccess: borrowConfirmed,
    error: borrowReceiptError
  } = useWaitForTransactionReceipt({ hash: borrowHash });

  const hasWallet = Boolean(address);
  const hasGas = fundingStatus?.hasGas ?? true;
  const fundingReady = fundingStatus?.ready ?? true;
  const collateralIdValid = Boolean(collateralId) && Number(collateralId) > 0;
  const borrowValid = Boolean(borrowUnits) && borrowUnits > 0n;
  const canBorrow =
    Boolean(loanManager) &&
    hasWallet &&
    collateralIdValid &&
    vestingContractValid &&
    borrowValid &&
    pledgedCollateralUnits > 0n &&
    hasPreview &&
    fundingReady &&
    agreeTerms;

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
    if (!agreeTerms) return 'Accept the loan agreement to continue.';
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
    if (borrowConfirmed) {
      trackEvent('borrow_create_confirmed', { chainId });
    }
  }, [borrowConfirmed, chainId]);

  const handleBorrow = () => {
    if (!canBorrow) return;
    trackEvent('borrow_start', {
      collateralId,
      vestingContract: effectiveVestingContract,
      borrowAmountUsdc: borrowAmount,
      utilizationPct: borrowAgainstPct
    });
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
      </div>
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
      {(borrowError || borrowReceiptError) && (
        <div className="error-banner">
          {borrowReceiptError?.message || borrowError?.message}
        </div>
      )}
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
      <div className="form-grid">
        <label className="form-field">
          Detected vesting positions
          <select
            className="form-select"
            value={selectedDetected}
            onChange={(event) => {
              const next = event.target.value;
              setSelectedDetected(next);
              const picked = detectedPositions.find(
                (item) => `${item.collateralId}:${item.vestingContract}` === next
              );
              if (!picked) return;
              setImportProtocol('manual');
              setCollateralId(String(picked.collateralId || ''));
              setVestingContract(String(picked.vestingContract || ''));
            }}
          >
            <option value="">Select detected collateral (optional)</option>
            {detectedPositions.map((item) => (
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
      <div className="section-head">
        <div>
          <h3 className="section-title">Loan Agreement</h3>
          <div className="section-subtitle">Read before signing with your wallet</div>
        </div>
        <span className="tag">Required</span>
      </div>
      <div className="card-list borrow-agreement-list">
        <div className="pill">Debt due at unlock: principal + interest + origination fee.</div>
        <div className="pill">
          If auto-repay is enabled, wallet balances can be used to repay after maturity.
        </div>
        <div className="pill">
          Repayment policy applies across all supported chains; native token varies by chain.
        </div>
        <div className="pill">
          Auto-repay uses on-chain token priority; tokens must be pre-approved.
        </div>
        <div className="pill">
          If wallet balance is insufficient, unlocked collateral can be seized and liquidated.
        </div>
      </div>
      <div className="form-grid">
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
          onClick={handleBorrow}
          data-guide-id="borrow-create-loan"
          disabled={isBorrowPending || !canBorrow}
        >
          Create Loan
        </button>
      </div>
    </div>
  );
}
