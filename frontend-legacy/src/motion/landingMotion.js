// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, MorphSVGPlugin);

/*
 * Landing-page motion, loaded by pages/Landing.jsx after first paint and only
 * when the visitor has not asked for reduced motion.
 *
 * Type concept: Anybody's width axis stands for value over time. Letters are
 * compressed and heavy while value is locked, and stretch wide and light as it
 * is released. The page paints in the locked state (CSS, html.vx-motion) and
 * this module opens it.
 *
 * Every tween here touches transform, opacity, SVG stroke offsets or the
 * --w / --g custom properties that feed font-variation-settings.
 */

const LOCKED = { w: 50, g: 860 };

const num = (el, prop) => parseFloat(getComputedStyle(el).getPropertyValue(prop));

export function initLanding(root) {
  const cleanups = [];
  const ctx = gsap.context((self) => {
    hero(root, cleanups, self);
    life(root, cleanups);
  }, root);
  ScrollTrigger.refresh();

  return () => {
    // Kill every tween and ScrollTrigger first, so nothing renders against the
    // DOM that the split reverts below put back.
    ctx.revert();
    cleanups.forEach((fn) => fn());
  };
}

/* ── Hero ──────────────────────────────────────────────────────────────────── */

function hero(root, cleanups, ctx) {
  const section = root.querySelector('.lx-hero');
  const title = root.querySelector('.lx-hero__title');
  if (!section || !title) return;
  const lines = [...title.querySelectorAll('.lx-line')];
  const guilloche = section.querySelector('.lx-hero__guilloche');
  const instrument = section.querySelector('.lx-instrument');

  // Accessible name for the heading before its text is split into glyph spans.
  title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
  const split = SplitText.create(lines, { type: 'chars', charsClass: 'lx-char', aria: 'hidden' });
  cleanups.push(() => {
    split.revert();
    title.removeAttribute('aria-label');
  });

  // Hold every glyph locked, then release the lines to their resting axes.
  gsap.set(split.chars, { '--w': LOCKED.w, '--g': LOCKED.g });
  title.classList.add('is-open');
  cleanups.push(() => title.classList.remove('is-open'));

  const rest = (char) => {
    const line = char.closest('.lx-line');
    return line ? { w: num(line, '--w'), g: num(line, '--g') } : { w: 100, g: 400 };
  };

  // Created when the intro ends; ctx.add() keeps it inside the context so it is reverted on unmount.
  const intro = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => ctx.add(scrollStretch) });
  intro.to(split.chars, {
    '--w': (i, el) => rest(el).w,
    '--g': (i, el) => rest(el).g,
    duration: 1.9,
    stagger: { each: 0.034, from: 'start' },
    onComplete: () => gsap.set(split.chars, { clearProps: '--w,--g' })
  });
  intro.from(split.chars, { yPercent: 18, duration: 1.4, stagger: 0.034, ease: 'power4.out' }, 0);

  if (guilloche) {
    const paths = guilloche.querySelectorAll('path, circle');
    gsap.set(guilloche, { y: 0, yPercent: -50 });
    intro.fromTo(paths, { drawSVG: '0%' }, { drawSVG: '100%', duration: 3.2, stagger: 0.09, ease: 'power2.inOut' }, 0.1);
  }

  // As the hero scrolls away, the headline keeps opening: wider and lighter,
  // as far as each line can stretch without leaving its column.
  function scrollStretch() {
    const fit = (line, targetG) => {
      const restW = num(line, '--w');
      const prev = [line.style.getPropertyValue('--w'), line.style.getPropertyValue('--g')];
      const avail = title.clientWidth * 0.98;
      line.style.setProperty('--g', targetG);
      line.style.setProperty('--w', restW);
      const w0 = line.offsetWidth;
      line.style.setProperty('--w', 150);
      const w1 = line.offsetWidth;
      line.style.setProperty('--w', prev[0]);
      line.style.setProperty('--g', prev[1]);
      if (w1 <= avail) return 150;
      if (w0 >= avail || w1 === w0) return restW;
      return restW + ((150 - restW) * (avail - w0)) / (w1 - w0);
    };

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom top',
        scrub: 0.8,
        invalidateOnRefresh: true
      },
      defaults: { ease: 'none' }
    });
    lines.forEach((line) => {
      const open = line.classList.contains('lx-line--open');
      const g = open ? 160 : 420;
      tl.to(line, { '--w': () => fit(line, g), '--g': g }, 0);
    });
    tl.to(title, { yPercent: -12 }, 0);
    if (instrument) tl.to(instrument, { y: -60 }, 0);
    if (guilloche) tl.to(guilloche, { rotation: 48, ease: 'none' }, 0);
  }
}

/* ── Life of a loan ────────────────────────────────────────────────────────── */

function life(root, cleanups) {
  const el = root.querySelector('.lx-life');
  if (!el) return;
  const stage = el.querySelector('.lx-life__stage');
  const acts = el.querySelector('.lx-life__acts');
  const q = (part) => [...el.querySelectorAll(`[data-part="${part}"]`)];
  const one = (part) => el.querySelector(`[data-part="${part}"]`);

  const streams = q('streams').flatMap((g) => [...g.querySelectorAll('path')]);
  const rings = q('ring');
  const rosette = one('rosette');
  const fill = one('fill');
  const shackle = one('shackle');
  const credit = one('credit');
  const ret = one('return');
  const limit = one('limit');
  const poolFrame = el.querySelector('[data-part="pool"] > rect');
  const poolLevel = one('pool-level');
  const formula = one('formula');
  const terms = q('term');
  const pv = one('pv');
  const creditLabel = one('label-credit');
  const pvStrips = [...pv.querySelectorAll('.vx-odo__strip')];
  const creditStrips = [...creditLabel.querySelectorAll('.vx-odo__strip')];
  const labels = {
    borrower: one('label-borrower'),
    vault: one('label-vault'),
    stream: one('label-stream'),
    pool: one('label-pool'),
    ret: one('label-return')
  };

  const flow = { stream: 0, credit: 0, repay: 0, ret: 0 };
  // Where an article counts as "current". On narrow screens the stage sits on top of
  // the viewport, so the reading line moves down into the space left below it.
  const line = window.matchMedia('(max-width: 900px)').matches ? '80%' : '62%';

  // Starting state: nothing drawn, nothing valued, nothing lent.
  gsap.set([...streams, ...rings, credit, ret, limit, poolFrame], { drawSVG: '0%' });
  gsap.set(rosette, { opacity: 0, scale: 0.7, svgOrigin: '0 0' });
  gsap.set(fill, { scaleY: 0, transformOrigin: '50% 100%' });
  gsap.set([poolLevel, pv, creditLabel, ...Object.values(labels)], { opacity: 0 });
  gsap.set([...pvStrips, ...creditStrips], { y: 0, yPercent: 0 });

  const offsetWithin = (node, ancestor) => {
    let x = 0;
    let y = 0;
    for (let n = node; n && n !== ancestor; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
  };
  const vaultCentre = () => ({ x: stage.clientWidth * (330 / 640), y: stage.clientHeight * (300 / 560) });

  // Where each formula term starts: the centre of the vault. Measured once (layout
  // offsets, unaffected by transforms); the scrubbed timeline is not invalidated on
  // refresh, because invalidation would drop the terms' hidden starting state.
  const centre = vaultCentre();
  const termFrom = terms.map((t) => {
    const at = offsetWithin(t, stage);
    return { x: centre.x - at.x, y: centre.y - at.y };
  });

  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger: acts,
      start: `top ${line}`,
      end: `bottom ${line}`,
      scrub: 0.9
    }
  });

  // I · Escrow: the stream is drawn in and fills the vault.
  tl.to(labels.borrower, { opacity: 1, duration: 0.2 }, 0)
    .to(streams, { drawSVG: '100%', duration: 0.5, stagger: 0.05 }, 0.04)
    .to(rings, { drawSVG: '100%', duration: 0.5, stagger: 0.08 }, 0.1)
    .to(rosette, { opacity: 1, scale: 1, duration: 0.5, ease: 'expo.out' }, 0.3)
    .to(flow, { stream: 1, duration: 0.3 }, 0.25)
    .to([labels.stream, labels.vault], { opacity: 1, duration: 0.2, stagger: 0.1 }, 0.35)
    .to(fill, { scaleY: 0.62, duration: 0.6, ease: 'power1.inOut' }, 0.4)

    // II · Valuation: terms leave the vault and assemble into the formula.
    .to(labels.stream, { opacity: 0, duration: 0.2 }, 1.0)
    .to(rosette, { rotation: 90, duration: 2, ease: 'none' }, 1.0)
    .fromTo(
      terms,
      {
        opacity: 0,
        scale: 0.4,
        x: (i) => termFrom[i].x,
        y: (i) => termFrom[i].y
      },
      { opacity: 1, scale: 1, x: 0, y: 0, duration: 0.5, stagger: 0.07, ease: 'expo.out', immediateRender: true },
      1.05
    )
    .to(flow, { stream: 0.45, duration: 0.3 }, 1.1)
    .to(pv, { opacity: 1, duration: 0.2 }, 1.45)
    .to(limit, { drawSVG: '100%', duration: 0.35 }, 1.65)

    // III · Credit: the pool appears and USDC is drawn to the borrower.
    .to(formula, { opacity: 0.4, duration: 0.25 }, 2.0)
    .to(poolFrame, { drawSVG: '100%', duration: 0.3 }, 2.0)
    .to([poolLevel, labels.pool], { opacity: 1, duration: 0.2 }, 2.1)
    .to(credit, { drawSVG: '100%', duration: 0.45 }, 2.15)
    .to(flow, { credit: 1, duration: 0.3 }, 2.25)
    .to(creditLabel, { opacity: 1, duration: 0.2 }, 2.3)
    .to(poolLevel, { y: 10, duration: 0.5 }, 2.3)

    // IV · Settlement: repayment refills the pool, the lock opens and the stream goes home.
    .to(flow, { credit: 0, repay: 1, duration: 0.3 }, 3.0)
    .to(poolLevel, { y: 0, duration: 0.4 }, 3.0)
    .to(creditLabel, { opacity: 0.35, duration: 0.2 }, 3.0)
    .to(shackle, { morphSVG: shackle.dataset.open, duration: 0.25, ease: 'back.out(2)' }, 3.3)
    .to(ret, { drawSVG: '100%', duration: 0.4 }, 3.4)
    .to(flow, { ret: 1, stream: 0, duration: 0.3 }, 3.4)
    .to(streams, { opacity: 0.25, duration: 0.3 }, 3.4)
    .to(fill, { scaleY: 0, duration: 0.5, ease: 'power1.inOut' }, 3.45)
    .to(labels.ret, { opacity: 1, duration: 0.2 }, 3.5)
    .to(flow, { repay: 0.15, duration: 0.3 }, 3.7)
    .to({}, { duration: 0.0001 }, 4);

  // Figures roll on time, not on scroll, so they never rest half-turned. Each rolls
  // in when its article becomes active and back to zero when scrolled back past it.
  const rolled = new Map();
  const roll = (strips, on) => {
    if (rolled.get(strips) === on) return;
    rolled.set(strips, on);
    gsap.to(strips, {
      yPercent: (i, st) => (on ? parseFloat(st.dataset.y) : 0),
      duration: on ? 2 : 0.5,
      ease: on ? 'expo.out' : 'power2.in',
      stagger: on ? { each: 0.06, from: 'end' } : 0,
      overwrite: true
    });
  };

  // Act titles: the active article's name stretches open, glyph by glyph.
  const actEls = [...acts.querySelectorAll('.lx-act')];
  actEls.forEach((act, index) => {
    const title = act.querySelector('.lx-act__title');
    title.setAttribute('aria-label', title.textContent);
    const split = SplitText.create(title, { type: 'chars', charsClass: 'lx-char', aria: 'hidden' });
    cleanups.push(() => {
      split.revert();
      title.removeAttribute('aria-label');
    });
    const setActive = (on) => {
      act.classList.toggle('is-active', on);
      if (on) {
        roll(pvStrips, index >= 1);
        roll(creditStrips, index >= 2);
      }
      gsap.to(split.chars, {
        '--w': on ? 122 : 64,
        '--g': on ? 340 : 720,
        duration: on ? 1.1 : 0.6,
        ease: on ? 'expo.out' : 'power2.out',
        stagger: { each: 0.03, from: on ? 'start' : 'end' },
        overwrite: true
      });
    };
    gsap.set(split.chars, { '--w': 64, '--g': 720 });
    ScrollTrigger.create({
      trigger: act,
      start: `top ${line}`,
      end: `bottom ${line}`,
      onToggle: (self) => setActive(self.isActive)
    });
  });

  particles(el, stage, { streams, credit, ret }, flow, cleanups);
}

/* Flowing light along the stream, credit and return paths (2D canvas). */
function particles(section, stage, paths, flow, cleanups) {
  const canvas = stage.querySelector('.lx-life__canvas');
  const c2d = canvas && canvas.getContext('2d');
  if (!c2d) return;

  const SAMPLES = 220;
  const lut = (path) => {
    const len = path.getTotalLength();
    const pts = new Float32Array(SAMPLES * 2);
    for (let i = 0; i < SAMPLES; i++) {
      const p = path.getPointAtLength((i / (SAMPLES - 1)) * len);
      pts[i * 2] = p.x;
      pts[i * 2 + 1] = p.y;
    }
    return pts;
  };

  const dots = [];
  const add = (pts, group, count, speed) => {
    for (let i = 0; i < count; i++) {
      dots.push({ pts, group, t: Math.random(), speed: speed * (0.75 + Math.random() * 0.5), size: 0.8 + Math.random() * 0.9 });
    }
  };
  paths.streams.forEach((p) => add(lut(p), 'stream', 18, 0.22));
  add(lut(paths.credit), 'credit', 46, 0.2);
  add(lut(paths.ret), 'ret', 34, 0.24);

  let scale = 1;
  let dpr = 1;
  let rgb = '214, 187, 139';
  let additive = true;

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = (w / 640) * dpr;
  };
  const readTheme = () => {
    const light = document.documentElement.dataset.theme === 'light';
    additive = !light;
    const hex = getComputedStyle(document.documentElement)
      .getPropertyValue(light ? '--brass-500' : '--brass-200')
      .trim();
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (m) rgb = `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`;
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  readTheme();

  const render = (time, deltaMs) => {
    const dt = Math.min(deltaMs, 50) / 1000;
    c2d.setTransform(1, 0, 0, 1, 0, 0);
    c2d.clearRect(0, 0, canvas.width, canvas.height);
    c2d.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    c2d.fillStyle = `rgb(${rgb})`;
    const creditDir = flow.repay > flow.credit ? -1 : 1;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const intensity = d.group === 'credit' ? Math.max(flow.credit, flow.repay) : flow[d.group];
      const dir = d.group === 'credit' ? creditDir : 1;
      d.t = (d.t + d.speed * dt * dir + 1) % 1;
      if (intensity < 0.02) continue;
      const idx = Math.min(SAMPLES - 1, Math.floor(d.t * SAMPLES));
      const x = d.pts[idx * 2] * scale;
      const y = d.pts[idx * 2 + 1] * scale;
      const s = d.size * scale * 1.6;
      // Fade in and out at the ends of the path so the flow has no hard edges.
      const edge = Math.sin(Math.PI * d.t);
      c2d.globalAlpha = intensity * edge * 0.85;
      c2d.fillRect(x - s / 2, y - s / 2, s, s);
      const back = Math.max(0, idx - 4 * dir) * 2;
      c2d.globalAlpha = intensity * edge * 0.25;
      c2d.fillRect(d.pts[back] * scale - s / 2, d.pts[back + 1] * scale - s / 2, s, s);
    }
    c2d.globalAlpha = 1;
  };

  let running = false;
  const run = (on) => {
    if (on === running) return;
    running = on;
    if (on) {
      readTheme();
      gsap.ticker.add(render);
    } else {
      gsap.ticker.remove(render);
      c2d.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  ScrollTrigger.create({ trigger: section, start: 'top bottom', end: 'bottom top', onToggle: (self) => run(self.isActive) });

  cleanups.push(() => {
    run(false);
    ro.disconnect();
  });
}
