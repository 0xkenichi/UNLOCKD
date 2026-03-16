"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance, useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { Modal } from "@/components/ui/Modal";
import { DollarSign, Clock, TrendingUp, Shield, AlertTriangle } from "lucide-react";
import { getContract, lendingPoolAbi, usdcAbi } from "@/config/contracts";
import { api } from "@/utils/api";
import { toast } from "react-hot-toast";

interface StakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
}

const DURATIONS = [
  { days: 30, apy: "11%" },
  { days: 90, apy: "12%" },
  { days: 180, apy: "14%" },
];

export function StakeModal({ isOpen, onClose, chainId }: StakeModalProps) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(30);
  const [isFauceting, setIsFauceting] = useState(false);
  
  const lendingPool = getContract(chainId, 'lendingPool');
  const usdc = getContract(chainId, 'usdc');

  const { data: usdcBalance } = useReadContract({
    address: usdc,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address && !!usdc }
  });

  const { writeContract: writeStake, data: stakeHash, isPending: isStakePending } = useWriteContract();
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();

  const { isLoading: isStakeConfirming, isSuccess: isStakeSuccess } = useWaitForTransactionReceipt({
    hash: stakeHash,
  });

  const handleStake = () => {
    if (!amount || isNaN(Number(amount))) return;
    const parsedAmount = parseUnits(amount, 6);

    writeStake({
      address: lendingPool,
      abi: lendingPoolAbi,
      functionName: 'stake',
      args: [parsedAmount, BigInt(duration)],
    });
  };

  const handleApprove = () => {
    if (!amount || isNaN(Number(amount))) return;
    const parsedAmount = parseUnits(amount, 6);

    writeApprove({
      address: usdc,
      abi: usdcAbi as any,
      functionName: 'approve',
      args: [lendingPool, parsedAmount],
    });
  };

  const handleFaucet = async () => {
    if (!address) return;
    setIsFauceting(true);
    try {
      const res = await api.post('/api/faucet/usdc', { address });
      if (res.ok) {
        toast.success(`Received ${res.amount} Testnet USDC!`);
      } else {
        toast.error(res.error || "Faucet failed");
      }
    } catch (err) {
      toast.error("Endpoint not reachable");
    } finally {
      setIsFauceting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stake Capital">
      <div className="space-y-6">
        {/* Amount Input */}
        <div className="space-y-2">
          <label className="text-sm text-secondary">Amount to Stake (USDC)</label>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xl font-bold focus:outline-none focus:border-accent-teal transition-colors"
            />
            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary" />
            <button 
              onClick={() => setAmount(formatUnits(usdcBalance || BigInt(0), 6))}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-accent-teal hover:underline"
            >
              MAX
            </button>
          </div>
          <div className="flex justify-between text-xs text-secondary px-2">
            <span>Balance: {usdcBalance !== undefined ? `${formatUnits(usdcBalance, 6)} USDC` : "0.00"}</span>
            <button 
              onClick={handleFaucet}
              disabled={isFauceting}
              className="text-accent-cyan hover:underline font-bold disabled:opacity-50"
            >
              {isFauceting ? "Requesting..." : "Get Testnet USDC"}
            </button>
          </div>
        </div>

        {/* Duration Selection */}
        <div className="space-y-2">
          <label className="text-sm text-secondary">Lock Duration</label>
          <div className="grid grid-cols-3 gap-3">
            {DURATIONS.map((d) => (
              <button
                key={d.days}
                onClick={() => setDuration(d.days)}
                className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-1 ${
                  duration === d.days
                    ? "bg-accent-teal/10 border-accent-teal text-accent-teal shadow-[0_0_15px_rgba(46,190,181,0.15)]"
                    : "bg-white/5 border-white/10 text-secondary hover:border-white/20"
                }`}
              >
                <Clock className="w-4 h-4" />
                <span className="text-lg font-bold">{d.days}D</span>
                <span className="text-[10px] font-medium opacity-80">{d.apy} APY</span>
              </button>
            ))}
          </div>
        </div>

        {/* Info Box */}
        <div className="p-4 rounded-2xl bg-risk-high/5 border border-risk-high/20 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-risk-high shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-risk-high">Early Withdrawal Warning</p>
            <p className="text-secondary leading-relaxed">
              Unstaking before the lock period expires will result in a <span className="text-white font-medium">5% principal penalty</span> and forfeiture of all accrued yield.
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 rounded-2xl bg-white/5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-secondary">Expected APY</span>
            <span className="font-bold text-accent-teal">
              {DURATIONS.find(d => d.days === duration)?.apy}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-secondary">Unlock Date</span>
            <span className="font-medium">
              {new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleStake}
          disabled={isStakePending || isStakeConfirming || !amount}
          className="w-full py-4 rounded-2xl bg-accent-teal text-background font-bold text-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(46,190,181,0.2)]"
        >
          {isStakePending || isStakeConfirming ? "Processing..." : "Confirm Stake"}
        </button>
      </div>
    </Modal>
  );
}
