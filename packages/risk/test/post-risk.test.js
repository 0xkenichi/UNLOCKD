// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worstUnlockShare, riskInputs, readHistory } from '../bin/post-risk.js';

const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);

test('the worst 30-day unlock window is found anywhere inside the term, measured against today\'s circulating supply', () => {
  // 1,000 circulating today; a 100-token cliff on day 200 and a 50-token cliff on day 400.
  const sched = Array.from({ length: 800 }, (_, i) => ({ date: day(i), unlocked: 1000 + (i >= 200 ? 100 : 0) + (i >= 400 ? 50 : 0) }));
  assert.ok(Math.abs(worstUnlockShare(sched, day(10)) - 0.1) < 1e-12, 'the 10% cliff is the worst window');
  assert.ok(Math.abs(worstUnlockShare(sched, day(250)) - 50 / 1100) < 1e-12, 'after it, the 50 of 1,100 cliff is');
  assert.equal(worstUnlockShare(sched, day(500)), 0, 'nothing left to unlock');
  assert.equal(worstUnlockShare(null, day(0)), 0);
  assert.equal(worstUnlockShare([], day(0)), 0);
});

test('two cliffs inside one 30-day window count together', () => {
  const sched = Array.from({ length: 400 }, (_, i) => ({ date: day(i), unlocked: 1000 + (i >= 100 ? 60 : 0) + (i >= 120 ? 40 : 0) }));
  assert.ok(Math.abs(worstUnlockShare(sched, day(0)) - 0.1) < 1e-12);
});

test('risk inputs stay inside the oracle\'s bounds for every token with history', () => {
  for (const sym of ['ARB', 'OP', 'SUI', 'ETH']) {
    if (!readHistory(sym)) continue; // history is gitignored; skip where it is absent
    const r = riskInputs(sym);
    assert.ok(r.sigmaBps >= 1000 && r.sigmaBps <= 50_000, `${sym} σ bps ${r.sigmaBps}`);
    assert.ok(r.dragBps >= 500 && r.dragBps <= 10_000, `${sym} drag bps ${r.dragBps}`);
    assert.ok(r.advUsd6 > 0n, `${sym} volume`);
    assert.ok(r.worstUnlockShare >= 0 && r.worstUnlockShare <= 1);
  }
});
