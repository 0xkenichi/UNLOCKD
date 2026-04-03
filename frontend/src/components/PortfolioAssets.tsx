/**
 * PortfolioAssets
 *
 * Drop this into your Portfolio page.
 * Shows a clear split between:
 *   - Liquid assets  (tradable now — ETH, USDC per chain)
 *   - Illiquid assets (locked in vesting contracts)
 *
 * Usage:
 *   import { PortfolioAssets } from "@/components/PortfolioAssets";
 *   <PortfolioAssets />
 */

"use client";

import { useVestraAssets } from "@/hooks/useVestraAssets";
import { formatUnits } from "viem";

const CHAIN_BADGE_COLORS: Record<number, string> = {
  8453:   "bg-blue-100 text-blue-800",   // Base
  84532:  "bg-indigo-100 text-indigo-800", // Base Sepolia
  11155111: "bg-purple-100 text-purple-800", // Sepolia
};

function fmt(val: string, decimals = 4) {
  const n = parseFloat(val);
  if (n === 0) return "0.00";
  if (n < 0.0001) return "< 0.0001";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

function unixToDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function PortfolioAssets() {
  const { liquid, vested, totalLiquidUSD, isLoading, isError, refetch } =
    useVestraAssets();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Failed to load balances.{" "}
        <button onClick={refetch} className="underline font-medium">
          Retry
        </button>
      </div>
    );
  }

  const hasAssets = liquid.length > 0 || vested.length > 0;

  if (!hasAssets) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
        No assets found on connected wallet across Base, Base Sepolia, or Sepolia.
        <br />
        Make sure your wallet is connected and on a supported chain.
        <br />
        <button onClick={refetch} className="mt-3 text-primary underline text-xs">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Liquid Assets ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-medium">Liquid assets</h2>
            <p className="text-xs text-muted-foreground">Tradable now · swappable on any DEX</p>
          </div>
          {totalLiquidUSD > 0 && (
            <span className="text-sm font-medium tabular-nums">
              ≈ ${totalLiquidUSD.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
            </span>
          )}
        </div>

        {liquid.length === 0 ? (
          <p className="text-sm text-muted-foreground">No liquid assets found.</p>
        ) : (
          <div className="space-y-2">
            {liquid.map((asset, i) => (
              <div
                key={`${asset.chainId}-${asset.symbol}-${i}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {/* Token icon placeholder — swap for your icon component */}
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                    {asset.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{asset.symbol}</p>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        CHAIN_BADGE_COLORS[asset.chainId] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {asset.chainName}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums">
                    {fmt(asset.balanceFormatted)} {asset.symbol}
                  </p>
                  {asset.symbol === "USDC" && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      ≈ ${fmt(asset.balanceFormatted, 2)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Illiquid / Vested Assets ───────────────────────────────────── */}
      <section>
        <div className="mb-3">
          <h2 className="text-base font-medium">Illiquid assets</h2>
          <p className="text-xs text-muted-foreground">Locked in vesting contracts · cannot be transferred yet</p>
        </div>

        {vested.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vested positions found.</p>
        ) : (
          <div className="space-y-2">
            {vested.map((pos, i) => {
              const pct =
                pos.totalAmount > 0n
                  ? Number((pos.claimedAmount * 100n) / pos.totalAmount)
                  : 0;

              return (
                <div
                  key={`${pos.chainId}-${pos.contractAddress}-${i}`}
                  className="rounded-xl border border-border bg-card px-4 py-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {pos.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{pos.symbol}</p>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                            CHAIN_BADGE_COLORS[pos.chainId] ?? "bg-muted text-muted-foreground"
                          }`}
                        >
                          {pos.chainName}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums">
                        {fmt(pos.totalAmountFormatted)} {pos.symbol}
                      </p>
                      <p className="text-xs text-muted-foreground">Total vested</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{pct}% claimed</span>
                      <span>Unlocks {unixToDate(pos.unlockTimestamp)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Claimable now */}
                  {pos.claimableNow > 0n && (
                    <div className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                      <span className="text-xs text-green-800 font-medium">Claimable now</span>
                      <span className="text-xs font-medium text-green-800 tabular-nums">
                        {fmt(pos.claimableFormatted)} {pos.symbol}
                      </span>
                    </div>
                  )}

                  {/* Use as Vestra collateral CTA */}
                  <p className="text-xs text-muted-foreground">
                    This position can be used as collateral on Vestra —{" "}
                    <button
                      onClick={() =>
                        window.location.href = `/borrow?contract=${pos.contractAddress}&chain=${pos.chainId}`
                      }
                      className="text-primary underline"
                    >
                      borrow against it ↗
                    </button>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Refresh */}
      <button
        onClick={refetch}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Refresh all balances
      </button>
    </div>
  );
}
