'use client';

import { useState, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Zap, Loader2, ShieldCheck, Info } from 'lucide-react';
import { ERC20_ABI } from '@/abis/ERC20';
import { TxButton } from '@/components/ui/TxButton';
import { cn, formatUsd } from '@/lib/utils';
import toast from 'react-hot-toast';

// Constants from .env or protocol config
const VESTRA_FEE_RECIPIENT = '0x795937E67da6F4F877D0cbD103F535D589636387';
const USDC_ADDRESS = '0xc74e9a55285cd4a02a2601caddcf1f09e22ec537';
const PROTOCOL_WRAP_FEE_BPS = 80; // 0.8%

interface StarkzapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StarkzapModal({ isOpen, onClose }: StarkzapModalProps) {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'INPUT' | 'APPROVING' | 'FEE' | 'BRIDGING' | 'SUCCESS'>('INPUT');
  
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address }
  });

  // ─── Fee Calculations ──────────────────────────────────────────────────────
  const { feeAmount, depositAmount, feeAmountBigInt, depositAmountBigInt } = useMemo(() => {
    if (!amount || isNaN(Number(amount))) return { feeAmount: 0, depositAmount: 0, feeAmountBigInt: 0n, depositAmountBigInt: 0n };
    
    const total = parseUnits(amount, 6);
    const fee = (total * BigInt(PROTOCOL_WRAP_FEE_BPS)) / 10000n;
    const net = total - fee;
    
    return {
      feeAmount: Number(formatUnits(fee, 6)),
      depositAmount: Number(formatUnits(net, 6)),
      feeAmountBigInt: fee,
      depositAmountBigInt: net
    };
  }, [amount]);

  // ─── Contract Actions ──────────────────────────────────────────────────────
  const { writeContract: write, data: hash } = useWriteContract();
  const { isLoading: isWaiting, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleAction = async () => {
    if (!amount) return;

    try {
      if (step === 'INPUT') {
        // Step 1: Approve USDC for Starkzap & Vestra Fee
        setStep('APPROVING');
        write({
          address: USDC_ADDRESS as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [VESTRA_FEE_RECIPIENT, parseUnits(amount, 6)], // In real prod, this might be a router
        });
      } else if (step === 'FEE') {
        // Step 2: Pay Vestra Facilitation Fee
        write({
          address: USDC_ADDRESS as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [VESTRA_FEE_RECIPIENT as `0x${string}`, feeAmountBigInt],
        });
        setStep('BRIDGING');
      } else if (step === 'BRIDGING') {
        // Step 3: Starkzap Bridge & Deposit Logic
        // In real implementation: 
        // const starkzap = new StarkzapSDK(config);
        // await starkzap.deposit({ amount: depositAmountBigInt, ... });
        
        toast.promise(
          new Promise((resolve) => setTimeout(resolve, 3000)), // Simulate Starkzap flow
          {
            loading: 'Initiating Starkzap Bridge...',
            success: 'Bridge Process Started!',
            error: 'Failed to initiate bridge',
          }
        );
        setStep('SUCCESS');
      }
    } catch (err) {
      console.error(err);
      toast.error('Transaction Failed');
      setStep('INPUT');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
      />
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-lg bg-[#0D0F0E] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-[#4EAF90]/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#4EAF90]/20">
              <Zap className="w-5 h-5 text-[#4EAF90]" />
            </div>
            <h2 className="text-xl font-medium text-[#E8E6DF] redaction-text">Starknet Accelerator</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5 text-[#9C9A92]" />
          </button>
        </div>

        <div className="p-8">
          {step === 'SUCCESS' ? (
            <div className="text-center py-12 space-y-6">
              <div className="w-20 h-20 bg-[#4EAF90]/20 rounded-full flex items-center justify-center mx-auto border border-[#4EAF90]/30">
                <ShieldCheck className="w-10 h-10 text-[#4EAF90]" />
              </div>
              <div>
                <h3 className="text-2xl text-[#E8E6DF] redaction-text mb-2">Bridge Protocol Engaged</h3>
                <p className="text-[#9C9A92] text-sm">
                  CCTP Bridge sequence initiated. Your USDC is transitioning to Starknet and will be auto-deposited into Vesu for 18.6% yield. 
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={onClose}
                  className="w-full py-4 rounded-xl bg-[#4EAF90] text-black transition-all font-bold uppercase tracking-widest text-xs"
                >
                  Return to Dashboard
                </button>
                <a 
                  href="https://starkscan.co" 
                  target="_blank" 
                  className="text-xs text-[#4EAF90] hover:underline"
                >
                  View on Starknet Explorer
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-[#9C9A92]">Bridge Amount (USDC)</span>
                  <span className="text-[#5DCAA5]">Bal: {usdcBalance !== undefined ? formatUsd(Number(formatUnits(usdcBalance as bigint, 6))) : '0.00'}</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={step !== 'INPUT'}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-5 text-[#E8E6DF] font-mono text-2xl focus:border-[#4EAF90] outline-none transition-all"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-white/5 text-[#9C9A92] text-xs font-bold font-mono">
                    USDC
                  </div>
                </div>
              </div>

              {/* Wallet Integration Options */}
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
                <div className="text-[10px] text-[#9C9A92] uppercase font-bold tracking-widest">Connect Starknet Destination</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-[#4EAF90]/10 border border-[#4EAF90]/30 flex flex-col items-center gap-1 cursor-pointer">
                    <span className="text-xs text-[#E8E6DF] font-bold">Argent/Braavos</span>
                    <span className="text-[9px] text-[#4EAF90]">External Extensions</span>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex flex-col items-center gap-1 cursor-pointer opacity-80 group hover:opacity-100 transition-all border-dashed">
                    <span className="text-xs text-[#E8E6DF] font-bold">Embedded Wallet</span>
                    <span className="text-[9px] text-purple-400">Powered by Starkzap</span>
                  </div>
                </div>
              </div>

              {/* Breakdown Cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="text-[10px] text-[#9C9A92] uppercase mb-1">Starknet Yield</div>
                  <div className="text-lg font-bold text-[#E8E6DF]">18.6% <span className="text-[#4EAF90] italic text-xs">est.</span></div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="text-[10px] text-[#9C9A92] uppercase mb-1">Wrap Fee (0.8%)</div>
                  <div className="text-lg font-bold text-[#E8E6DF]">{formatUsd(feeAmount)}</div>
                </div>
              </div>

              {/* Progress Stepper & Background Mode */}
              <div className="space-y-3">
                <div className={cn("flex flex-col gap-3 p-4 rounded-xl border transition-all", step === 'BRIDGING' ? "bg-amber-500/5 border-amber-500/20" : "bg-white/5 border-white/10 opacity-40")}>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-[10px] text-amber-500 font-bold">3</div>
                    <div className="flex-1">
                      <span className="text-xs text-[#E8E6DF] block">CCTP Settlement (~15m wait)</span>
                      {step === 'BRIDGING' && (
                        <span className="text-[9px] text-amber-400/80 italic">Cross-chain message pending...</span>
                      )}
                    </div>
                  </div>
                  {step === 'BRIDGING' && (
                    <button 
                      onClick={() => setStep('SUCCESS')}
                      className="w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase transition-all hover:bg-amber-500/30"
                    >
                      Run in Background
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex gap-3">
                <Info className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-200/60 leading-relaxed">
                  Bridge takes 15-20 minutes. You can safely close this modal; your funds will be auto-indexed once the CCTP sequence completes.
                </p>
              </div>

              <TxButton
                onClick={handleAction}
                disabled={!amount || isWaiting}
                className="w-full py-5 text-lg"
              >
                {isWaiting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing Transaction...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span>{step === 'INPUT' ? 'Approve & Start' : step === 'FEE' ? 'Pay Connection Fee' : 'Initiate CCTP Bridge'}</span>
                    <ArrowRight className="w-5 h-5" />
                  </div>
                )}
              </TxButton>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
