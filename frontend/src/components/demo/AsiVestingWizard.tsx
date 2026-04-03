'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  Hammer, 
  ScrollText, 
  Rocket, 
  ArrowRight, 
  CheckCircle2, 
  Loader2, 
  RefreshCw,
  Coins
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';

interface AsiVestingWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AsiVestingWizard({ isOpen, onClose }: AsiVestingWizardProps) {
  const [step, setStep] = useState(0);
  const [isDeploying, setIsDeploying] = useState(false);
  const [tokenData, setTokenData] = useState({ name: 'Vestra Token', symbol: 'VSTR', supply: '1000000' });
  const [vestingData, setVestingData] = useState({ beneficiary: '04a7b0a...df649c', amount: '50000', unlockBlock: '100000' });
  const [deploymentResult, setDeploymentResult] = useState<{ tokenUri?: string; vestingUri?: string }>({});

  const handleDeployToken = async () => {
    setIsDeploying(true);
    try {
      const resp = await fetch('http://localhost:4000/api/asi/deploy-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tokenData, owner: vestingData.beneficiary })
      });
      const data = await resp.json();
      if (data.success) {
        setDeploymentResult(prev => ({ ...prev, tokenUri: data.uri }));
        toast.success(`Token ${tokenData.symbol} deployed to ASI Chain!`);
        setStep(1);
      } else {
        throw new Error(data.error || 'Deployment failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleDeployVesting = async () => {
    setIsDeploying(true);
    try {
      const resp = await fetch('http://localhost:4000/api/asi/create-vesting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vestingData)
      });
      const data = await resp.json();
      if (data.success) {
        setDeploymentResult(prev => ({ ...prev, vestingUri: data.uri }));
        toast.success("Vesting contract deployed!");
        setStep(2);
      } else {
        throw new Error(data.error || 'Deployment failed');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsDeploying(false);
    }
  };

  const steps = [
    {
      title: "Token Creation",
      description: "Define your project's heartbeat. We'll deploy a standard Rholang token on ASI Chain DevNet.",
      icon: <Hammer className="w-8 h-8 text-accent-teal" />,
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-secondary">Token Name</label>
              <input 
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent-teal outline-none" 
                value={tokenData.name}
                onChange={e => setTokenData({...tokenData, name: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-secondary">Symbol</label>
              <input 
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent-teal outline-none" 
                value={tokenData.symbol}
                onChange={e => setTokenData({...tokenData, symbol: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-black text-secondary">Initial Supply</label>
            <input 
              type="number"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent-teal outline-none font-mono" 
              value={tokenData.supply}
              onChange={e => setTokenData({...tokenData, supply: e.target.value})}
            />
          </div>
          <button 
            onClick={handleDeployToken}
            disabled={isDeploying}
            className="w-full py-4 bg-accent-teal text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all flex items-center justify-center gap-2"
          >
            {isDeploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Create Token
          </button>
        </div>
      )
    },
    {
      title: "The Covenant",
      description: "Establish the vesting timeline. This contract will lock the tokens and release them to the beneficiary.",
      icon: <ScrollText className="w-8 h-8 text-accent-cyan" />,
      content: (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-black text-secondary">Beneficiary (ASI Address)</label>
            <input 
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs focus:border-accent-teal outline-none font-mono" 
              value={vestingData.beneficiary}
              onChange={e => setVestingData({...vestingData, beneficiary: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-secondary">Vesting Amount</label>
              <input 
                type="number"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent-teal outline-none font-mono" 
                value={vestingData.amount}
                onChange={e => setVestingData({...vestingData, amount: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-secondary">Unlock Block</label>
              <input 
                type="number"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-accent-teal outline-none font-mono" 
                value={vestingData.unlockBlock}
                onChange={e => setVestingData({...vestingData, unlockBlock: e.target.value})}
              />
            </div>
          </div>
          <button 
            onClick={handleDeployVesting}
            disabled={isDeploying}
            className="w-full py-4 bg-accent-cyan text-background font-black uppercase tracking-widest rounded-2xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-glow-cyan"
          >
            {isDeploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Sign Covenant
          </button>
        </div>
      )
    },
    {
      title: "The Deployment Mirror",
      description: "Your protocol assets are live on ASI Chain DevNet. Use the URIs below to interact with them.",
      icon: <Rocket className="w-8 h-8 text-glow-teal animate-bounce" />,
      content: (
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-secondary">Token URI</label>
              <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-[10px] font-mono text-accent-teal break-all">
                {deploymentResult.tokenUri}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-black text-secondary">Vesting URI</label>
              <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-[10px] font-mono text-accent-cyan break-all">
                {deploymentResult.vestingUri}
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-full py-4 bg-surface border border-white/10 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-2"
          >
            Back to Dashboard
          </button>
        </div>
      )
    }
  ];

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`ASI Chain Setup: Step ${step + 1}`}
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
