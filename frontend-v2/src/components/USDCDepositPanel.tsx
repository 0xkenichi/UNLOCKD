/**
 * USDCDepositPanel
 *
 * Drop this into your Supply page.
 * Reads USDC balance directly from the chain (not from wagmi's useBalance)
 * so it works correctly with Safe wallets and multi-chain setups.
 *
 * Usage:
 *   import { USDCDepositPanel } from "@/components/USDCDepositPanel";
 *   <USDCDepositPanel poolAddress="0x..." />
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { erc20Abi, formatUnits, parseUnits, type Address } from "viem";
import { base, baseSepolia, sepolia } from "wagmi/chains";
import { USDC_ADDRESSES } from "@/lib/wagmi.config";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  /** Your Vestra lending pool contract address */
  poolAddress: Address;
  /** Optional: override which chains to show. Defaults to all configured chains. */
  supportedChainIds?: number[];
}

type TxStatus = "idle" | "approving" | "depositing" | "success" | "error";

const CHAIN_NAMES: Record<number, string> = {
  [base.id]:        "Base",
  [baseSepolia.id]: "Base Sepolia",
  [sepolia.id]:     "Sepolia",
};

// Minimal pool ABI — adapt functionName to match your contract
const POOL_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset",  type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
    ],
    outputs: [],
  },
] as const;

// ─── Component ───────────────────────────────────────────────────────────────

export function USDCDepositPanel({ poolAddress, supportedChainIds }: Props) {
  const { address, isConnected } = useAccount();
  const chainId     = useChainId();
  const publicClient  = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });
  const { switchChain } = useSwitchChain();

  const chains = supportedChainIds ?? [base.id, baseSepolia.id, sepolia.id];

  const usdcAddress = USDC_ADDRESSES[chainId];

  const [usdcBalance, setUsdcBalance]   = useState<bigint>(0n);
  const [decimals, setDecimals]         = useState(6);
  const [allowance, setAllowance]       = useState<bigint>(0n);
  const [inputAmount, setInputAmount]   = useState("");
  const [status, setStatus]             = useState<TxStatus>("idle");
  const [txHash, setTxHash]             = useState<string>("");
  const [errorMsg, setErrorMsg]         = useState<string>("");
  const [isLoadingBal, setIsLoadingBal] = useState(false);

  // ── Fetch USDC balance directly from chain ──────────────────────────────
  const fetchBalance = useCallback(async () => {
    if (!address || !publicClient || !usdcAddress) return;

    setIsLoadingBal(true);
    try {
      const [bal, dec, alw] = await Promise.all([
        publicClient.readContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        }),
        publicClient.readContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        publicClient.readContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, poolAddress],
        }),
      ]);

      setUsdcBalance(bal);
      setDecimals(dec);
      setAllowance(alw);
    } catch (e) {
      console.error("[USDCDepositPanel] Balance fetch failed:", e);
    } finally {
      setIsLoadingBal(false);
    }
  }, [address, publicClient, usdcAddress, poolAddress]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // ── Derived values ──────────────────────────────────────────────────────
  const balanceFormatted  = parseFloat(formatUnits(usdcBalance, decimals));
  const parsedInput       = inputAmount ? parseUnits(inputAmount, decimals) : 0n;
  const needsApproval     = parsedInput > 0n && parsedInput > allowance;
  const exceedsBalance    = parsedInput > usdcBalance;
  const onUnsupportedChain = !chains.includes(chainId);
  const noUsdcOnChain     = !usdcAddress;

  // ── Approve ─────────────────────────────────────────────────────────────
  async function handleApprove() {
    if (!walletClient || !usdcAddress || !address) return;
    setStatus("approving");
    setErrorMsg("");
    try {
      const hash = await walletClient.writeContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [poolAddress, parsedInput],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await fetchBalance();
      setStatus("idle");
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.shortMessage ?? e?.message ?? "Approval failed");
    }
  }

  // ── Deposit ─────────────────────────────────────────────────────────────
  async function handleDeposit() {
    if (!walletClient || !usdcAddress || !address) return;
    setStatus("depositing");
    setErrorMsg("");
    try {
      const hash = await walletClient.writeContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: "deposit",
        args: [usdcAddress, parsedInput, address],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setStatus("success");
      setInputAmount("");
      await fetchBalance();
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.shortMessage ?? e?.message ?? "Deposit failed");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="rounded-xl border border-border p-6 text-center text-muted-foreground">
        Connect your wallet to deposit USDC
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-5">

      {/* Chain selector */}
      <div className="flex flex-wrap gap-2">
        {chains.map((cId) => (
          <button
            key={cId}
            onClick={() => switchChain({ chainId: cId })}
            className={`px-3 py-1 rounded-lg text-sm border transition-all ${
              chainId === cId
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {CHAIN_NAMES[cId]}
          </button>
        ))}
      </div>

      {/* No USDC on this chain */}
      {noUsdcOnChain && (
        <p className="text-sm text-yellow-600 bg-yellow-50 rounded-lg p-3">
          USDC is not configured for this chain. Switch to Base or Sepolia.
        </p>
      )}

      {/* Balance row */}
      {!noUsdcOnChain && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Your USDC balance</span>
            <span className="font-medium tabular-nums">
              {isLoadingBal
                ? "Loading…"
                : `${balanceFormatted.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 6,
                  })} USDC`}
            </span>
          </div>

          {/* Amount input */}
          <div className="relative">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 pr-20 text-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={() =>
                  setInputAmount(formatUnits(usdcBalance, decimals))
                }
                className="text-xs text-primary hover:underline"
              >
                Max
              </button>
              <span className="text-sm font-medium text-muted-foreground">USDC</span>
            </div>
          </div>

          {/* Validation warnings */}
          {exceedsBalance && (
            <p className="text-sm text-red-500">Amount exceeds your balance</p>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-3">
            {needsApproval && !exceedsBalance && (
              <button
                onClick={handleApprove}
                disabled={status === "approving"}
                className="w-full rounded-lg bg-secondary text-secondary-foreground py-3 font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {status === "approving" ? "Approving…" : "Approve USDC"}
              </button>
            )}

            <button
              onClick={handleDeposit}
              disabled={
                !parsedInput ||
                parsedInput === 0n ||
                exceedsBalance ||
                needsApproval ||
                status === "depositing" ||
                status === "approving"
              }
              className="w-full rounded-lg bg-primary text-primary-foreground py-3 font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {status === "depositing" ? "Depositing…" : "Deposit USDC"}
            </button>
          </div>

          {/* Success */}
          {status === "success" && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              Deposit successful!{" "}
              {txHash && (
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  View tx ↗
                </a>
              )}
            </div>
          )}

          {/* Error */}
          {status === "error" && errorMsg && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {errorMsg}
            </div>
          )}

          {/* Refresh balance */}
          <button
            onClick={fetchBalance}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Refresh balance
          </button>
        </>
      )}
    </div>
  );
}
