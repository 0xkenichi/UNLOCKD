"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Send, X, ShieldAlert } from 'lucide-react';

export function ReportMissingContractModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [address, setAddress] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate API call and automation trigger
    console.log(`Reporting missing contract: ${address}`);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative w-full max-w-md p-8 rounded-[40px] bg-surface border border-white/10 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6">
              <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-4 mb-8">
              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20">
                <ShieldAlert className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h2 className="text-2xl font-black uppercase tracking-tighter text-glow-red italic">Missing Contract</h2>
                <p className="text-[10px] font-black uppercase tracking-widest text-secondary opacity-60">Sovereign Discovery Request</p>
              </div>
            </div>

            {!submitted ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-secondary ml-1">Contract Address</label>
                  <input
                    type="text"
                    required
                    placeholder="0x... or Solana Address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full h-14 px-6 rounded-2xl bg-white/5 border border-white/10 focus:border-accent-teal outline-none font-mono text-sm transition-all"
                  />
                </div>
                
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex gap-3">
                  <AlertCircle className="w-4 h-4 text-accent-cyan shrink-0 mt-0.5" />
                  <p className="text-[11px] text-secondary opacity-70 leading-relaxed font-medium">
                    Our relayer will prioritize indexing this contract. Reporting will also notify the protocol guardians via DM/Email automation.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full h-14 rounded-2xl bg-white text-black font-black uppercase tracking-widest hover:bg-accent-teal hover:text-white transition-all flex items-center justify-center gap-2 group"
                >
                  <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  Submit Report
                </button>
              </form>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-accent-teal flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-white font-black text-2xl"
                  >
                    ✓
                  </motion.div>
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter italic">Report Logged</h3>
                <p className="text-sm text-secondary font-medium">Indexing initiated for your contract.</p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
