'use client';

/**
 * useSupplyBalance — v2
 *
 * WHAT CHANGED:
 *   v1 tried to use wagmi's usePublicClient() to read directly from the chain.
 *   This can fail when the viem client for a non-active chain isn't fully
 *   initialized (common when wallet is on Base Sepolia but we're trying to
 *   read Sepolia too).
 *
 *   v2 fetches from the backend /api/portfolio/:wallet which uses ethers.js
 *   with explicit Alchemy RPC URLs — no dependency on wagmi's client state.
 *   This always works regardless of which chain the wallet is currently on.
 */

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';

const BACKEND_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BACKEND_URL) ||
  'http://localhost:4000';

export interface SupplyBalance {
  // Per-chain USDC balances (formatted string, e.g. "20.00")
  sepoliaUsdc: string;
  baseSepoliaUsdc: string;
  // Raw numbers for MAX button math
  sepoliaUsdcNum: number;
  baseSepoliaUsdcNum: number;
  // Total across all chains
  totalUsdc: number;
  // Gas token balances
  sepoliaEth: string;
  baseSepoliaEth: string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const ZERO_STATE: SupplyBalance = {
  sepoliaUsdc: '0.00',
  baseSepoliaUsdc: '0.00',
  sepoliaUsdcNum: 0,
  baseSepoliaUsdcNum: 0,
  totalUsdc: 0,
  sepoliaEth: '0.000000',
  baseSepoliaEth: '0.000000',
  isLoading: false,
  isError: false,
  refetch: () => {}
};

export function useSupplyBalance(): SupplyBalance {
  const { address, isConnected } = useAccount();
  const [data, setData] = useState<Omit<SupplyBalance, 'refetch'>>(ZERO_STATE);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isConnected || !address) {
      setData({ ...ZERO_STATE });
      return;
    }

    let cancelled = false;

    setData((prev) => ({ ...prev, isLoading: true, isError: false }));

    fetch(`${BACKEND_URL}/api/portfolio/${address}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!json.ok) throw new Error(json.error || 'Portfolio fetch failed');

        // allTokens includes zero-balance tokens so we always have USDC rows
        const tokens: any[] = json.allTokens || json.liquid || [];

        const find = (chainId: number, symbol: string) => {
          const t = tokens.find(
            (t) => t.chainId === chainId &&
              (t.symbol === symbol || t.symbol === 'tUSDC' && symbol === 'USDC')
          );
          if (!t) return 0;
          const clean = (t.formattedBalance || '0').replace(/,/g, '');
          return parseFloat(clean);
        };

        const findEth = (chainId: number) => {
          const t = tokens.find((t) => t.chainId === chainId && t.isNative);
          return (t?.formattedBalance || '0.000000').replace(/,/g, '');
        };

        // Combine real USDC + testnet USDC on Sepolia
        const sepTokens = tokens.filter(
          (t) => t.chainId === 11155111 && (t.symbol === 'USDC' || t.symbol === 'tUSDC')
        );
        const sepoliaUsdcNum = sepTokens.reduce(
          (s, t) => s + parseFloat((t.formattedBalance || '0').replace(/,/g, '')),
          0
        );

        const baseSepoliaUsdcNum = find(84532, 'USDC');

        setData({
          sepoliaUsdc: sepoliaUsdcNum.toFixed(2),
          baseSepoliaUsdc: baseSepoliaUsdcNum.toFixed(2),
          sepoliaUsdcNum,
          baseSepoliaUsdcNum,
          totalUsdc: sepoliaUsdcNum + baseSepoliaUsdcNum,
          sepoliaEth: findEth(11155111),
          baseSepoliaEth: findEth(84532),
          isLoading: false,
          isError: false
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[useSupplyBalance]', err.message);
        setData((prev) => ({ ...prev, isLoading: false, isError: true }));
      });

    // Auto-refresh every 20s
    const interval = setInterval(() => {
      if (!cancelled) setTick((t) => t + 1);
    }, 20_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address, isConnected, tick]);

  return { ...data, refetch };
}
