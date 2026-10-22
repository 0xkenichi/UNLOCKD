// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Tiny helpers that live in the entry bundle. Everything that imports GSAP is
 * loaded through dynamic import() after first paint, never from here.
 */

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Run `cb` once the current frame has painted. Returns a cancel function. */
export function afterFirstPaint(cb) {
  let timeout;
  const frame = window.requestAnimationFrame(() => {
    timeout = window.setTimeout(cb, 0);
  });
  return () => {
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timeout);
  };
}

/** Resolve when the display face is usable, or after `maxWait` ms, whichever is first. */
export function fontsReady(maxWait = 1200) {
  const fonts = typeof document !== 'undefined' ? document.fonts : null;
  if (!fonts || !fonts.load) return Promise.resolve();
  return Promise.race([
    Promise.all([fonts.load('800 48px "Anybody"'), fonts.load('300 24px "Martian Mono"')]).catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, maxWait))
  ]);
}
