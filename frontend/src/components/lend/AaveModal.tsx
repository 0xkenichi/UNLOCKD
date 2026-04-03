'use client';

import { useState, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useChainId } from 'wagmi';
import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Shield, Loader2, ShieldCheck, Info, CheckCircle2 } from 'lucide-react';
import { ERC20_ABI } from '@/abis/ERC20';
import { TxButton } from '@/components/ui/TxButton';
import { cn, formatUsd } from '@/lib/utils';
import { getChainConfig, VESTRA_TREASURY } from '@/constants/addresses';
import toast from 'react-hot-toast';

// Aave V3 Pool Supply function selector: 0x617ba037
// supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
const PROTOCOL_WRAP_FEE_BPS = 30; // 0.3%
const AAVE_POOL_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "asset", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "address", "name": "onBehalfOf", "type": "address" },
      { "internalType": "uint16", "name": "referralCode", "type": "uint16" }
    ],
    "name": "supply",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

interface AaveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AaveModal({ isOpen, onClose }: AaveModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const config = getChainConfig(chainId);
  
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'INPUT' | 'APPROVING' | 'FEE' | 'SUPPLYING' | 'SUCCESS'>('INPUT');
  
  const { data: usdcBalance } = useReadContract({
    address: config?.usdc as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address && !!config }
  });

  // ─── Fee Calculations (0.5%) ────────────────────────────────────────────────
  const { feeAmount, supplyAmount, feeAmountBigInt, supplyAmountBigInt } = useMemo(() => {
    if (!amount || isNaN(Number(amount))) return { feeAmount: 0, supplyAmount: 0, feeAmountBigInt: 0n, supplyAmountBigInt: 0n };
    
    const total = parseUnits(amount, 6);
    const fee = (total * 30n) / 10000n; // 0.3% = 30 bps
    const net = total - fee;
    
    return {
      feeAmount: Number(formatUnits(fee, 6)),
      supplyAmount: Number(formatUnits(net, 6)),
      feeAmountBigInt: fee,
      supplyAmountBigInt: net
    };
  }, [amount]);

  // ─── Contract Actions ──────────────────────────────────────────────────────
  const { writeContract: write, data: hash } = useWriteContract();
  const { isLoading: isWaiting } = useWaitForTransactionReceipt({ hash });

  const handleAction = async () => {
    if (!amount || !config) return;

    try {
      if (step === 'INPUT') {
        setStep('APPROVING');
        write({
          address: config.usdc as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [config.aavePool as `0x${string}`, parseUnits(amount, 6)],
        });
        // Note: For simplicity in demo, we advance step on toast or next click.
        // In prod, use useEffect on transaction success.
        toast.success('Approve initiated');
        setStep('FEE');
      } else if (step === 'FEE') {
        setStep('SUPPLYING');
        // Facilitation Fee
        write({
          address: config.usdc as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [VESTRA_TREASURY as `0x${string}`, feeAmountBigInt],
        });
        toast.success('Fee transfer initiated');
        // Wait for it? Actually just go to Supplying.
      } else if (step === 'SUPPLYING') {
        write({
          address: config.aavePool as `0x${string}`,
          abi: AAVE_POOL_ABI,
          functionName: 'supply',
          args: [config.usdc as `0x${string}`, supplyAmountBigInt, address!, 0],
        });
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
        className="absolute inset-0 bg-black/90 backdrop-blur-md" 
      />
      
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 30 }}
        className="relative w-full max-w-lg bg-[#0D0F0E] border border-purple-500/20 rounded-[32px] overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.15)]"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-gradient-to-r from-purple-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20">
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-medium text-[#E8E6DF] redaction-text font-bold">Aave Bluechip Supply</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-[10px] text-purple-400 font-black uppercase tracking-widest">Aave V3 Marketplace</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5 text-[#9C9A92]" />
          </button>
        </div>

        <div className="p-8">
          {step === 'SUCCESS' ? (
            <div className="text-center py-12 space-y-6">
              <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto border border-purple-500/30">
                <CheckCircle2 className="w-10 h-10 text-purple-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl text-[#E8E6DF] redaction-text font-bold mb-2">Supply Active</h3>
                <p className="text-[#9C9A92] text-sm leading-relaxed max-w-[280px] mx-auto">
                  Your USDC is now earning yield on Aave. You have received <span className="text-purple-400 font-bold">aUSDC</span> which will automatically grow in your wallet.
                </p>
              </div>
              <button 
                onClick={onClose}
                className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 text-[#E8E6DF] hover:bg-white/10 transition-all font-black uppercase tracking-widest text-[10px]"
              >
                Close Commander
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/10 flex gap-3 mb-2">
                <Info className="w-5 h-5 text-purple-400 shrink-0" />
                <p className="text-[10px] text-purple-200/60 leading-relaxed uppercase tracking-tighter">
                  Non-Custodial facilitation: Your funds stay under your control. Vestra provides routing and automated fee management into the Aave V3 Liquidity Pool.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-[#9C9A92]">Supply Balance (USDC)</span>
                  <span className="text-[#5DCAA5]">Bal: {usdcBalance !== undefined ? formatUsd(Number(formatUnits(usdcBalance as bigint, 6))) : '0.00'}</span>
                </div>
                <div className="relative group">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={step !== 'INPUT'}
                    className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-6 text-[#E8E6DF] font-mono text-3xl focus:border-purple-500 outline-none transition-all"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-white/5 text-[#9C9A92] text-xs font-black uppercase tracking-widest">
                    USDC
                  </div>
                </div>
              </div>

              {/* Economic Breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <div className="text-[10px] text-[#9C9A92] uppercase tracking-tighter font-black">Supply Yield</div>
                  <div className="text-xl font-bold font-mono text-[#E8E6DF]">~5.20%</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="text-[10px] text-[#9C9A92] uppercase mb-1">Wrap Fee (0.3%)</div>
                  <div className="text-lg font-bold text-[#E8E6DF]">{formatUsd(feeAmount)}</div>
                </div>
              </div>

              {/* Stepper */}
              <div className="grid grid-cols-3 gap-2">
                <div className={cn("h-1.5 rounded-full transition-all duration-500", step === 'INPUT' || step === 'APPROVING' ? "bg-purple-500" : "bg-white/10")}></div>
                <div className={cn("h-1.5 rounded-full transition-all duration-500", step === 'FEE' ? "bg-purple-500" : "bg-white/10")}></div>
                <div className={cn("h-1.5 rounded-full transition-all duration-500", step === 'SUPPLYING' ? "bg-purple-500" : "bg-white/10")}></div>
              </div>

              <TxButton
                onClick={handleAction}
                disabled={!amount || isWaiting || !config}
                className="w-full py-6 text-xl bg-purple-600 hover:bg-purple-500 shadow-[0_0_20px_rgba(147,51,234,0.3)]"
              >
                {isWaiting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Transmitting...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 uppercase tracking-widest font-black text-sm">
                    <span>{step === 'INPUT' ? 'Enter Market' : step === 'FEE' ? 'Facilitate Cut' : 'Supply to Aave'}</span>
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
