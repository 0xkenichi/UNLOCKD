import { useEffect, useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract
} from 'wagmi';
import {
  erc20Abi,
  getContractAddress,
  loanManagerAbi,
  vestingAdapterAbi
} from '../../utils/contracts.js';
import { toUnits } from '../../utils/format.js';

const USDC_DECIMALS = 6;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(value);
const formatBorrowUsd = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(2);
};

export default function BorrowActions({ onDetails, maxBorrowUsd }) {
  const { address } = useAccount();
  const chainId = useChainId();
  const loanManager = getContractAddress(chainId, 'loanManager');
  const vestingAdapter = getContractAddress(chainId, 'vestingAdapter');

  const [collateralId, setCollateralId] = useState('1');
  const [vestingContract, setVestingContract] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('200');
  const [autoBorrow, setAutoBorrow] = useState(true);

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

  const { writeContract, isPending, error } = useWriteContract();

  const handleEscrow = () => {
    if (!vestingAdapter || !address) return;
    writeContract({
      address: vestingAdapter,
      abi: vestingAdapterAbi,
      functionName: 'escrow',
      args: [BigInt(collateralId || 0), vestingContract, address]
    });
  };

  const handleBorrow = () => {
    if (!loanManager || !borrowUnits) return;
    writeContract({
      address: loanManager,
      abi: loanManagerAbi,
      functionName: 'createLoan',
      args: [BigInt(collateralId || 0), vestingContract, borrowUnits]
    });
  };

  return (
    <div className="holo-card">
      <h3 className="holo-title">Borrow Actions</h3>
      <p className="muted">
        Escrow the vesting claim, then create a loan against it.
      </p>
      <div className="stack">
        <div className="pill">
          {detailsError
            ? 'Verification failed. Check collateral ID.'
            : verified
              ? 'Vesting details verified.'
              : isDetailsLoading
                ? 'Reading vesting details...'
                : 'Awaiting vesting details.'}
        </div>
        {verified && (
          <div className="pill">
            Unlocks:{' '}
            {new Date(Number(unlockTimeRaw) * 1000).toLocaleString()}
          </div>
        )}
      </div>
      {error && <div className="error-banner">{error.message}</div>}
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
      <div className="faucet-quick">
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
      <div className="faucet-quick">
        <button className="button" onClick={handleEscrow} disabled={isPending}>
          Escrow
        </button>
        <button className="button" onClick={handleBorrow} disabled={isPending}>
          Create Loan
        </button>
      </div>
    </div>
  );
}
