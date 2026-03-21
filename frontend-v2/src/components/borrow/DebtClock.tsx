"use client";

import React, { useState, useEffect } from "react";
import { Clock, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface DebtClockProps {
  loan: {
    id: string;
    amount: string;
    duration_days: number;
    created_at: string;
  };
}

export function DebtClock({ loan }: DebtClockProps) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [showTime, setShowTime] = useState(true);
  const [percentDone, setPercentDone] = useState(0);

  useEffect(() => {
    if (!loan.created_at || !loan.duration_days) {
      setTimeLeft("INITIALIZING...");
      return;
    }

    const timer = setInterval(() => {
      const created = new Date(loan.created_at).getTime();
      const durationMs = (Number(loan.duration_days) || 30) * 24 * 60 * 60 * 1000;
      const expiry = created + durationMs;
      const now = Date.now();
      const diff = expiry - now;

      if (isNaN(created) || isNaN(expiry)) {
        setTimeLeft("PENDING SYNC");
        clearInterval(timer);
        return;
      }

      if (diff <= 0) {
        setTimeLeft("EXPIRED");
        setPercentDone(100);
        clearInterval(timer);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft(`${days}d ${hours}h ${mins}m ${secs}s`);
      
      const elapsed = now - created;
      setPercentDone(Math.min(100, (elapsed / durationMs) * 100));
    }, 1000);

    return () => clearInterval(timer);
  }, [loan]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 rounded-[2rem] bg-black/60 border border-accent-gold/20 shadow-[0_0_50px_rgba(255,184,0,0.05)] relative overflow-hidden group"
    >
      <div className="absolute top-0 left-0 h-1 bg-accent-gold shadow-glow-gold transition-all duration-1000" style={{ width: `${percentDone}%` }} />
      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center text-accent-gold">
            <Clock size={20} className="animate-pulse" />
          </div>
          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-accent-gold">Sovereign Debt Clock</h4>
            <p className="text-[9px] font-mono text-secondary/40">LOAN_ID: {loan.id.slice(0, 8)}...</p>
          </div>
        </div>
        <button 
          onClick={() => setShowTime(!showTime)}
          className="p-2 rounded-lg bg-white/5 border border-white/10 text-secondary/40 hover:text-white transition-all"
        >
          {showTime ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {showTime ? (
            <motion.div 
              key="timer"
              initial={{ opacity: 0, filter: "blur(10px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(10px)" }}
              className="text-5xl font-black italic tracking-tighter text-glow-gold redaction-text"
            >
              {timeLeft || "CALCULATING..."}
            </motion.div>
          ) : (
            <motion.div 
              key="hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-5xl font-black italic tracking-tighter text-white/5 redaction-text select-none"
            >
              XXd XXh XXm XXs
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-2">
             <AlertTriangle size={12} className="text-accent-gold/40" />
             <span className="text-[9px] font-bold text-secondary/40 uppercase tracking-widest">Auto-liquidation risk increases as clock approach zero</span>
           </div>
           <span className="text-[10px] font-black text-accent-gold italic">
             {isNaN(percentDone) ? "0.0" : percentDone.toFixed(1)}% ELAPSED
           </span>
        </div>
      </div>
    </motion.div>
  );
}
