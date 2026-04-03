'use client';

import { motion } from 'framer-motion';
import { ZoomHoverCard } from './ZoomHoverCard';
import { ChevronRight, TrendingUp, Shield, FlaskConical, AlertCircle, Zap } from 'lucide-react';

interface InvestRowProps {
  id: string;
  name: string;
  description: string;
  apy: string;
  aum: string;
  maxCap: string;
  withdrawal: string;
  type: 'STANDARD' | 'JUNIOR' | 'PROTECTED' | 'STRATEGY';
  riskLevel?: 'MINIMAL' | 'LOW' | 'HIGH' | 'MAX';
  isStealth?: boolean;
}

const typeConfig = {
  STANDARD: { icon: Shield, color: '#3b82f6', label: 'Senior' },
  JUNIOR: { icon: Zap, color: '#ec4899', label: 'Junior (First-Loss)' },
  PROTECTED: { icon: Shield, color: '#10b981', label: 'Protected' },
  STRATEGY: { icon: FlaskConical, color: '#8b5cf6', label: 'Strategy' },
};

const riskConfig = {
  MINIMAL: { label: 'Minimal Risk', color: '#10b981' },
  LOW: { label: 'Low Risk', color: '#3b82f6' },
  HIGH: { label: 'High Risk', color: '#f59e0b' },
  MAX: { label: 'Aggressive Alpha', color: '#ef4444' },
};

export function InvestRow({
  id,
  name,
  description,
  apy,
  aum,
  maxCap,
  withdrawal,
  type,
  riskLevel = 'LOW',
  isStealth = false,
}: InvestRowProps) {
  const config = typeConfig[type];
  const risk = riskConfig[riskLevel];
  const Icon = config.icon;
  
  const aumVal = parseFloat(aum.replace(/[^0-9.]/g, ''));
  const capVal = parseFloat(maxCap.replace(/[^0-9.]/g, ''));
  const progress = (aumVal / capVal) * 100;

  return (
    <ZoomHoverCard isStealth={isStealth}>
      <div className={`group relative flex flex-col md:flex-row items-center gap-6 p-6 rounded-2xl border transition-all duration-500 ${
        isStealth 
          ? 'bg-purple-900/10 border-purple-500/20 hover:border-purple-500/40 shadow-2xl shadow-purple-900/20' 
          : 'bg-white/[0.03] border-white/5 hover:border-white/20'
      }`}>
        {/* Left Section: Icon & Identity */}
        <div className="flex items-center gap-4 flex-1 min-w-0 w-full">
          <div 
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden"
            style={{ 
              background: isStealth ? 'rgba(168, 85, 247, 0.1)' : `${config.color}20`, 
              boxShadow: isStealth ? '0 0 30px rgba(168, 85, 247, 0.2)' : `0 0 20px ${config.color}30`,
              border: `1px solid ${isStealth ? 'rgba(168, 85, 247, 0.3)' : config.color + '40'}`
            }}
          >
            <Icon style={{ color: isStealth ? '#a855f7' : config.color }} size={28} />
            {type === 'JUNIOR' && (
              <motion.div 
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-pink-500/10"
              />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`text-xl font-bold truncate ${isStealth ? 'text-purple-100 font-mono tracking-tight' : 'text-white'}`}>
                {name}
              </h3>
              <div className="flex gap-1.5 overflow-hidden">
                <span 
                  className="text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold tracking-widest flex-shrink-0"
                  style={{ 
                    color: isStealth ? '#a855f7' : config.color, 
                    borderColor: isStealth ? 'rgba(168, 85, 247, 0.3)' : `${config.color}40`,
                    background: isStealth ? 'rgba(168, 85, 247, 0.05)' : `${config.color}10`
                  }}
                >
                  {config.label}
                </span>
                <span 
                  className="text-[9px] px-2 py-0.5 rounded-full border uppercase font-bold tracking-widest flex-shrink-0"
                  style={{ 
                    color: risk.color, 
                    borderColor: `${risk.color}30`,
                    background: `${risk.color}05`
                  }}
                >
                  {risk.label}
                </span>
              </div>
            </div>
            <p className="text-sm text-white/40 truncate mt-1">{description}</p>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-white/25 uppercase tracking-tighter">
              <span className="flex items-center gap-1"><AlertCircle size={10} /> Withdrawal: {withdrawal}</span>
              {type === 'JUNIOR' && <span className="text-pink-500/60 font-medium">Shortfall Covered First</span>}
            </div>
          </div>
        </div>

        {/* Middle Section: Metrics */}
        <div className="flex items-center gap-8 md:gap-12 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-white/5">
          {/* APY */}
          <div className="flex flex-col items-center md:items-end min-w-[100px]">
            <div className={`text-3xl font-bold tracking-tighter ${type === 'JUNIOR' ? 'text-pink-500' : 'text-white'}`}>
              {apy}
            </div>
            <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-bold">Est. APY</div>
          </div>

          {/* Allocation/AUM */}
          <div className="flex flex-col gap-2 w-full md:w-56">
            <div className="flex justify-between text-[11px] font-medium">
              <span className="text-white/40">Vault Capacity</span>
              <span className="text-white/80 font-mono">{aum} / {maxCap}</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: 0 }}
                whileInView={{ width: `${progress}%` }}
                viewport={{ once: true }}
                className="h-full rounded-full relative"
                style={{ background: isStealth ? 'linear-gradient(90deg, #6b21a8, #a855f7)' : config.color }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </motion.div>
            </div>
          </div>
        </div>

        {/* Right Section: Action */}
        <button className={`w-full md:w-auto px-8 py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 group-hover:gap-4 overflow-hidden relative ${
          isStealth
            ? 'bg-purple-600 text-white shadow-xl shadow-purple-600/30 hover:bg-purple-500'
            : 'bg-white/10 text-white hover:bg-white/20'
        }`}>
          {isStealth && <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />}
          <span className="relative z-10 uppercase tracking-widest">Deposit</span> 
          <ChevronRight size={18} className="relative z-10 transition-transform" />
        </button>
      </div>
    </ZoomHoverCard>
  );
}
