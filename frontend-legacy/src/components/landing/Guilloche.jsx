// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';

/**
 * Guilloche rosette — the interlaced linework printed on banknotes and bond
 * certificates. Drawn as a set of rotated hypotrochoids so it is crisp at any
 * size and costs nothing to load.
 */
function hypotrochoid(R, r, d, steps, rotation) {
  const k = (R - r) / r;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  let path = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * r;
    const x0 = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y0 = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    const x = x0 * cos - y0 * sin;
    const y = x0 * sin + y0 * cos;
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}

export default function Guilloche({ size = 520, rings = 3, className = '', strokeWidth = 0.45 }) {
  const paths = useMemo(() => {
    const out = [];
    const layers = [
      { R: 100, r: 7, d: 38, copies: 3 },
      { R: 84, r: 6, d: 30, copies: 2 },
      { R: 66, r: 5, d: 24, copies: 2 }
    ].slice(0, rings);
    layers.forEach((layer, li) => {
      for (let c = 0; c < layer.copies; c++) {
        out.push({
          key: `${li}-${c}`,
          d: hypotrochoid(layer.R, layer.r, layer.d, 1400, (c / layer.copies) * ((Math.PI * 2) / (layer.R / layer.r))),
          opacity: 1 - li * 0.22
        });
      }
    });
    return out;
  }, [rings]);

  return (
    <svg
      className={`vx-guilloche ${className}`}
      width={size}
      height={size}
      viewBox="-140 -140 280 280"
      aria-hidden="true"
      focusable="false"
    >
      <circle r="136" fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.6" />
      <circle r="132" fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.35" />
      {paths.map((p) => (
        <path key={p.key} d={p.d} fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={p.opacity} />
      ))}
      <circle r="20" fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.6" />
    </svg>
  );
}
