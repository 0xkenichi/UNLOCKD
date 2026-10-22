// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { gsap } from 'gsap';

/*
 * Motion for the app pages, loaded lazily by MotionLayer after first paint.
 *
 * It works on the rendered DOM so page components (and their data logic) need
 * no changes:
 *   - page titles "unlock": the width axis opens from compressed to resting;
 *   - cards, ledgers and table rows reveal as they enter the viewport;
 *   - stat values count to their figure, and tween between figures when the
 *     page's data changes.
 * Only transform, opacity and font-variation-settings are animated.
 *
 * React owns these nodes, so inline styles are restored after each tween and
 * figures are written to the same Text node React updates. A React write to a
 * figure always wins: it becomes the new tween target.
 */

const SKIP_WITHIN = '.lx, [data-motion="off"]';
const TITLE = '.page-title';
const CARD = [
  '.holo-card',
  '.glass-card',
  '.stat-card',
  '.stat-card-minimal',
  '.doc-card',
  '.data-table',
  '.vx-certificate',
  '.px-fact',
  '.px-record > li',
  '.feature-diagram'
].join(',');
const ROW = '.data-table > .table-row:not(.header)';
const FIGURE = '.stat-value';

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const MAX_ROWS_STAGGERED = 14;

function parseFigure(text) {
  if (!text || text.length > 32) return null;
  const matches = [...text.matchAll(NUMBER)];
  if (matches.length !== 1) return null;
  const [token] = matches[0];
  const value = Number(token.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return {
    prefix: text.slice(0, matches[0].index),
    suffix: text.slice(matches[0].index + token.length),
    value,
    decimals: (token.split('.')[1] || '').length,
    grouped: token.includes(',')
  };
}

function formatFigure(fig, value) {
  return (
    fig.prefix +
    value.toLocaleString('en-US', {
      minimumFractionDigits: fig.decimals,
      maximumFractionDigits: fig.decimals,
      useGrouping: fig.grouped
    }) +
    fig.suffix
  );
}

function numericTextNode(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let found = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!/\d/.test(n.nodeValue)) continue;
    if (found) return null; // more than one numeric run: leave it alone
    found = n;
  }
  return found && parseFigure(found.nodeValue) ? found : null;
}

function inViewport(rect) {
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
}

export function attach(root) {
  const handled = new WeakSet();
  const figures = new Map(); // Text node -> state
  const saved = new Map(); // element -> inline styles to restore (also: everything still hidden)
  let queue = [];
  let flushFrame = 0;

  const save = (el) => {
    if (!saved.has(el)) saved.set(el, { opacity: el.style.opacity, transform: el.style.transform });
  };
  const restore = (el) => {
    const prev = saved.get(el);
    gsap.set(el, { clearProps: 'opacity,transform' });
    if (prev) {
      el.style.opacity = prev.opacity;
      el.style.transform = prev.transform;
      saved.delete(el);
    }
  };

  /* ── Reveal ────────────────────────────────────────────────────────────── */
  const flush = () => {
    flushFrame = 0;
    const batch = queue;
    queue = [];
    const cards = batch.filter((el) => !el.matches(ROW));
    const rows = batch.filter((el) => el.matches(ROW));
    if (cards.length) {
      gsap.to(cards, {
        opacity: 1,
        y: 0,
        duration: 0.9,
        ease: 'expo.out',
        stagger: 0.07,
        overwrite: true,
        onComplete: () => cards.forEach(restore)
      });
    }
    if (rows.length) {
      gsap.to(rows, {
        opacity: 1,
        x: 0,
        duration: 0.6,
        ease: 'power3.out',
        delay: cards.length ? 0.18 : 0,
        stagger: { each: 0.035, amount: Math.min(0.5, rows.length * 0.035) },
        overwrite: true,
        onComplete: () => rows.forEach(restore)
      });
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        queue.push(entry.target);
      });
      if (queue.length && !flushFrame) flushFrame = window.requestAnimationFrame(flush);
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.01 }
  );

  const hideForReveal = (el, isRow, rowIndex) => {
    // Opacity already owned by an inline style (a framer-motion entrance, say): leave it to that
    // owner. Saving and later restoring its interim value could leave the element invisible.
    if (el.style.opacity !== '') return;
    save(el);
    if (isRow && rowIndex >= MAX_ROWS_STAGGERED) return; // long ledgers: only the head of the list moves
    gsap.set(el, isRow ? { opacity: 0, x: -8 } : { opacity: 0, y: 18 });
    io.observe(el);
  };

  /* ── Figures ───────────────────────────────────────────────────────────── */
  const writeFigure = (state, text) => {
    state.lastWritten = text;
    state.node.nodeValue = text;
    // Drop the record our own write produced; hand any others to the observer callback.
    const pending = mo.takeRecords().filter((r) => !(r.type === 'characterData' && r.target === state.node));
    if (pending.length) onMutations(pending);
  };

  const tweenFigure = (state, from, finalText) => {
    const fig = parseFigure(finalText);
    if (state.tween) state.tween.kill();
    if (!fig || !state.node.isConnected) {
      state.current = fig ? fig.value : null;
      return;
    }
    const counter = { v: from };
    const duration = Math.min(1.6, 0.7 + Math.log10(Math.abs(fig.value - from) + 1) * 0.12);
    state.tween = gsap.to(counter, {
      v: fig.value,
      duration,
      ease: 'expo.out',
      onUpdate: () => {
        state.current = counter.v;
        writeFigure(state, formatFigure(fig, counter.v));
      },
      onComplete: () => {
        state.current = fig.value;
        state.tween = null;
        writeFigure(state, finalText);
      }
    });
  };

  const figureIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        figureIO.unobserve(entry.target);
        const state = [...figures.values()].find((s) => s.el === entry.target);
        if (state && !state.revealed) {
          state.revealed = true;
          tweenFigure(state, 0, state.finalText);
        }
      });
    },
    { threshold: 0.2 }
  );

  const trackFigure = (el, animateIn) => {
    const node = numericTextNode(el);
    if (!node || figures.has(node)) return;
    const fig = parseFigure(node.nodeValue);
    const state = { el, node, finalText: node.nodeValue, current: fig.value, lastWritten: null, tween: null, revealed: !animateIn };
    figures.set(node, state);
    if (animateIn) {
      state.current = 0;
      writeFigure(state, formatFigure(fig, 0));
      figureIO.observe(el);
    }
  };

  const onFigureText = (node) => {
    const state = figures.get(node);
    if (!state || node.nodeValue === state.lastWritten) return;
    const text = node.nodeValue;
    state.finalText = text;
    if (!state.revealed) {
      // Not on screen yet: keep showing zero, count to the new value on reveal.
      const fig = parseFigure(text);
      if (fig) writeFigure(state, formatFigure(fig, 0));
      return;
    }
    const from = state.current ?? 0;
    if (parseFigure(text) && from !== null) tweenFigure(state, from, text);
    else state.current = parseFigure(text)?.value ?? null;
  };

  /* ── Titles ────────────────────────────────────────────────────────────── */
  const unlockTitle = (el) => {
    const targets = [el, ...el.querySelectorAll('em')];
    targets.forEach((t, i) => {
      const cs = getComputedStyle(t);
      const w = parseFloat(cs.getPropertyValue('--w'));
      const g = parseFloat(cs.getPropertyValue('--g'));
      if (!Number.isFinite(w) || !Number.isFinite(g)) return;
      gsap.fromTo(
        t,
        { '--w': 50, '--g': 860, opacity: i === 0 ? 0.001 : 1 },
        {
          '--w': w,
          '--g': g,
          opacity: 1,
          duration: 1.5,
          delay: i * 0.12,
          ease: 'expo.out',
          onComplete: () => {
            t.style.removeProperty('--w');
            t.style.removeProperty('--g');
            gsap.set(t, { clearProps: 'opacity' });
          }
        }
      );
    });
  };

  /* ── Scan ──────────────────────────────────────────────────────────────── */
  const scan = (scope, initial) => {
    const pick = (selector) => {
      const list = scope.matches?.(selector) ? [scope] : [];
      scope.querySelectorAll?.(selector).forEach((el) => list.push(el));
      return list.filter((el) => !handled.has(el) && !el.closest(SKIP_WITHIN));
    };

    const titles = pick(TITLE);
    const cards = pick(CARD).filter((el) => !el.parentElement?.closest(CARD));
    const rows = pick(ROW);
    const figs = pick(FIGURE);
    [...titles, ...cards, ...rows, ...figs].forEach((el) => handled.add(el));

    // On attach the page has already painted: leave what is on screen alone.
    const visible = initial ? new Set([...cards, ...rows, ...figs].filter((el) => inViewport(el.getBoundingClientRect()))) : new Set();

    if (!initial) titles.forEach(unlockTitle);
    cards.forEach((el) => !visible.has(el) && hideForReveal(el, false));
    rows.forEach((el) => {
      if (visible.has(el)) return;
      const index = Array.prototype.indexOf.call(el.parentElement.children, el);
      hideForReveal(el, true, index);
    });
    figs.forEach((el) => trackFigure(el, !visible.has(el)));
  };

  const onMutations = (records) => {
    const added = [];
    records.forEach((r) => {
      if (r.type === 'characterData') {
        onFigureText(r.target);
        return;
      }
      r.addedNodes.forEach((n) => {
        if (n.nodeType === 1) added.push(n);
        else if (n.nodeType === 3 && r.target.nodeType === 1) {
          // React replaced a figure's text node: re-track the figure.
          const figEl = r.target.closest(FIGURE);
          if (figEl) {
            for (const [node, state] of figures) if (state.el === figEl) figures.delete(node);
            handled.delete(figEl);
            added.push(figEl);
          }
        }
      });
      r.removedNodes.forEach((n) => {
        if (n.nodeType === 3 && figures.has(n)) {
          figures.get(n).tween?.kill();
          figures.delete(n);
        }
      });
    });
    added.forEach((n) => n.isConnected && scan(n, false));
  };

  const mo = new MutationObserver(onMutations);
  mo.observe(root, { childList: true, subtree: true, characterData: true });
  scan(root, true);

  return () => {
    mo.disconnect();
    io.disconnect();
    figureIO.disconnect();
    if (flushFrame) window.cancelAnimationFrame(flushFrame);
    [...saved.keys()].forEach((el) => {
      gsap.killTweensOf(el);
      restore(el);
    });
    figures.forEach((state) => {
      state.tween?.kill();
      if (state.node.isConnected && state.lastWritten !== null) state.node.nodeValue = state.finalText;
    });
    figures.clear();
  };
}
