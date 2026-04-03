"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

interface ComingSoonProps {
  label: string;
  className?: string;
}

export function ComingSoon({ label, className = "" }: ComingSoonProps) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-gold/10 border border-accent-gold/20 text-accent-gold text-[9px] font-black uppercase tracking-widest ${className}`}>
      <Clock className="w-3 h-3 animate-pulse" />
      <span>{label} — Coming Soon</span>
    </div>
  );
}
