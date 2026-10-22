// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { afterFirstPaint, prefersReducedMotion } from './env.js';

/**
 * App-page motion: loads ./appMotion.js (GSAP) after first paint and attaches it
 * to the routed content once. Renders the hairline that sweeps under the header
 * on every route change.
 */
export default function MotionLayer({ rootId = 'main-content', sweep = true }) {
  const { pathname } = useLocation();

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    let cancelled = false;
    let detach;
    const cancelPaint = afterFirstPaint(() => {
      import('./appMotion.js')
        .then(({ attach }) => {
          const root = document.getElementById(rootId);
          if (!cancelled && root) detach = attach(root);
        })
        .catch(() => {
          /* motion is decorative; the page is complete without it */
        });
    });
    return () => {
      cancelled = true;
      cancelPaint();
      if (detach) detach();
    };
  }, [rootId]);

  return sweep ? <div key={pathname} className="vx-route-sweep" aria-hidden="true" /> : null;
}
