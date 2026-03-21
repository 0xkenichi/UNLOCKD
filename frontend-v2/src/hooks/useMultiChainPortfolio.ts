'use client';

/**
 * useMultiChainPortfolio — v2
 *
 * Works with the new portfolio route that returns direct chain reads.
 * Now also handles Solana wallets separately.
 */

import { useEffect, useState, useCallback } from 'react';
import { useAccount } from 'wagmi';

export interface PortfolioAsset {
  symbol: string;
  name: string;
  address: string | null;
  balance: number;
  valueUsd: number;
  chain: string;
  chainId?: number;
  logo?: string | null;
  type: 'liquid' | 'vested' | 'staked';
  isLiquid: boolean;
  protocol?: string;
  unlockTime?: number | null;
}

export interface PortfolioSummary {
  totalValue: number;
  liquidValue: number;
  illiquidValue: number;
}

export interface MultiChainPortfolio {
  assets: PortfolioAsset[];
  summary: PortfolioSummary;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const BACKEND_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BACKEND_URL) ||
  'http://localhost:4000';

function getSolanaAddress(): string | null {
  if (typeof window === 'undefined') return null;
  const phantom = (window as any).solana;
  if (phantom?.isConnected && phantom?.publicKey) return phantom.publicKey.toString();
  const backpack = (window as any).backpack;
  if (backpack?.isConnected && backpack?.publicKey) return backpack.publicKey.toString();
  return null;
}

export function useMultiChainPortfolio(chainFilter: string = 'all'): MultiChainPortfolio {
  const { address: evmAddress, isConnected } = useAccount();
  const [assets, setAssets]   = useState<PortfolioAsset[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>({ totalValue: 0, liquidValue: 0, illiquidValue: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isError,   setIsError]   = useState(false);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isConnected || !evmAddress) {
      setAssets([]);
      setSummary({ totalValue: 0, liquidValue: 0, illiquidValue: 0 });
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    fetch(`${BACKEND_URL}/api/portfolio/${evmAddress}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled || !json.ok) return;

        const liquid: PortfolioAsset[] = (json.liquid || [])
          .filter((t: any) => {
            if (chainFilter === 'all') return true;
            return (t.chain || '').toLowerCase() === chainFilter.toLowerCase();
          })
          .map((t: any) => ({
            symbol: t.symbol,
            name: t.name || t.symbol,
            address: t.tokenAddress || null,
            balance: parseFloat(t.formattedBalance || '0'),
            valueUsd: parseFloat(t.valueUsd || '0'),
            chain: t.displayName || t.chain,
            chainId: t.chainId,
            logo: t.logo || null,
            type: 'liquid' as const,
            isLiquid: true,
          }));

        const vested: PortfolioAsset[] = (json.vested || [])
          .filter((v: any) => {
            if (chainFilter === 'all') return true;
            return (v.chain || '').toLowerCase() === chainFilter.toLowerCase();
          })
          .map((v: any) => ({
            symbol: v.symbol,
            name: v.name || v.protocol || 'Vesting position',
            address: v.vestingContract || null,
            balance: parseFloat(v.formattedBalance || v.formattedLocked || '0'),
            valueUsd: parseFloat(v.valueUsd || '0'),
            chain: v.displayName || v.chain,
            chainId: v.chainId,
            type: 'vested' as const,
            isLiquid: false,
            protocol: v.protocol || 'Vestra Protocol',
            unlockTime: v.unlockTime || null,
          }));

        const allAssets = [...liquid, ...vested];
        const liquidValue   = liquid.reduce((s, a) => s + a.valueUsd, 0);
        const illiquidValue = vested.reduce((s, a) => s + a.valueUsd, 0);

        setAssets(allAssets);
        setSummary({ totalValue: liquidValue + illiquidValue, liquidValue, illiquidValue });
        setIsLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[useMultiChainPortfolio]', err.message);
          setIsError(true);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [evmAddress, isConnected, chainFilter, tick]);

  return { assets, summary, isLoading, isError, refetch };
}
