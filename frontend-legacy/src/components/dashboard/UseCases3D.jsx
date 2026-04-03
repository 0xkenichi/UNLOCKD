// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Rocket, Briefcase, Landmark } from 'lucide-react';

const useCases = [
  {
    icon: Rocket,
    title: 'Project Teams',
    description: 'Access liquidity without selling team allocations. Retain full upside while covering operational costs.'
  },
  {
    icon: Briefcase,
    title: 'Contributors',
    description: 'Convert locked compensation into liquid capital for personal needs or reinvestment opportunities.'
  },
  {
    icon: Landmark,
    title: 'Investors',
    description: 'Leverage vested positions without triggering tax events or breaking lock-up terms.'
  }
];

/**
 * 3D use-cases: all products at a glance (shown after Launch App).
 * Mouse movement drives parallax; hover duration drives zoom (deeper look).
 */
export default function UseCases3D() {
  const sectionRef = useRef(null);
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hoverStart, setHoverStart] = useState(null);
  const [hoverElapsed, setHoverElapsed] = useState(0);
  const [cursorSpeed, setCursorSpeed] = useState(0);
  const prevMouse = useRef({ x: 0.5, y: 0.5, t: Date.now() });

  useEffect(() => {
    if (hoveredIndex === null || !hoverStart) return;
    const id = setInterval(() => {
      setHoverElapsed((Date.now() - hoverStart) / 1000);
    }, 80);
    return () => clearInterval(id);
  }, [hoveredIndex, hoverStart]);

  const onMouseMove = useCallback((e) => {
    if (!sectionRef.current) return;
    const rect = sectionRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const now = Date.now();
    const dt = (now - prevMouse.current.t) / 1000 || 0.001;
    const dx = x - prevMouse.current.x;
    const dy = y - prevMouse.current.y;
    const speed = Math.min(1, Math.sqrt(dx * dx + dy * dy) / dt / 20);
    prevMouse.current = { x, y, t: now };
    setCursorSpeed(speed);
    setMouse({ x, y });
  }, []);

  const onMouseLeave = useCallback(() => {
    setMouse({ x: 0.5, y: 0.5 });
    setHoveredIndex(null);
    setHoverStart(null);
    setHoverElapsed(0);
    setCursorSpeed(0);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('mouseleave', onMouseLeave);
    return () => {
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [onMouseMove, onMouseLeave]);

  const zoomIntensity = Math.min(1, hoverElapsed / 1.2);

  return (
    <motion.section
      ref={sectionRef}
      className="use-cases-3d-section"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ perspective: '1200px', overflow: 'hidden', padding: 'var(--space-16) var(--space-6)' }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center', marginBottom: 'var(--space-12)' }}>
        <h2 className="landing-section-title" style={{ marginBottom: 'var(--space-2)' }}>Built For Everyone</h2>
        <p className="landing-section-subtitle" style={{ marginBottom: 0 }}>
          Whether you're a team, contributor, or investor — unlock your potential.
        </p>
      </div>

      <div
        className="use-cases-3d-container"
        style={{
          perspective: '1200px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 'var(--space-8)',
          padding: 'var(--space-8)',
          minHeight: '320px',
          flexWrap: 'wrap'
        }}
      >
        {useCases.map((useCase, index) => {
          const Icon = useCase.icon;
          const isHovered = hoveredIndex === index;
          const tiltX = (mouse.y - 0.5) * 8 * (1 - cursorSpeed * 0.5);
          const tiltY = (mouse.x - 0.5) * -12 * (1 - cursorSpeed * 0.5);
          const scale = isHovered ? 1 + 0.12 * zoomIntensity : 1;
          const translateZ = isHovered ? 40 * zoomIntensity : 0;

          return (
            <motion.div
              key={useCase.title}
              className="holo-card use-case-3d-card"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              onMouseEnter={() => {
                setHoveredIndex(index);
                setHoverStart(Date.now());
                setHoverElapsed(0);
              }}
              onMouseLeave={() => {
                setHoveredIndex(null);
                setHoverStart(null);
              }}
              style={{
                cursor: 'default',
                flex: '1 1 260px',
                maxWidth: '360px',
                minWidth: '240px',
                transform: `
                  perspective(1200px)
                  rotateX(${tiltX}deg)
                  rotateY(${tiltY}deg)
                  scale(${scale})
                  translateZ(${translateZ}px)
                `,
                transformStyle: 'preserve-3d',
                transition: cursorSpeed > 0.3 ? 'none' : 'transform 0.25s var(--ease-smooth)',
                boxShadow: isHovered
                  ? '0 24px 48px rgba(0,0,0,0.4), 0 0 0 1px var(--border-strong)'
                  : 'var(--shadow-md)',
                zIndex: isHovered ? 10 : 1
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-soft)', border: '1px solid var(--border-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Icon size={24} strokeWidth={1.5} color="var(--primary-500)" />
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {useCase.title}
                </h3>
              </div>
              <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'var(--text-muted)', margin: 0 }}>
                {useCase.description}
              </p>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
