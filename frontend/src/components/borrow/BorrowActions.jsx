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

  const [collateralId, setCollateralId] = useState('1');
  const [vestingContract, setVestingContract] = useState('');
  const [importProtocol, setImportProtocol] = useState('manual');
  const [sablierLockup, setSablierLockup] = useState('');
  const [sablierStreamId, setSablierStreamId] = useState('');
  const [sablierWrapperAddress, setSablierWrapperAddress] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('200');
  const [autoBorrow, setAutoBorrow] = useState(true);
  const [autoRepay, setAutoRepay] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);

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
    const next = formatBorrowUsd(maxBorrowUsd);
    if (next && next !== borrowAmount) {
      setBorrowAmount(next);
    }
  }, [autoBorrow, borrowAmount, maxBorrowUsd]);

  useEffect(() => {
    if (!offerBorrowUsd || !Number.isFinite(offerBorrowUsd)) return;
    const next = formatBorrowUsd(offerBorrowUsd);
    if (next && next !== borrowAmount) {
      setAutoBorrow(false);
      setBorrowAmount(next);
    }
  }, [offerBorrowUsd, borrowAmount]);

  const {
    data: escrowHash,
    writeContract: writeEscrow,
    isPending: isEscrowPending,
    error: escrowError
  } = useWriteContract();
  const {
    data: borrowHash,
    writeContract: writeBorrow,
    isPending: isBorrowPending,
    error: borrowError
  } = useWriteContract();

  const {
    isLoading: isEscrowMining,
    isSuccess: escrowConfirmed,
    error: escrowReceiptError
  } = useWaitForTransactionReceipt({ hash: escrowHash });
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
  const canEscrow =
    Boolean(vestingAdapter) &&
    hasWallet &&
    collateralIdValid &&
    vestingContractValid &&
    hasGas;
  const canBorrow =
    Boolean(loanManager) &&
    hasWallet &&
    collateralIdValid &&
    vestingContractValid &&
    borrowValid &&
    verified &&
    fundingReady &&
    agreeTerms;

  const borrowDisabledReason = (() => {
    if (!hasWallet) return 'Connect a wallet to create a loan.';
    if (!hasGas) return 'Add gas to cover transaction fees.';
    if (!loanManager) return 'Unsupported network for loan creation.';
    if (!collateralIdValid) return 'Enter a valid collateral ID.';
    if (!vestingContractValid) return 'Enter a valid vesting contract address.';
    if (!verified) return 'Escrow a vesting position to verify collateral.';
    if (!borrowValid) return 'Enter a borrow amount.';
    if (!fundingReady) return fundingStatus?.reason || 'Fund your wallet first.';
    if (!agreeTerms) return 'Accept the loan agreement to continue.';
    return '';
  })();

  const { error: borrowSimError } = useSimulateContract({
    address: loanManager || undefined,
    abi: loanManagerAbi,
    functionName: 'createLoan',
    args: [BigInt(collateralId || 0), effectiveVestingContract, borrowUnits || 0n],
    account: address,
    query: {
      enabled: Boolean(canBorrow)
    }
  });

  useEffect(() => {
    if (escrowConfirmed) {
      trackEvent('borrow_escrow_confirmed', { chainId });
    }
  }, [chainId, escrowConfirmed]);

  useEffect(() => {
    if (borrowConfirmed) {
      trackEvent('borrow_create_confirmed', { chainId });
    }
  }, [borrowConfirmed, chainId]);

  const handleEscrow = () => {
    if (!canEscrow) return;
    writeEscrow({
      address: vestingAdapter,
      abi: vestingAdapterAbi,
      functionName: 'escrow',
      args: [BigInt(collateralId || 0), effectiveVestingContract, address],
      gas: 500_000n
    });
  };

  const handleBorrow = () => {
    if (!canBorrow) return;
    writeBorrow({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'createLoan',
      args: [BigInt(collateralId || 0), effectiveVestingContract, borrowUnits],
      gas: 1_000_000n
    });
  };

  return (
    <div className="holo-card borrow-actions-card">
      <div className="section-head">
        <div>
          <h3 className="section-title">Borrow Actions</h3>
          <div className="section-subtitle">
            Escrow the vesting claim, then create a loan.
          </div>
        </div>
        <span className={`tag ${verified ? 'success' : ''}`}>
          {verified ? 'Verified' : 'Pending'}
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
      {(escrowError || borrowError || escrowReceiptError || borrowReceiptError) && (
        <div className="error-banner">
          {escrowReceiptError?.message ||
            borrowReceiptError?.message ||
            escrowError?.message ||
            borrowError?.message}
        </div>
      )}
      {borrowSimError && (
        <div className="muted">
          Simulation: {borrowSimError.shortMessage || borrowSimError.message}
        </div>
      )}
      <TxStatusBanner
        label="Escrow Transaction"
        hash={escrowHash}
        status={
          escrowConfirmed
            ? 'Confirmed'
            : isEscrowMining
              ? 'Confirming'
              : isEscrowPending
                ? 'Pending'
                : ''
        }
      />
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
                placeholder="123"
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
          Collateral ID
          <input
            className="form-input"
            value={collateralId}
            onChange={(event) => setCollateralId(event.target.value)}
            inputMode="numeric"
          />
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
      </div>
      <div className="inline-actions borrow-actions-inline">
        <button
          className="button"
          type="button"
          onClick={() => {
            setAutoBorrow(true);
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
      <div className="section-head">
        <div>
          <h3 className="section-title">Loan Agreement</h3>
          <div className="section-subtitle">Read before signing with your wallet</div>
        </div>
        <span className="tag">Required</span>
      </div>
      <div className="card-list borrow-agreement-list">
        <div className="pill">Debt due at unlock: principal + interest.</div>
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
          onClick={handleEscrow}
          disabled={isEscrowPending || !canEscrow}
        >
          Escrow
        </button>
        <button
          className="button"
          onClick={handleBorrow}
          disabled={isBorrowPending || !canBorrow}
        >
          Create Loan
        </button>
      </div>
    </div>
  );
}
