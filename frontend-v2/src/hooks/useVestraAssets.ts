/**
 * useVestraAssets
 *
 * Fetches ALL wallet assets across every configured chain:
 *   - Native token balance (ETH)
 *   - USDC balance (ERC-20)
 *   - Vested / locked positions from vesting contracts
 *
 * Works with injected wallets, WalletConnect, AND Safe (Gnosis) wallets.
 * Safe wallets don't always return balances via the standard useBalance hook
 * because they route through the Safe RPC — this hook reads directly from
 * the chain via viem, bypassing that issue.
 */

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { base, baseSepolia, sepolia } from "wagmi/chains";
import { erc20Abi, formatUnits, type Address } from "viem";
import { USDC_ADDRESSES, VESTING_CONTRACTS } from "../lib/wagmi.config";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LiquidAsset {
  symbol: string;
  name: string;
  chainId: number;
  chainName: string;
  balance: bigint;       // raw, in token units
  balanceFormatted: string;
  decimals: number;
  usdValue?: number;     // optional: wire up a price feed later
  isNative: boolean;
  contractAddress?: Address;
}

export interface VestedAsset {
  chainId: number;
  chainName: string;
  contractAddress: Address;
  symbol: string;
  totalAmount: bigint;
  totalAmountFormatted: string;
  claimedAmount: bigint;
  claimableNow: bigint;
  claimableFormatted: string;
  unlockTimestamp: number; // unix seconds
  decimals: number;
}

export interface VestraAssets {
  liquid: LiquidAsset[];
  vested: VestedAsset[];
  totalLiquidUSD: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

// ─── Chain metadata helper ───────────────────────────────────────────────────

const CHAIN_NAMES: Record<number, string> = {
  [base.id]:        "Base",
  [baseSepolia.id]: "Base Sepolia",
  [sepolia.id]:     "Sepolia",
};

const SUPPORTED_CHAINS = [base.id, baseSepolia.id, sepolia.id];

// ─── Vestra Vesting ABI (Adapted for MockLinearVestingWallet) ────────────────
const VESTING_ABI = [
  { name: "beneficiary", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "start", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "duration", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "cliff", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "token", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "totalAllocation", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "releasableAmount", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "released", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useVestraAssets(): VestraAssets {
  const { address, isConnected } = useAccount();

  // One public client per chain — wagmi manages these
  const baseClient        = usePublicClient({ chainId: base.id });
  const baseSepoliaClient = usePublicClient({ chainId: baseSepolia.id });
  const sepoliaClient     = usePublicClient({ chainId: sepolia.id });

  const clients = useMemo(
    () => ({
      [base.id]:        baseClient,
      [baseSepolia.id]: baseSepoliaClient,
      [sepolia.id]:     sepoliaClient,
    }),
    [baseClient, baseSepoliaClient, sepoliaClient]
  );

  const [liquid, setLiquid]   = useState<LiquidAsset[]>([]);
  const [vested, setVested]   = useState<VestedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError,   setIsError]   = useState(false);
  const [tick, setTick] = useState(0);

  const refetch = () => setTick((t) => t + 1);

  useEffect(() => {
    if (!isConnected || !address) {
      setLiquid([]);
      setVested([]);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      setIsLoading(true);
      setIsError(false);

      const liquidResults: LiquidAsset[] = [];
      const vestedResults: VestedAsset[] = [];

      await Promise.allSettled(
        SUPPORTED_CHAINS.map(async (chainId) => {
          const client = clients[chainId];
          if (!client) return;

          const chainName = CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;

          // ── 1. Native ETH balance ──────────────────────────────────────
          try {
            const nativeBal = await client.getBalance({ address: address! });
            liquidResults.push({
              symbol: "ETH",
              name: "Ether",
              chainId,
              chainName,
              balance: nativeBal,
              balanceFormatted: formatUnits(nativeBal, 18),
              decimals: 18,
              isNative: true,
            });
          } catch (e) {
            console.warn(`[Vestra] ETH balance failed on ${chainName}:`, e);
          }

          // ── 2. USDC balance ────────────────────────────────────────────
          const usdcAddress = USDC_ADDRESSES[chainId];
          if (usdcAddress) {
            try {
              // Read directly via viem — bypasses Safe wallet RPC quirks
              const [usdcBal, decimals] = await Promise.all([
                client.readContract({
                  address: usdcAddress,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [address!],
                }),
                client.readContract({
                  address: usdcAddress,
                  abi: erc20Abi,
                  functionName: "decimals",
                }),
              ]);

              liquidResults.push({
                symbol: "USDC",
                name: "USD Coin",
                chainId,
                chainName,
                balance: usdcBal,
                balanceFormatted: formatUnits(usdcBal, decimals),
                decimals,
                isNative: false,
                contractAddress: usdcAddress,
              });
            } catch (e) {
              console.warn(`[Vestra] USDC balance failed on ${chainName}:`, e);
            }
          }

          // ── 3. Vesting contract positions ─────────────────────────────
          const vestingAddresses = VESTING_CONTRACTS[chainId] ?? [];
          await Promise.allSettled(
            vestingAddresses.map(async (vestingAddr) => {
              try {
                // Fetch individually to match MockLinearVestingWallet structure
                const [beneficiary, start, duration, cliff, tokenAddr, totalAmount, releasable] = await Promise.all([
                  client.readContract({ address: vestingAddr, abi: VESTING_ABI, functionName: "beneficiary" }),
                  client.readContract({ address: vestingAddr, abi: VESTING_ABI, functionName: "start" }),
                  client.readContract({ address: vestingAddr, abi: VESTING_ABI, functionName: "duration" }),
                  client.readContract({ address: vestingAddr, abi: VESTING_ABI, functionName: "cliff" }),
                  client.readContract({ address: vestingAddr, abi: VESTING_ABI, functionName: "token" }),
                  client.readContract({ address: vestingAddr, abi: VESTING_ABI, functionName: "totalAllocation" }),
                  client.readContract({ address: vestingAddr, abi: VESTING_ABI, functionName: "releasableAmount" }),
                ]);

                if (beneficiary.toLowerCase() !== address!.toLowerCase()) return;
                if (totalAmount === 0n) return;

                const released = await client.readContract({ 
                    address: vestingAddr, 
                    abi: VESTING_ABI, 
                    functionName: "released", 
                    args: [tokenAddr] 
                });

                const [tokenDecimals, tokenSymbol] = await Promise.all([
                  client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "decimals" }),
                  client.readContract({ address: tokenAddr, abi: erc20Abi, functionName: "symbol" }),
                ]);

                vestedResults.push({
                  chainId,
                  chainName,
                  contractAddress: vestingAddr,
                  symbol: tokenSymbol,
                  totalAmount,
                  totalAmountFormatted: formatUnits(totalAmount, tokenDecimals),
                  claimedAmount: released,
                  claimableNow: releasable,
                  claimableFormatted: formatUnits(releasable, tokenDecimals),
                  unlockTimestamp: Number(start) + Number(duration),
                  decimals: tokenDecimals,
                });
              } catch (e) {
                console.warn(
                  `[Vestra] Vesting read failed on ${chainName} @ ${vestingAddr}:`,
                  e
                );
              }
            })
          );
        })
      );

      if (!cancelled) {
        setLiquid(liquidResults);
        setVested(vestedResults);
        setIsLoading(false);
      }
    }

    fetchAll().catch((e) => {
      if (!cancelled) {
        console.error("[Vestra] fetchAll error:", e);
        setIsError(true);
        setIsLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [address, isConnected, clients, tick]);

  const totalLiquidUSD = useMemo(
    () =>
      liquid
        .filter((a) => a.symbol === "USDC")
        .reduce((sum, a) => sum + parseFloat(a.balanceFormatted), 0),
    [liquid]
  );

  return { liquid, vested, totalLiquidUSD, isLoading, isError, refetch };
}
