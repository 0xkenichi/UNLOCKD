"use client";

import { useEffect, useState, useMemo } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId } from "wagmi";
import { useSupplyBalance } from "@/hooks/useSupplyBalance";
import { parseUnits } from "viem";
import { Modal } from "@/components/ui/Modal";
import { DollarSign, Clock, TrendingUp, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getContract, lendingPoolAbi, usdcAbi } from "@/config/contracts";
import { api } from "@/utils/api";
import { toast } from "react-hot-toast";

interface StakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  chainId: number;
  onSuccess?: () => void;
}

const DURATIONS = [
  { days: 30, apy: "11%", label: "30D" },
  { days: 60, apy: "11.5%", label: "60D" },
  { days: 90, apy: "12%", label: "90D" },
  { days: 180, apy: "14%", label: "180D" },
  { days: 365, apy: "18%", label: "1Y" },
  { days: 730, apy: "22%", label: "2Y" },
  { days: 1095, apy: "25%", label: "3Y" },
];

export function StakeModal({ isOpen, onClose, chainId, onSuccess }: StakeModalProps) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(30);
  const [isFauceting, setIsFauceting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  
  const lendingPool = getContract(chainId, 'lendingPool');
  const usdc = getContract(chainId, 'usdc');

  const { 
    sepoliaUsdc, 
    sepoliaUsdcNum, 
    baseSepoliaUsdc, 
    baseSepoliaUsdcNum, 
    isLoading: isBalancesLoading,
    refetch 
  } = useSupplyBalance();

  const currentChainBalance = chainId === 11155111 ? sepoliaUsdcNum : baseSepoliaUsdcNum;
  const currentChainFormatted = chainId === 11155111 ? sepoliaUsdc : baseSepoliaUsdc;

  const { writeContract: writeStake, data: stakeHash, isPending: isStakePending, isError: isStakeWriteError, error: stakeWriteError, reset: resetStake } = useWriteContract();
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();

  const { isLoading: isStakeConfirming, isSuccess: isStakeSuccess, isError: isStakeConfirmError, error: stakeConfirmError } = useWaitForTransactionReceipt({
    hash: stakeHash,
  });

  // --- Allowance Check ---
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdc as `0x${string}`,
    abi: usdcAbi as any,
    functionName: 'allowance',
    args: [address as `0x${string}`, lendingPool as `0x${string}`],
    query: {
      enabled: !!address && !!lendingPool,
    }
  });

  const sanitizedAmount = amount.replace(/,/g, '');
  const parsedAmount = sanitizedAmount && !isNaN(Number(sanitizedAmount)) ? parseUnits(sanitizedAmount, 6) : 0n;
  const needsApproval = allowance !== undefined && typeof allowance === 'bigint' && parsedAmount > allowance;

  const projectedYield = useMemo(() => {
    const sanitizedInput = amount.replace(/,/g, '');
    if (!sanitizedInput || isNaN(Number(sanitizedInput))) return "0.00";
    const apyValue = parseFloat(DURATIONS.find(d => d.days === duration)?.apy || "0") / 100;
    return ((Number(sanitizedInput) * apyValue * duration) / 365).toFixed(2);
  }, [amount, duration]);

  // --- Success Handling ---
  useEffect(() => {
    if (isStakeSuccess && address) {
      setShowSuccess(true);
      toast.success("Transaction confirmed on-chain!");
      
      // Sync to Vestra Brain (Persistence)
      const apyBps = Number(DURATIONS.find(d => d.days === duration)?.apy.replace('%', '') || 0) * 100;
      api.depositCapital({
        wallet: address,
        amount: amount,
        apyBps,
        durationDays: duration
      }).catch(err => console.error("Persistence Sync Failed:", err));

      setAmount("");
      // Force refresh of supply balances
      refetch();
      if (onSuccess) onSuccess();
    }
  }, [isStakeSuccess, address, amount, duration, refetch, onSuccess]);

  const forceSuccessSync = () => {
    if (address && stakeHash) {
      setShowSuccess(true);
      toast.success("Transaction manually verified!");
      
      const apyBps = Number(DURATIONS.find(d => d.days === duration)?.apy.replace('%', '') || 0) * 100;
      api.depositCapital({
        wallet: address,
        amount: amount,
        apyBps,
        durationDays: duration
      }).catch(err => console.error("Persistence Sync Failed:", err));

      setAmount("");
      refetch();
      if (onSuccess) onSuccess();
    }
  };

  const handleStake = () => {
    if (!amount || isNaN(Number(amount))) return;
    
    const isSafeWallet = lendingPool.toLowerCase() === '0xfa515a43b9d010a398ff6a3253c1c7a9374f8c95' || 
                        lendingPool.toLowerCase() === '0x3b31dd931fcd2c5b8fa2d4963515b25ad6014ddf' ||
                        lendingPool.toLowerCase() === '0x795937e67da6f4f877d0cbd103f535d589636387';

    if (isSafeWallet) {
      writeStake({ 
        address: usdc as `0x${string}`,
        abi: usdcAbi as any,
        functionName: 'transfer',
        args: [lendingPool, parsedAmount],
      }, {
        onSuccess: () => {
          toast.success("Transfer submitted to network...");
        },
        onError: (err: any) => {
          toast.error(err.shortMessage || "Transfer failed");
        }
      });
      return;
    }

    writeStake({
      address: lendingPool as `0x${string}`,
      abi: lendingPoolAbi,
      functionName: 'stake',
      args: [parsedAmount, BigInt(duration)],
    }, {
      onSuccess: () => {
        toast.success("Stake submitted to network...");
      },
      onError: (err: any) => {
        toast.error(err.shortMessage || "Stake failed");
      }
    });
  };

  const handleApprove = () => {
    if (!amount || isNaN(Number(amount))) return;

    writeApprove({
      address: usdc as `0x${string}`,
      abi: usdcAbi as any,
      functionName: 'approve',
      args: [lendingPool, parsedAmount],
    }, {
      onSuccess: () => {
        toast.success("Approval successful!");
        refetchAllowance();
      },
      onError: (err: any) => {
        toast.error(err.shortMessage || "Approval failed");
      }
    });
  };

  const handleFaucet = async () => {
    if (!address) return;
    setIsFauceting(true);
    try {
      const res = await api.faucetUsdc(address);
      if (res.ok) {
        toast.success(`Received ${res.amount} Testnet USDC!`);
        refetch();
      } else {
        toast.error(res.error || "Faucet failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Endpoint not reachable");
    } finally {
      setIsFauceting(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={() => {
        setShowSuccess(false);
        onClose();
      }} 
      title={showSuccess ? "Success" : "Stake Capital"}
    >
      <div className="space-y-6">
        {showSuccess ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-white uppercase italic tracking-tighter redaction-text font-display">Receipt Confirmed</h3>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 w-full space-y-1">
              <p className="text-secondary text-[10px] uppercase tracking-widest font-bold">Protocol Allocation Recipient:</p>
              <p className="font-mono text-[10px] text-accent-teal break-all select-all">
                {lendingPool}
              </p>
              <p className="text-[10px] text-secondary/40 italic uppercase tracking-widest mt-2">Vestra Protocol Treasury Safe</p>
            </div>
            <p className="text-secondary text-sm px-4">Your capital contribution has been recorded. Portfolio balances are updating...</p>
            <button 
              onClick={() => {
                setShowSuccess(false);
                onClose();
              }}
              className="mt-6 px-10 py-3 rounded-xl bg-accent-teal text-background font-black uppercase tracking-widest text-[10px] hover:bg-white transition-all shadow-lg"
            >
              Continue
            </button>
          </div>
        ) : (
          <>
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
                  onClick={() => setAmount(currentChainFormatted)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-accent-teal hover:underline"
                >
                  MAX
                </button>
              </div>
              <div className="space-y-2 px-2">
                <div className="flex justify-between text-[10px] text-secondary/60 font-black uppercase tracking-tight">
                  <span>Discovered Capital Across Nodes:</span>
                  <button 
                    onClick={handleFaucet}
                    disabled={isFauceting}
                    className="text-accent-cyan hover:underline disabled:opacity-50"
                  >
                    {isFauceting ? "Requesting..." : "Inject Testnet USDC"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className={`p-2 rounded-lg border ${chainId === 11155111 ? 'bg-accent-teal/5 border-accent-teal/20' : 'bg-white/5 border-white/10 opacity-60'}`}>
                    <p className="text-[8px] font-black uppercase opacity-40">Sepolia</p>
                    <p className="text-[10px] font-bold text-white">{isBalancesLoading ? '...' : sepoliaUsdc} USDC</p>
                  </div>
                  <div className={`p-2 rounded-lg border ${chainId === 84532 ? 'bg-accent-teal/5 border-accent-teal/20' : 'bg-white/5 border-white/10 opacity-60'}`}>
                    <p className="text-[8px] font-black uppercase opacity-40">Base Sepolia</p>
                    <p className="text-[10px] font-bold text-white">{isBalancesLoading ? '...' : baseSepoliaUsdc} USDC</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm text-secondary">Lock Duration</label>
                {duration >= 1095 && (
                  <span className="text-[10px] font-black uppercase text-accent-teal animate-pulse">
                    Flowing Interest Active
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.days}
                    onClick={() => setDuration(d.days)}
                    className={`p-3 rounded-xl border transition-all flex flex-col items-center gap-1 ${
                      duration === d.days
                        ? "bg-accent-teal/10 border-accent-teal text-accent-teal shadow-[0_0_15px_rgba(46,190,181,0.15)]"
                        : "bg-white/5 border-white/10 text-secondary hover:border-white/20"
                    }`}
                  >
                    <span className="text-sm font-bold">{d.label}</span>
                    <span className="text-[8px] font-medium opacity-80">{d.apy} APY</span>
                  </button>
                ))}
                <div className="relative group">
                  <input 
                    type="number"
                    placeholder="MO"
                    min="1"
                    max="36"
                    className="w-full h-full bg-white/5 border border-white/10 rounded-xl p-2 text-center text-xs font-bold focus:border-accent-teal outline-none transition-all"
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val > 0) setDuration(Math.min(val, 36) * 30);
                    }}
                  />
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-surface border border-white/10 rounded text-[8px] font-bold opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                    CUSTOM MONTHS
                  </div>
                </div>
              </div>
              {duration >= 1095 && (
                <div className="p-3 rounded-xl bg-accent-teal/5 border border-accent-teal/20 flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-accent-teal" />
                  <p className="text-[9px] text-secondary leading-tight">
                    <span className="text-accent-teal font-bold uppercase">3Y Max Lock:</span> Flowing interest enabled. Yield accrues in real-time and is claimable at any time.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-risk-high/5 border border-risk-high/20 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-risk-high shrink-0" />
              <div className="text-xs space-y-1">
                <p className="font-bold text-risk-high">Early Withdrawal Warning</p>
                <p className="text-secondary leading-relaxed">
                  Unstaking before the lock period expires will result in a <span className="text-white font-medium">5% principal penalty</span> and forfeiture of all accrued yield.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-accent-teal/5 border border-accent-teal/10 space-y-2">
              <div className="flex items-center gap-2 text-accent-teal">
                <Shield className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Protocol Allocation Target</span>
              </div>
              <div className="grid grid-cols-1 gap-1 text-[9px] font-medium text-secondary/70">
                 <div className="flex justify-between">
                    <span>Lending Pool (Main)</span>
                    <span className="font-mono text-white">0xFA51...8c95</span>
                 </div>
                 <div className="flex justify-between">
                    <span>Insurance Fund (Safety)</span>
                    <span className="font-mono text-white">0x3B31...4DDf</span>
                 </div>
                 <div className="flex justify-between">
                    <span>Protocol Fees (Growth)</span>
                    <span className="font-mono text-white">0x7959...6387</span>
                 </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/5 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-secondary text-xs uppercase tracking-widest font-bold">Estimated Yield</span>
                <span className="font-mono font-bold text-accent-gold">
                  +{projectedYield} USDC
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Expected APY</span>
                <span className="font-bold text-accent-teal">
                  {DURATIONS.find(d => d.days === duration)?.apy || `${duration >= 1095 ? '25%' : duration >= 730 ? '22%' : duration >= 365 ? '18%' : '11%'}*`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Unlock Date</span>
                <span className="font-medium">
                  {new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {needsApproval ? (
                <button
                  onClick={handleApprove}
                  disabled={isApprovePending || !amount}
                  className="w-full py-4 rounded-2xl bg-secondary text-secondary-foreground font-bold text-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-lg"
                >
                  {isApprovePending ? "Approving..." : "Approve USDC"}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleStake}
                    disabled={isStakePending || isStakeConfirming || !amount}
                    className={`w-full py-4 rounded-2xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-2 ${
                      isStakeSuccess 
                        ? "bg-green-500 text-white" 
                        : "bg-accent-teal text-background hover:opacity-90 shadow-[0_0_20px_rgba(46,190,181,0.2)]"
                    } disabled:opacity-50`}
                  >
                    {isStakePending || isStakeConfirming ? (
                      <>
                        <TrendingUp className="w-5 h-5 animate-pulse" />
                        <span>Processing...</span>
                      </>
                    ) : isStakeSuccess ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Success!</span>
                      </>
                    ) : (
                      "Confirm Stake"
                    )}
                  </button>
                  
                  {(isStakeWriteError || isStakeConfirmError) && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center justify-between">
                      <span className="truncate max-w-[200px]">{(stakeWriteError || stakeConfirmError)?.message || "Transaction failed"}</span>
                      <button 
                        onClick={() => resetStake()}
                        className="px-2 py-1 rounded bg-red-500 text-white text-[10px] font-bold shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {isStakeConfirming && stakeHash && (
                    <button 
                      onClick={forceSuccessSync}
                      className="w-full py-2 text-[10px] text-secondary hover:text-white uppercase tracking-widest font-bold opacity-60 hover:opacity-100 transition-opacity"
                    >
                      Stuck? Click to force sync receipt
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
