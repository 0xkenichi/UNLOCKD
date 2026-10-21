"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { toast } from "react-hot-toast";
import { Gavel, ShieldAlert, RotateCcw, Loader2, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { useContracts } from "@/hooks/useVestraContracts";
import { LOAN_MANAGER_ABI } from "@/abis/LoanManager";
import { ERC20_ABI } from "@/abis/ERC20";
import { LOAN_STATUS, type LoanStruct } from "@/hooks/useLoanData";
import { formatAddress } from "@/lib/utils";

/** How many of the most recent loan ids to scan for liquidations / auctions. */
const SCAN_WINDOW = 100n;

type Row = {
  loanId: bigint;
  loan: LoanStruct;
  liquidatable: boolean;
  price: bigint;
  auction?: { startTime: bigint; duration: bigint; startPrice: bigint; floorPrice: bigint; debt: bigint };
};

const usd = (v: bigint) =>
  `$${Number(formatUnits(v, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AuctionsPage() {
  const { address } = useAccount();
  const contracts = useContracts();
  const lm = { address: contracts.loanManager, abi: LOAN_MANAGER_ABI } as const;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5_000);
    return () => clearInterval(t);
  }, []);

  // ─── Loan id range ──────────────────────────────────────────────────────────
  const { data: nextLoanId } = useReadContract({ ...lm, functionName: "nextLoanId" });
  const { data: usdcAddress } = useReadContract({ ...lm, functionName: "usdc" });
  const usdc = (usdcAddress as `0x${string}` | undefined) ?? contracts.usdc;

  const ids = useMemo(() => {
    const next = (nextLoanId as bigint | undefined) ?? 1n; // ids start at 1
    const first = next > SCAN_WINDOW + 1n ? next - SCAN_WINDOW : 1n;
    const out: bigint[] = [];
    for (let i = next - 1n; i >= first; i--) out.push(i);
    return out;
  }, [nextLoanId]);

  const { data: reads, refetch, isLoading } = useReadContracts({
    contracts: ids.flatMap((id) => [
      { ...lm, functionName: "getLoan" as const, args: [id] as const },
      { ...lm, functionName: "isLiquidatable" as const, args: [id] as const },
      { ...lm, functionName: "currentPrice" as const, args: [id] as const },
      { ...lm, functionName: "auctions" as const, args: [id] as const },
    ]),
    query: { enabled: ids.length > 0, refetchInterval: 15_000 },
  });

  const rows: Row[] = useMemo(() => {
    if (!reads) return [];
    const out: Row[] = [];
    ids.forEach((loanId, i) => {
      const loanRes = reads[i * 4];
      if (loanRes?.status !== "success") return;
      const loan = loanRes.result as unknown as LoanStruct;
      const liquidatable = Boolean(reads[i * 4 + 1]?.result);
      if (loan.status !== LOAN_STATUS.AUCTION && !liquidatable) return;
      const a = reads[i * 4 + 3]?.result as readonly bigint[] | undefined;
      out.push({
        loanId,
        loan,
        liquidatable,
        price: (reads[i * 4 + 2]?.result as bigint | undefined) ?? 0n,
        auction: a && a[0] > 0n
          ? { startTime: a[0], duration: a[1], startPrice: a[2], floorPrice: a[3], debt: a[4] }
          : undefined,
      });
    });
    return out;
  }, [reads, ids]);

  const auctions = rows.filter((r) => r.loan.status === LOAN_STATUS.AUCTION);
  const pending = rows.filter((r) => r.loan.status === LOAN_STATUS.ACTIVE && r.liquidatable);

  // ─── USDC allowance for bids ───────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdc,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, contracts.loanManager] : undefined,
    query: { enabled: !!address },
  });

  // ─── Writes ─────────────────────────────────────────────────────────────────
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isMining;

  useEffect(() => {
    if (isSuccess) {
      toast.success("Transaction confirmed");
      refetch();
      refetchAllowance();
    }
  }, [isSuccess, refetch, refetchAllowance]);

  const onError = (err: any) => toast.error(err?.shortMessage || "Transaction failed");

  const startLiquidation = (loanId: bigint) =>
    writeContract({ ...lm, functionName: "startLiquidation", args: [loanId] }, { onError });

  const restartAuction = (loanId: bigint) =>
    writeContract({ ...lm, functionName: "restartAuction", args: [loanId] }, { onError });

  // The price only falls during a round, so the price read now is a safe max-price guard.
  const approveBid = (maxPrice: bigint) =>
    writeContract({ address: usdc, abi: ERC20_ABI, functionName: "approve", args: [contracts.loanManager, maxPrice] }, { onError });

  const bid = (loanId: bigint, maxPrice: bigint) =>
    writeContract({ ...lm, functionName: "bid", args: [loanId, maxPrice] }, { onError });

  return (
    <div className="space-y-12 pb-20 max-w-5xl">
      <header>
        <div className="flex items-center gap-2 text-risk-high mb-4">
          <span className="w-8 h-[1px] bg-risk-high/40" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Liquidations</span>
        </div>
        <h1 className="text-5xl font-black font-display text-glow-cyan mb-6">LIQUIDATION AUCTIONS</h1>
        <p className="text-secondary text-lg leading-relaxed max-w-2xl">
          Defaulted loans are sold as linear Dutch auctions of the escrowed vesting NFT, from 120% of the
          collateral&apos;s spot value down to a floor. The winning bidder pays the current price and receives the
          stream NFT plus any vested tokens held in escrow.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: ShieldAlert, label: "1 · Start", desc: "Anyone can start a liquidation once a loan is past maturity + grace period, or its debt exceeds the liquidation threshold." },
          { icon: Gavel, label: "2 · Bid", desc: "Approve USDC, then bid. You pay the price at execution time, never above your max price." },
          { icon: RotateCcw, label: "3 · Restart", desc: "If a round ends without a bid, anyone can restart it from the previous floor." },
        ].map((item, i) => (
          <Card key={i} variant="glass" className="p-8">
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6">
              <item.icon className="w-6 h-6 text-accent-cyan" />
            </div>
            <h4 className="text-sm font-black text-foreground mb-2 uppercase">{item.label}</h4>
            <p className="text-[11px] text-secondary leading-relaxed font-medium">{item.desc}</p>
          </Card>
        ))}
      </div>

      {/* Live auctions */}
      <section className="space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-secondary">Live Auctions ({auctions.length})</h2>
        {isLoading && <div className="text-secondary text-sm animate-pulse">Scanning loans...</div>}
        {!isLoading && auctions.length === 0 && (
          <Card variant="glass" hoverable={false} className="p-8 text-center text-secondary text-sm">No loans are in auction.</Card>
        )}
        {auctions.map((r) => {
          const roundOver = !!r.auction && now >= Number(r.auction.startTime + r.auction.duration);
          const needsApproval = (allowance ?? 0n) < r.price;
          return (
            <Card key={r.loanId.toString()} variant="glass" hoverable={false} className="p-6">
              <CardContent className="p-0 grid grid-cols-2 md:grid-cols-6 gap-4 items-center">
                <div>
                  <div className="text-[10px] uppercase text-secondary font-black">Loan</div>
                  <div className="font-mono text-white">#{r.loanId.toString()}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-secondary font-black">Collateral</div>
                  <div className="font-mono text-xs text-white">
                    {Number(formatUnits(r.loan.quantity, 18)).toLocaleString()} · {formatAddress(r.loan.token)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-secondary font-black">Debt</div>
                  <div className="font-mono text-white">{usd(r.auction?.debt ?? 0n)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-secondary font-black">Current Price</div>
                  <div className="font-mono text-accent-cyan font-bold">{usd(r.price)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-secondary font-black flex items-center gap-1"><Clock className="w-3 h-3" /> Round</div>
                  <div className="font-mono text-xs text-white">
                    {roundOver
                      ? "At floor"
                      : `${Math.max(0, Math.ceil((Number(r.auction!.startTime + r.auction!.duration) - now) / 3600))}h left`}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {needsApproval ? (
                    <button
                      onClick={() => approveBid(r.price)}
                      disabled={busy || !address || r.price === 0n}
                      className="py-2 rounded-xl border border-white/10 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Approve USDC"}
                    </button>
                  ) : (
                    <button
                      onClick={() => bid(r.loanId, r.price)}
                      disabled={busy || !address || r.price === 0n}
                      className="py-2 rounded-xl bg-accent-cyan text-background text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Bid"}
                    </button>
                  )}
                  {roundOver && (
                    <button
                      onClick={() => restartAuction(r.loanId)}
                      disabled={busy || !address}
                      className="py-2 rounded-xl border border-white/10 text-secondary text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
                    >
                      Restart
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Liquidatable, not yet started */}
      <section className="space-y-4">
        <h2 className="text-xs font-black uppercase tracking-widest text-secondary">Liquidatable Loans ({pending.length})</h2>
        {!isLoading && pending.length === 0 && (
          <Card variant="glass" hoverable={false} className="p-8 text-center text-secondary text-sm">No loans are currently liquidatable.</Card>
        )}
        {pending.map((r) => (
          <Card key={r.loanId.toString()} variant="glass" hoverable={false} className="p-6">
            <CardContent className="p-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="text-sm text-white">
                <span className="font-mono">Loan #{r.loanId.toString()}</span>
                <span className="text-secondary text-xs ml-3">
                  Borrower {formatAddress(r.loan.borrower)} · matured {new Date(Number(r.loan.maturity) * 1000).toLocaleDateString()}
                </span>
              </div>
              <button
                onClick={() => startLiquidation(r.loanId)}
                disabled={busy || !address}
                className="px-6 py-2 rounded-xl bg-accent-red/20 border border-accent-red/30 text-accent-red text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
              >
                Start Liquidation
              </button>
            </CardContent>
          </Card>
        ))}
      </section>

      <p className="text-[10px] text-secondary/60 italic">
        Showing the {SCAN_WINDOW.toString()} most recent loans. Proceeds repay lenders first; any surplus is claimable by the
        borrower and any shortfall is covered by the insurance vault, then shared by lenders.
      </p>
    </div>
  );
}
