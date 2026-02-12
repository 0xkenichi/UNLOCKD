import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract
} from 'wagmi';
import {
  erc20Abi,
  getContractAddress,
  loanManagerAbi,
  vestingAdapterAbi
} from '../../utils/contracts.js';
import { getEvmChainById } from '../../utils/chains.js';
import { toUnits } from '../../utils/format.js';
import TxStatusBanner from '../common/TxStatusBanner.jsx';
import { trackEvent } from '../../utils/analytics.js';

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
  const [borrowAmount, setBorrowAmount] = useState('200');
  const [autoBorrow, setAutoBorrow] = useState(true);
  const [autoRepay, setAutoRepay] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);

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

  const quantityRaw = vestingDetails?.[0];
  const tokenAddress = vestingDetails?.[1];
  const unlockTimeRaw = vestingDetails?.[2];
  const tokenAddressValid =
    typeof tokenAddress === 'string' &&
    isAddress(tokenAddress) &&
    tokenAddress !== ZERO_ADDRESS;
  const verified =
    Boolean(quantityRaw) &&
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
    if (!onDetails || !vestingDetails) return;
    onDetails({
      collateralId,
      vestingContract,
      quantity: quantityRaw,
      tokenAddress,
      unlockTime: unlockTimeRaw,
      tokenDecimals,
      verified
    });
  }, [
    onDetails,
    quantityRaw,
    tokenAddress,
    unlockTimeRaw,
    tokenDecimals,
    vestingDetails,
    verified
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
  const vestingContractValid = isAddress(vestingContract);
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
    args: [BigInt(collateralId || 0), vestingContract, borrowUnits || 0n],
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
      args: [BigInt(collateralId || 0), vestingContract, address],
      gas: 500_000n
    });
  };

  const handleBorrow = () => {
    if (!canBorrow) return;
    writeBorrow({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'createLoan',
      args: [BigInt(collateralId || 0), vestingContract, borrowUnits],
      gas: 1_000_000n
    });
  };

  return (
    <div className="holo-card">
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
        <label className="form-field">
          Vesting Contract
          <input
            className="form-input"
            value={vestingContract}
            onChange={(event) => setVestingContract(event.target.value)}
            placeholder="0x..."
          />
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
      </div>
      <div className="inline-actions">
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
      <div className="card-list">
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
      <div className="inline-actions">
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
