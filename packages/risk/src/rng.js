// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Seeded randomness. Every simulation takes a seed, so any number in a report can be
 * reproduced exactly, and calibration can compare candidates on the same paths
 * (common random numbers).
 */

function splitmix32(a) {
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** xoshiro128** — fast, well-distributed, 2^128 period. */
export function createRng(seed = 1) {
  const sm = splitmix32(typeof seed === 'number' ? seed : hashString(String(seed)));
  let s0 = sm();
  let s1 = sm();
  let s2 = sm();
  let s3 = sm();
  let spare = null;

  const nextU32 = () => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result;
  };

  /** Uniform in (0, 1). */
  const uniform = () => (nextU32() + 0.5) / 4294967296;

  /** Standard normal (Marsaglia polar). */
  const normal = () => {
    if (spare !== null) {
      const z = spare;
      spare = null;
      return z;
    }
    let u;
    let v;
    let s;
    do {
      u = 2 * uniform() - 1;
      v = 2 * uniform() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const m = Math.sqrt((-2 * Math.log(s)) / s);
    spare = v * m;
    return u * m;
  };

  /** Poisson(λ) by inversion; λ here is small (jumps per step). */
  const poisson = (lambda) => {
    if (lambda <= 0) return 0;
    const l = Math.exp(-lambda);
    let k = 0;
    let p = uniform();
    while (p > l) {
      k += 1;
      p *= uniform();
    }
    return k;
  };

  const int = (n) => Math.floor(uniform() * n);

  return { uniform, normal, poisson, int, nextU32 };
}

function rotl(x, k) {
  return (x << k) | (x >>> (32 - k));
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
