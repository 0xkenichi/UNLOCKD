'use client';

import { useAccount, useReadContracts } from 'wagmi';
import { useContracts } from '@/hooks/useVestraContracts';
import { LENDING_POOL_ABI } from '@/abis/LendingPool';
import { LOAN_MANAGER_ABI } from '@/abis/LoanManager';
import { INSURANCE_VAULT_ABI } from '@/abis/InsuranceVault';

const BPS = 10_000n;

/**
 * Live LendingPool (ERC-4626) stats plus the connected lender's position.
 *
 * Interest is floating: `borrowRateBps` comes from the pool's utilization kink model.
 * There is no stored supply rate, so `supplyApyBps` is derived as
 *   borrowRateBps × utilizationBps / 1e4 × (1 − reserveFactorBps / 1e4)
 * and is a variable estimate, not a promise.
 */
export function usePoolStats() {
  const { address } = useAccount();
  const contracts = useContracts();
  const pool = { address: contracts.lendingPool, abi: LENDING_POOL_ABI } as const;
  const owner = (address ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...pool, functionName: 'totalAssets' },
      { ...pool, functionName: 'totalSupply' },
      { ...pool, functionName: 'totalBorrowed' },
      { ...pool, functionName: 'availableLiquidity' },
      { ...pool, functionName: 'utilizationBps' },
      { ...pool, functionName: 'borrowRateBps' },
      { ...pool, functionName: 'depositCap' },
      { ...pool, functionName: 'asset' },
      { ...pool, functionName: 'balanceOf', args: [owner] },
      { ...pool, functionName: 'maxWithdraw', args: [owner] },
      { ...pool, functionName: 'maxRedeem', args: [owner] },
      { address: contracts.loanManager, abi: LOAN_MANAGER_ABI, functionName: 'reserveFactorBps' },
      { address: contracts.insuranceVault, abi: INSURANCE_VAULT_ABI, functionName: 'balance' },
      { ...pool, functionName: 'decimals' },
    ],
    query: { refetchInterval: 15_000 },
  });

  const big = (i: number) => (data?.[i]?.result as bigint | undefined) ?? 0n;

  const totalAssets      = big(0);
  const totalSupply      = big(1);
  const totalBorrowed    = big(2);
  const availableLiquidity = big(3);
  const utilizationBps   = big(4);
  const borrowRateBps    = big(5);
  const depositCap       = big(6);
  const asset            = (data?.[7]?.result as `0x${string}` | undefined) ?? contracts.usdc;
  const userShares       = address ? big(8) : 0n;
  const userMaxWithdraw  = address ? big(9) : 0n;
  const userMaxRedeem    = address ? big(10) : 0n;
  const reserveFactorBps = data?.[11]?.status === 'success' ? big(11) : 1000n; // contract default 10%
  const insuranceBalance = big(12);
  // Shares use a 6-decimal virtual offset on top of USDC's 6 (LendingPool._decimalsOffset).
  const shareDecimals    = Number((data?.[13]?.result as number | undefined) ?? 12);

  const supplyApyBps = (borrowRateBps * utilizationBps * (BPS - reserveFactorBps)) / (BPS * BPS);

  return {
    isLoading,
    refetch,
    poolAddress: contracts.lendingPool,
    asset,
    totalAssets,
    totalSupply,
    totalBorrowed,
    availableLiquidity,
    utilizationBps,
    borrowRateBps,
    reserveFactorBps,
    supplyApyBps,
    depositCap,
    insuranceBalance,
    userShares,
    shareDecimals,
    userMaxWithdraw,
    userMaxRedeem,
  };
}
