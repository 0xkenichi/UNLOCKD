'use client';

import { useRef, useState, useEffect, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ZoomHoverCardProps {
  children: ReactNode;
  className?: string;
  depth?: number;
  tiltIntensity?: number;
  zoomScale?: number;
  isStealth?: boolean;
}

export function ZoomHoverCard({
  children,
  className = '',
  depth = 40,
  tiltIntensity = 8,
  zoomScale = 1.12,
  isStealth = false,
}: ZoomHoverCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [isHovered, setIsHovered] = useState(false);
  const [hoverStart, setHoverStart] = useState<number | null>(null);
  const [hoverElapsed, setHoverElapsed] = useState(0);

  // Track hover duration for progressive zoom (from legacy UseCases3D)
  useEffect(() => {
    if (!isHovered || !hoverStart) {
      setHoverElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setHoverElapsed((Date.now() - hoverStart) / 1000);
    }, 50);
    return () => clearInterval(interval);
  }, [isHovered, hoverStart]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setMouse({ x, y });
  }, []);

  const zoomIntensity = Math.min(1, hoverElapsed / 1.2);
  const tiltX = (mouse.y - 0.5) * tiltIntensity;
  const tiltY = (mouse.x - 0.5) * -tiltIntensity * 1.5;
  const scale = isHovered ? 1 + (zoomScale - 1) * zoomIntensity : 1;
  const translateZ = isHovered ? depth * zoomIntensity : 0;

  return (
    <motion.div
      ref={containerRef}
      onMouseMove={onMouseMove}
      onMouseEnter={() => {
        setIsHovered(true);
        setHoverStart(Date.now());
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoverStart(null);
        setMouse({ x: 0.5, y: 0.5 });
      }}
      className={`relative perspective-1000 transform-style-3d transition-shadow duration-300 ${className}`}
      style={{
        transform: `
          perspective(1000px)
          rotateX(${tiltX}deg)
          rotateY(${tiltY}deg)
          scale(${scale})
          translateZ(${translateZ}px)
        `,
        zIndex: isHovered ? 50 : 1,
      }}
    >
      {/* Glitch Overlay for Stealth Mode */}
      {isStealth && isHovered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.15 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 pointer-events-none bg-purple-500/10 mix-blend-screen glitch-overlay"
        />
      )}
      
      {children}

      <style jsx global>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        
        @keyframes glitch-anim {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 1px); }
          40% { transform: translate(2px, -1px); }
          60% { transform: translate(-1px, 2px); }
          80% { transform: translate(1px, -2px); }
          100% { transform: translate(0); }
        }
        
        .glitch-overlay {
          animation: glitch-anim 0.2s infinite linear;
          box-shadow: inset 0 0 50px rgba(168, 85, 247, 0.5);
        }
      `}</style>
    </motion.div>
  );
}
