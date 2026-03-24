"use client";

import { useState, useMemo } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { Modal } from "@/components/ui/Modal";
import { 
  DollarSign, 
  AlertTriangle, 
  ArrowDownRight,
  Shield,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { lendingPoolAbi } from "@/config/contracts";
import { toast } from "react-hot-toast";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  stake: {
    id: number;
    amount: bigint;
    lockEndTime: number;
    apyBps: number;
  } | null;
  lendingPoolAddress: `0x${string}`;
}

export function WithdrawModal({ isOpen, onClose, stake, lendingPoolAddress }: WithdrawModalProps) {
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const { writeContract: writeUnstake, data: unstakeHash, isPending: isUnstakePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: unstakeSuccess } = useWaitForTransactionReceipt({
    hash: unstakeHash,
  });

  const isEarly = useMemo(() => {
    if (!stake) return false;
    return Date.now() / 1000 < stake.lockEndTime;
  }, [stake]);

  const penaltyFee = useMemo(() => {
    if (!stake || !isEarly) return 0n;
    // 5% penalty
    return (stake.amount * 5n) / 100n;
  }, [stake, isEarly]);

  const expectedReceive = useMemo(() => {
    if (!stake) return 0n;
    return stake.amount - penaltyFee;
  }, [stake, penaltyFee]);

  const handleWithdraw = () => {
    if (!stake) return;
    
    writeUnstake({
      address: lendingPoolAddress,
      abi: lendingPoolAbi,
      functionName: 'unstake',
      args: [BigInt(stake.id)],
    }, {
      onSuccess: () => {
        toast.success("Withdrawal transaction submitted");
      },
      onError: (err: any) => {
        toast.error(err.shortMessage || "Withdrawal failed");
      }
    });
  };

  if (!stake) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={() => {
        setIsSuccess(false);
        onClose();
      }} 
      title={unstakeSuccess ? "Withdrawal Complete" : "Withdraw Principal"}
    >
      <div className="space-y-6">
        {unstakeSuccess ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
            <div className="w-20 h-20 rounded-full bg-accent-teal/10 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-12 h-12 text-accent-teal" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter">Principal Released</h3>
            <p className="text-secondary text-sm px-4">Your requested liquidity has been returned to your wallet. The protocol insurance fund has been adjusted accordingly.</p>
            <button 
              onClick={onClose}
              className="mt-6 px-10 py-3 rounded-xl bg-accent-teal text-background font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all"
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          <>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
              <div className="flex justify-between items-end">
                <div className="space-y-1">
                  <p className="text-[10px] text-secondary/40 font-black uppercase tracking-widest">Available to Withdraw</p>
                  <p className="text-3xl font-black italic tracking-tighter text-white">
                    {formatUnits(stake.amount, 6)} USDC
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-accent-teal/10 text-accent-teal">
                  <DollarSign className="w-6 h-6" />
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-secondary">Lock Maturity</span>
                  <span className="font-bold text-white">
                    {new Date(stake.lockEndTime * 1000).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-secondary">Current Status</span>
                  {isEarly ? (
                    <span className="px-2 py-0.5 rounded bg-risk-high/10 text-risk-high font-black uppercase text-[8px] border border-risk-high/20">Early Withdrawal</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-accent-teal/10 text-accent-teal font-black uppercase text-[8px] border border-accent-teal/20">Matured</span>
                  )}
                </div>
              </div>
            </div>

            {isEarly && (
              <div className="p-4 rounded-2xl bg-risk-high/5 border border-risk-high/20 space-y-3">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-risk-high shrink-0" />
                  <div className="text-[11px] space-y-1">
                    <p className="font-bold text-risk-high uppercase tracking-tight">Early Withdrawal Penalty (5%)</p>
                    <p className="text-secondary leading-relaxed">
                      Withdrawing before maturity results in a 5% principal deduction plus forfeiture of all pending yield.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <p className="text-[8px] text-secondary uppercase font-bold">Penalty Fee</p>
                    <p className="text-sm font-black text-risk-high">-{formatUnits(penaltyFee, 6)} USDC</p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <p className="text-[8px] text-secondary uppercase font-bold">You Receive</p>
                    <p className="text-sm font-black text-accent-teal">{formatUnits(expectedReceive, 6)} USDC</p>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-accent-teal/5 border border-accent-teal/10 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent-teal" />
                <span className="text-[10px] text-secondary font-black uppercase tracking-widest">Penalty Routing Path</span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-secondary/60 uppercase">Destination</span>
                  <span className="text-white font-bold">Vestra Insurance Fund</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-secondary/60 uppercase">Wallet</span>
                  <span className="font-mono text-accent-teal">0x3B31...4DDf</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleWithdraw}
              disabled={isUnstakePending || isConfirming}
              className="w-full py-4 rounded-2xl bg-white text-background font-black uppercase tracking-widest text-sm hover:bg-accent-teal transition-all flex items-center justify-center gap-2 group shadow-xl"
            >
              {isUnstakePending || isConfirming ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Signing Protocol Release...</span>
                </>
              ) : (
                <>
                  <span>Confirm Withdrawal</span>
                  <ArrowDownRight className="w-5 h-5 group-hover:translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
            <p className="text-center text-[10px] text-secondary/40 font-medium italic"> Funds will be returned to your active wallet upon confirmation.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
