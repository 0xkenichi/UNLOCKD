// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useId } from 'react';

/** Hallmark seal: circular legend around a compressed "V", like a maker's mark. */
export default function Seal({ size = 112, legend = 'VESTRA PROTOCOL · VESTING CREDIT · MMXXVI ·', className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className={`vx-seal ${className}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Vestra Protocol seal"
    >
      <defs>
        <path id={`seal-${id}`} d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="0.4" />
      <circle cx="60" cy="60" r="34" fill="none" stroke="currentColor" strokeWidth="0.6" />
      <circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="0.6 1.6" />
      <text
        fill="currentColor"
        style={{ fontFamily: 'var(--font-body)', fontSize: '7.4px', letterSpacing: '0.28em', fontWeight: 600 }}
      >
        <textPath href={`#seal-${id}`} startOffset="0">
          {legend}
        </textPath>
      </text>
      <text
        x="60"
        y="72"
        textAnchor="middle"
        fill="currentColor"
        style={{ fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: 820, fontStretch: '56%' }}
      >
        V
      </text>
    </svg>
  );
}
