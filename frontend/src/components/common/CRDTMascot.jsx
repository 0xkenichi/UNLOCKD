// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect, useMemo, useRef, useState } from 'react';

const SIGNS = ['$', '€', '¥', '£', '₹', '₿', 'Ξ', '₮'];

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export default function CRDTMascot({ size = 32, className = '' }) {
  const [active, setActive] = useState('$');
  const [ghostA, setGhostA] = useState('€');
  const [ghostB, setGhostB] = useState('₿');
  const [pulse, setPulse] = useState(false);
  const timerRef = useRef(null);
  const phaseRef = useRef(0);

  const orderedSigns = useMemo(() => {
    const start = randomInt(0, SIGNS.length - 1);
    return [...SIGNS.slice(start), ...SIGNS.slice(0, start)];
  }, []);

  useEffect(() => {
    let mounted = true;
    const schedule = () => {
      const phase = phaseRef.current % 8;
      phaseRef.current += 1;
      const nextMain = orderedSigns[phase % orderedSigns.length];
      const nextGhostA = orderedSigns[(phase + 2) % orderedSigns.length];
      const nextGhostB = orderedSigns[(phase + 5) % orderedSigns.length];
      const delay = phase % 3 === 0 ? randomInt(350, 700) : randomInt(900, 1800);
      timerRef.current = window.setTimeout(() => {
        if (!mounted) return;
        setActive(nextMain);
        setGhostA(nextGhostA);
        setGhostB(nextGhostB);
        setPulse((value) => !value);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      mounted = false;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [orderedSigns]);

  return (
    <div
      className={`crdt-mascot ${pulse ? 'pulse' : ''} ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="crdt-mascot-core">{active}</span>
      <span className="crdt-mascot-ghost a">{ghostA}</span>
      <span className="crdt-mascot-ghost b">{ghostB}</span>
    </div>
  );
}
