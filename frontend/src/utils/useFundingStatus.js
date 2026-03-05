// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';
import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { getContractAddress, usdcAbi } from './contracts.js';

const MIN_GAS_WEI = 500000000000000n; // 0.0005 ETH
const MIN_USDC = 1;

export function useFundingStatus({ mode = 'borrow' } = {}) {
  const { address } = useAccount();
  const chainId = useChainId();
  const usdc = getContractAddress(chainId, 'usdc');

  const { data: nativeBalance } = useBalance({
    address,
    chainId,
    query: { enabled: Boolean(address) }
  });

  const { data: usdcDecimals } = useReadContract({
    address: usdc || undefined,
    abi: usdcAbi,
    functionName: 'decimals',
    query: { enabled: Boolean(usdc) }
  });

  const { data: usdcBalanceRaw } = useReadContract({
    address: usdc || undefined,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [address || '0x0000000000000000000000000000000000000000'],
    query: { enabled: Boolean(usdc && address) }
  });

  const hasGas = (nativeBalance?.value || 0n) > MIN_GAS_WEI;
  const usdcBalance =
    usdcBalanceRaw && typeof usdcDecimals === 'number'
      ? Number(formatUnits(usdcBalanceRaw, usdcDecimals))
      : 0;
  const hasUsdc = usdcBalance >= MIN_USDC;

  const ready = mode === 'repay' ? hasGas && hasUsdc : hasGas;

  const reason = useMemo(() => {
    if (!address) return 'Connect a wallet to continue.';
    if (!hasGas) return 'Add native gas to cover transaction fees.';
    if (mode === 'repay' && !hasUsdc) return 'Add USDC to repay this loan.';
    return '';
  }, [address, hasGas, hasUsdc, mode]);

  return {
    ready,
    reason,
    hasGas,
    hasUsdc,
    nativeBalance,
    usdcBalance,
    usdcDecimals: typeof usdcDecimals === 'number' ? usdcDecimals : null
  };
}
