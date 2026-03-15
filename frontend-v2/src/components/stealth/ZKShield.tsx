"use client";

import React from "react";
import { useStealthMode } from "@/components/providers/stealth-provider";
import { motion, AnimatePresence } from "framer-motion";

interface ZKShieldProps {
  children: React.ReactNode;
  variant?: "blur" | "mask" | "glitch";
  className?: string;
}

export const ZKShield: React.FC<ZKShieldProps> = ({ 
  children, 
  variant = "blur", 
  className = "" 
}) => {
  const { isStealthMode } = useStealthMode();
  const [isHovered, setIsHovered] = React.useState(false);

  const glitchChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#%@&*";
  
  const GlitchText = () => (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="font-mono text-accent-teal/60 tracking-widest"
    >
      {Array(8).fill(0).map(() => glitchChars[Math.floor(Math.random() * glitchChars.length)]).join("")}
    </motion.span>
  );

  return (
    <div 
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <motion.div
        animate={{ 
          filter: isStealthMode && !isHovered ? (variant === "blur" ? "blur(8px)" : "blur(0px)") : "blur(0px)",
          opacity: isStealthMode && !isHovered && variant === "mask" ? 0 : 1
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
      >
        {children}
      </motion.div>

      <AnimatePresence>
        {isStealthMode && !isHovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            {variant === "mask" && (
              <div className="w-full h-2/3 bg-white/10 rounded-sm skew-x-12 animate-pulse" />
            )}
            {variant === "glitch" && <GlitchText />}
          </motion.div>
        )}
        
        {isStealthMode && isHovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute -top-12 left-1/2 -translate-x-1/2 z-50 px-3 py-1 bg-accent-teal text-background text-[10px] font-black uppercase rounded shadow-[0_0_15px_rgba(46,190,181,0.5)] whitespace-nowrap pointer-events-none"
          >
            ZK Reveal Active
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
