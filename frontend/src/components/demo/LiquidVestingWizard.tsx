'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  Lock, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ShieldCheck,
  Droplets,
  Coins
} from 'lucide-react';
import { 
  useAccount, 
  useChainId, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt
} from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { 
  getContract, 
  demoFaucetAbi, 
  usdcAbi,
  loanManagerAbi,
  sepolia
} from '@/config/contracts';
import { toast } from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

interface LiquidVestingWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LiquidVestingWizard({ isOpen, onClose }: LiquidVestingWizardProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const [step, setStep] = useState(0);
  const [usdcAmount, setUsdcAmount] = useState('20');
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [vestingAddress, setVestingAddress] = useState<string | null>(null);

  // Contract Addresses
  const usdcAddr = getContract(chainId, 'usdc');
  const faucetAddr = getContract(chainId, 'demoFaucet');
  const loanManagerAddr = getContract(chainId, 'loanManager');

  // Wagmi Hooks
  const { data: usdcBalance } = useReadContract({
    address: usdcAddr as `0x${string}`,
    abi: usdcAbi,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!usdcAddr && !!address }
  });

  const { writeContractAsync } = useWriteContract();
  const { isLoading: isWaitingForReceipt, data: receipt } = useWaitForTransactionReceipt({
    hash: txHash || undefined,
  });

  // Handle Lock Action
  const handleLock = async () => {
    if (!address || !faucetAddr || !usdcAddr) return;
    
    setIsApproving(true);
    try {
      const amountRaw = parseUnits(usdcAmount, 6); // USDC 6 decimals
      
      // 1. Approve
      const approveTx = await writeContractAsync({
        address: usdcAddr,
        abi: usdcAbi,
        functionName: 'approve',
        args: [faucetAddr, amountRaw],
      });
      setTxHash(approveTx);
      toast.success("Approval submitted!");
      
      // Wait for approval
      setIsApproving(false);
      setIsLocking(true);
      
      // 2. Lock
      const lockTx = await writeContractAsync({
        address: faucetAddr,
        abi: demoFaucetAbi,
        functionName: 'lockUSDCAndMint',
        args: [amountRaw, BigInt(12)], // 12 months
      });
      setTxHash(lockTx);
      toast.success("Locking request submitted!");
      
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Action failed");
      setIsApproving(false);
      setIsLocking(false);
    }
  };

  useEffect(() => {
    if (receipt && step === 1) {
      setStep(2);
      setIsLocking(false);
      // In a real app, we'd extract the vesting address from logs
      // For the demo, we'll trigger a refresh
      window.dispatchEvent(new Event('refresh-portfolio'));
    }
  }, [receipt, step]);

  const steps = [
    {
      title: "The Fuel",
      description: "Convert your USDC into a Sovereign Vesting position to unlock high-LTV credit lines.",
      icon: <Droplets className="w-8 h-8 text-accent-cyan" />,
      content: (
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-secondary">Available USDC</span>
              <span className="text-sm font-black text-white">{usdcBalance ? formatUnits(usdcBalance as bigint, 6) : '0.00'}</span>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-secondary">Amount to Lock</label>
              <div className="relative">
                <input 
                  type="number" 
                  value={usdcAmount}
                  onChange={(e) => setUsdcAmount(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-xl font-black text-glow-teal outline-none focus:border-accent-teal/50"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-500">USDC</span>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setStep(1)}
            className="w-full py-4 bg-accent-teal text-background font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-accent-cyan transition-all flex items-center justify-center gap-2"
          >
            Initiate Lock <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )
    },
    {
      title: "The Sovereign Seal",
      description: "We're wrapping your liquidity into a 12-month linear vesting NFT (vNFT).",
      icon: <Lock className="w-8 h-8 text-accent-teal" />,
      content: (
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
               <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${isApproving ? 'bg-accent-teal/10 border-accent-teal/40' : 'bg-white/5 border-white/5'}`}>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className={`w-5 h-5 ${isApproving ? 'text-accent-teal animate-pulse' : 'text-gray-600'}`} />
                    <span className="text-xs font-bold">Approve USDC Usage</span>
                  </div>
                  {isApproving && <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />}
               </div>
               <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${isLocking ? 'bg-accent-teal/10 border-accent-teal/40' : 'bg-white/5 border-white/5'}`}>
                  <div className="flex items-center gap-3">
                    <ShieldCheck className={`w-5 h-5 ${isLocking ? 'text-accent-teal animate-pulse' : 'text-gray-600'}`} />
                    <span className="text-xs font-bold">Mint Vesting NFT</span>
                  </div>
                  {isLocking && <Loader2 className="w-4 h-4 animate-spin text-accent-teal" />}
               </div>
          </div>
          
          <button 
            disabled={isApproving || isLocking || isWaitingForReceipt}
            onClick={handleLock}
            className="w-full py-4 bg-white/10 border border-white/10 text-white font-black uppercase tracking-[0.2em] rounded-2xl hover:bg-white/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isWaitingForReceipt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Confirm on Sepolia
          </button>
        </div>
      )
    },
    {
      title: "Credit Unlocked",
      description: "Your position is verified. You now have a \$10 Credit Line available.",
      icon: <Coins className="w-8 h-8 text-accent-cyan" />,
      content: (
        <div className="space-y-6">
          <div className="glass-card p-6 bg-accent-teal/5 border-accent-teal/20 text-center">
            <p className="text-[10px] font-black uppercase text-secondary mb-2">Maximum Credit Capacity</p>
            <p className="text-4xl font-black text-white italic tracking-tighter">$10.00 USDC</p>
            <p className="text-[10px] text-accent-teal font-medium mt-2 italic">Rank 3 • 50% LTV • 12% APR</p>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 bg-white/5 border border-white/5 text-gray-400 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-white/10 transition-all"
            >
              Dismiss
            </button>
            <button 
              className="flex-1 py-4 bg-accent-cyan text-background font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-white transition-all shadow-glow-cyan"
            >
              Borrow $10 Now
            </button>
          </div>
        </div>
      )
    }
  ];

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`Speed-to-Credit: Step ${step + 1}`}
    >
      <div className="space-y-8">
        <header className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-surface/50 border border-white/5 flex items-center justify-center shadow-xl">
             {steps[step].icon}
          </div>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tighter italic text-white">{steps[step].title}</h3>
            <p className="text-xs text-secondary font-medium leading-relaxed max-w-[280px]">{steps[step].description}</p>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {steps[step].content}
          </motion.div>
        </AnimatePresence>

        <footer className="pt-4 border-t border-white/5 flex justify-center gap-2">
           {[0, 1, 2].map(i => (
             <div 
                key={i} 
                className={`h-1 rounded-full transition-all duration-500 ${i === step ? 'w-8 bg-accent-teal' : 'w-2 bg-white/10'}`} 
             />
           ))}
        </footer>
      </div>
    </Modal>
  );
}
