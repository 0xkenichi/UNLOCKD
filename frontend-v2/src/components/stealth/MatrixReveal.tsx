"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { useStealthMode } from '../providers/stealth-provider';

interface MatrixRevealProps {
  children: React.ReactNode;
  text?: string;
}

const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&*()_+-=[]{}|;:,.<>?";

const MatrixText = ({ text }: { text: string }) => {
  const [displayText, setDisplayText] = useState(text);
  const [isRevealing, setIsRevealing] = useState(false);
  const iteration = useRef(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const startAnimation = () => {
      iteration.current = 0;
      interval = setInterval(() => {
        setDisplayText(prev => 
          prev.split("")
            .map((char, index) => {
              if (index < iteration.current) {
                return text[index];
              }
              return characters[Math.floor(Math.random() * characters.length)];
            })
            .join("")
        );

        if (iteration.current >= text.length) {
          clearInterval(interval);
        }

        iteration.current += 1 / 3;
      }, 30);
    };

    startAnimation();
    return () => clearInterval(interval);
  }, [text]);

  return <span className="redaction-text">{displayText}</span>;
};

export const MatrixReveal: React.FC<MatrixRevealProps> = ({ children, text }) => {
  const { isStealthMode } = useStealthMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  // Center window logic: 
  // 0.5 is when the element is in the middle of the viewport.
  // We want to reveal between 0.4 and 0.6.
  const revealOpacity = useTransform(scrollYProgress, [0.35, 0.45, 0.55, 0.65], [0, 1, 1, 0]);
  const revealScale = useTransform(scrollYProgress, [0.35, 0.5, 0.65], [0.98, 1, 0.98]);
  const scanlineTop = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);
  
  const smoothOpacity = useSpring(revealOpacity, { stiffness: 100, damping: 30 });
  const scanlineOpacity = useTransform(scrollYProgress, [0.4, 0.5, 0.6], [0, 1, 0]);

  return (
    <div ref={containerRef} className="relative group overflow-hidden">
      {/* Background layer: Higher degradation when in stealth */}
      <div className={`transition-all duration-700 ${
        isStealthMode 
          ? 'redaction-70 opacity-40 blur-[0.5px] scale-[0.99] grayscale select-none' 
          : ''
      }`}>
        {children}
      </div>

      {isStealthMode && (
        <>
          {/* High-Contrast Reveal Layer (Center Only) */}
          <motion.div 
            className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center"
            style={{
              opacity: smoothOpacity,
              scale: revealScale,
            }}
          >
            <div className="bg-white text-black redaction-text px-6 py-3 rounded-none shadow-[0_0_50px_rgba(255,255,255,0.2)] border-x-4 border-black">
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase font-bold tracking-[0.3em] mb-2 opacity-50">Authorized View</span>
                {text ? <MatrixText text={text} /> : children}
              </div>
            </div>
          </motion.div>

          {/* Scannline / Flash Effect */}
          <motion.div 
            className="absolute left-0 w-full h-[2px] bg-white shadow-[0_0_20px_rgba(255,255,255,1)] z-20 pointer-events-none"
            style={{
              top: scanlineTop,
              opacity: scanlineOpacity
            }}
          />
        </>
      )}
    </div>
  );
};
