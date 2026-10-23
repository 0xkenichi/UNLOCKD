// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * The contract formula (src/onchainV2.js) against the proven model (src/v2.js): it must never
 * lend more, must not lend much less, and must keep the theorems the papers rely on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditValue, maxBorrowV2, V2_DEFAULTS } from '../src/v2.js';
import { creditValueOnchain, maxBorrowOnchain, vestedAt, ONCHAIN_TIERS, ONCHAIN_PARAMS } from '../src/onchainV2.js';
import { TIERS } from '../src/tiers.js';
import { createRng } from '../src/rng.js';

const D = 86400;
const rng = createRng(Number(process.env.PROOF_SEED) || 31);
const U = (a, b) => a + (b - a) * rng.uniform();
const TIER_NAMES = ['standard', 'optIn'];

function draw(i) {
  const type = ['linear', 'cliff', 'cliff-linear'][i % 3];
  const end = Math.round(U(30, 1460));
  const cliff = type === 'cliff' ? end : type === 'linear' ? 0 : Math.round(U(7, end - 7));
  const total = Math.exp(U(0, 25));
  const js = type === 'cliff-linear' ? { type, start: 0, cliff, end, total } : { type, start: 0, end, total };
  const oc = { start: 0, cliff: cliff * D, end: end * D, total, consumed: 0 };
  const price = Math.exp(U(-12, 9));
  const sigma = U(0.15, 2.5);
  const adv = Math.exp(U(Math.log(1e4), Math.log(1e10)));
  const tier = TIER_NAMES[i % 2];
  return { type, end, cliff, js, oc, market: { price, sigma, advUsd: adv }, mk: { price, sigma, adv, drag: 1 }, tier, p: TIERS[tier].v2, T: ONCHAIN_TIERS[tier] };
}

test('the on-chain z values are the tiers\' confidence levels', async () => {
  const { normInv } = await import('../src/v2.js');
  for (const name of TIER_NAMES) {
    assert.ok(Math.abs(ONCHAIN_TIERS[name].zOrig - normInv(TIERS[name].v2.alphaOrig)) < 1e-8); // normInv is Acklam's, |error| < 1.2e-9
    assert.ok(Math.abs(ONCHAIN_TIERS[name].zLiq - normInv(TIERS[name].v2.alphaLiq)) < 1e-8);
    assert.equal(ONCHAIN_TIERS[name].blend, TIERS[name].v2.valuationMode === 'blend');
  }
  assert.equal(ONCHAIN_TIERS.optIn.kOrig, TIERS.optIn.v2.marketabilityRateOrig);
  assert.equal(ONCHAIN_TIERS.optIn.kLiq, TIERS.optIn.v2.marketabilityRateLiq);
});

test('credit value matches the proven model to within 1% (4 000 draws)', () => {
  for (let i = 0; i < 4000; i++) {
    const c = draw(i);
    const t = Math.round(U(0, c.end - 1));
    for (const [alpha, z, k] of [[c.p.alphaOrig, c.T.zOrig, c.T.kOrig], [c.p.alphaLiq, c.T.zLiq, c.T.kLiq]]) {
      const a = creditValue(c.js, t, alpha, c.market, c.p).value;
      const b = creditValueOnchain(c.oc, t * D, c.mk, { blend: c.T.blend, z, k });
      assert.ok(Math.abs(b / a - 1) < 0.01, `case ${i} (${c.type}, ${c.tier}, σ ${c.market.sigma.toFixed(2)}): ${b} vs ${a}`);
    }
  }
});

test('the contract never lends more than the proven model, and gives up no more than the 4-interval bound allows (3 000 draws)', () => {
  for (let i = 0; i < 3000; i++) {
    const c = draw(i);
    const tm = Math.max(1, Math.min(c.end, Math.round(U(30, 1095))));
    const rate = U(0.05, 0.4);
    const a = maxBorrowV2(c.js, 0, tm, rate, c.market, c.p).maxBorrow;
    const b = maxBorrowOnchain(c.oc, 0, tm * D, rate, c.mk, c.T);
    assert.ok(b <= a, `case ${i} (${c.type}, ${c.tier}): contract ${b} > model ${a}`);
    // The grid costs at most r·step (proofs, T11), plus the 0.25% buffer and up to 1% for quadrature at extreme σ.
    const floor = (a * (1 - ONCHAIN_PARAMS.bufferBps / 10_000) * (1 - 0.01)) / (1 + (rate * Math.ceil(tm / ONCHAIN_PARAMS.intervals)) / 365);
    assert.ok(b >= floor, `case ${i} (${c.type}, ${c.tier}): contract ${b} below the bound ${floor}`);
  }
});

test('T5 for the contract formula: at an unchanged price credit value never falls, day by day (300 loans)', () => {
  for (let i = 0; i < 300; i++) {
    const c = draw(i);
    for (const [z, k] of [[c.T.zOrig, c.T.kOrig], [c.T.zLiq, c.T.kLiq]]) {
      let prev = -Infinity;
      for (let d = 0; d <= c.end; d++) {
        const v = creditValueOnchain(c.oc, d * D, c.mk, { blend: c.T.blend, z, k });
        assert.ok(v >= prev * (1 - 1e-12), `case ${i} (${c.type}, ${c.tier}): falls on day ${d}`);
        prev = v;
      }
    }
  }
});

test('T7 for the contract: a loan at the maximum is never liquidatable on any day at an unchanged price (300 loans)', () => {
  for (let i = 0; i < 300; i++) {
    const c = draw(i);
    const tm = Math.max(1, Math.min(c.end, Math.round(U(30, 1095))));
    const rate = U(0, 1);
    const b = maxBorrowOnchain(c.oc, 0, tm * D, rate, c.mk, c.T);
    for (let d = 0; d <= tm; d++) {
      const debt = b * (1 + (rate * d) / 365);
      const cv = creditValueOnchain(c.oc, d * D, c.mk, { blend: c.T.blend, z: c.T.zLiq, k: c.T.kLiq });
      assert.ok(debt <= cv, `case ${i} (${c.type}, ${c.tier}): liquidatable on day ${d} of ${tm}`);
    }
  }
});

test('paydowns lower credit value by no more than the tokens sold are worth (1 000 draws)', () => {
  for (let i = 0; i < 1000; i++) {
    const c = draw(i);
    const t = Math.round(U(1, c.end)) * D;
    const curve = { blend: c.T.blend, z: c.T.zLiq, k: c.T.kLiq };
    const before = creditValueOnchain(c.oc, t, c.mk, curve);
    const held = vestedAt(t, c.oc);
    const sold = held * U(0, 1);
    const after = creditValueOnchain({ ...c.oc, consumed: sold }, t, c.mk, curve);
    assert.ok(after <= before * (1 + 1e-12), `case ${i}: selling raised the value`);
    assert.ok(before - after <= sold * c.mk.price * (1 + 1e-9), `case ${i}: lost more than the sale is worth`);
  }
});

test('the buffer and grid are the ones the contract uses', () => {
  assert.equal(ONCHAIN_PARAMS.intervals, 4);
  assert.equal(ONCHAIN_PARAMS.bufferBps, 25);
  assert.equal(ONCHAIN_PARAMS.panels, 2);
});
