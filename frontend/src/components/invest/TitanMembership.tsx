'use client';

import { motion } from 'framer-motion';
import { Shield, Lock, Award, Star, ArrowRight, TrendingUp, FlaskConical, AlertTriangle } from 'lucide-react';
import { ZoomHoverCard } from './ZoomHoverCard';
import { InvestRow } from './InvestRow';

interface TitanMembershipProps {
  isVerified: boolean;
  onVerify: () => void;
  onApply: () => void;
  vaults: any[];
}

export function TitanMembership({ isVerified, onVerify, onApply, vaults }: TitanMembershipProps) {
  if (isVerified) {
    return (
      <div className="space-y-12 pb-20">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-2xl font-bold text-purple-100 font-mono uppercase tracking-widest mb-2">Exclusive Titan Tranches</h2>
            <p className="text-purple-100/40 text-sm max-w-lg">
              High-yield liquidity pools backed by the Vestra Risk Engine. First-loss tranches offer amplified rewards for strategic lenders.
            </p>
          </div>
          <div className="flex gap-4">
             <div className="px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs font-bold text-purple-400">
               ALLOCATION: $450,230
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {vaults.map((vault) => (
            <InvestRow 
              key={vault.id} 
              {...vault} 
              isStealth={true} 
            />
          ))}
        </div>

        {/* Risk Notice for Titan */}
        <div className="p-6 rounded-2xl bg-purple-900/10 border border-purple-500/20 flex gap-4 items-start">
          <AlertTriangle className="text-purple-400 shrink-0" size={24} />
          <div className="space-y-2">
            <h4 className="text-sm font-bold text-purple-100 uppercase tracking-tight">Risk Disclosure: Junior Tranches</h4>
            <p className="text-xs text-purple-100/50 leading-relaxed">
              Junior pools (USD*-J) absorb the first 100% of losses from defaulted vesting contracts or unsuccessful liquidations. Lenders in these pools act as the primary buffer for the Senior tranches. Size your allocation based on your risk tolerance for protocol shortfall events.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[600px] flex flex-col items-center justify-center py-20 px-6 overflow-hidden">
      {/* Background Watermark / Logo */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.05, scale: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className="w-[600px] h-[600px] rounded-full border-[40px] border-purple-500/20 blur-3xl" />
        <Shield size={400} className="text-purple-500/20 absolute rotate-12" />
      </motion.div>

      <div className="relative z-10 max-w-2xl w-full text-center space-y-12">
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-6xl font-bold font-display tracking-tight text-white mb-6 uppercase stealth-glitch" data-text="VESTRA TITAN">
            Vestra Titan
          </h1>
          <p className="text-xl text-purple-100/60 leading-relaxed font-light">
            Vestra Titan is an invitation-only membership for users holding $100,000+ in Vestra, offering direct access to our team, exclusive reports, and early visibility into new strategies.
          </p>
        </motion.div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: Lock, label: 'Exclusive Information' },
            { icon: Star, label: 'Early Access' },
            { icon: Award, label: 'Dedicated Support' },
          ].map((feature, i) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5"
            >
              <feature.icon className="text-purple-400" size={24} />
              <span className="text-xs font-bold uppercase tracking-widest text-white/60">{feature.label}</span>
            </motion.div>
          ))}
        </div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6"
        >
          <button 
            onClick={onVerify}
            className="w-full sm:w-48 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-bold hover:bg-white/10 transition-all font-mono uppercase text-xs tracking-widest"
          >
            Verify Tier
          </button>
          <button 
            onClick={onApply}
            className="w-full sm:w-48 py-4 rounded-xl bg-purple-600 text-white font-bold shadow-lg shadow-purple-600/30 hover:bg-purple-500 flex items-center justify-center gap-2 group transition-all font-mono uppercase text-xs tracking-widest"
          >
            Apply Access
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>

      <style jsx>{`
        .stealth-glitch {
          position: relative;
          color: white;
          text-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
        }
        
        .stealth-glitch::before,
        .stealth-glitch::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0.8;
        }

        .stealth-glitch::before {
          color: #0ff;
          z-index: -1;
          animation: glitch-left 3s infinite linear alternate-reverse;
        }

        .stealth-glitch::after {
          color: #f0f;
          z-index: -2;
          animation: glitch-right 3s infinite linear alternate-reverse;
        }

        @keyframes glitch-left {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 1px); }
          40% { transform: translate(-1px, -1px); }
          60% { transform: translate(1px, 2px); }
          80% { transform: translate(2px, -1px); }
          100% { transform: translate(0); }
        }

        @keyframes glitch-right {
          0% { transform: translate(0); }
          20% { transform: translate(2px, -1px); }
          40% { transform: translate(1px, 1px); }
          60% { transform: translate(-1px, -2px); }
          80% { transform: translate(-2px, 1px); }
          100% { transform: translate(0); }
        }
      `}</style>
    </div>
  );
}
