// Properties that must hold for every input, checked on thousands of seeded random cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRng,
  computeDPV,
  liquidationValue,
  spotValue,
  maxBorrow,
  isLiquidatable,
  rateAt,
  auctionStart,
  auctionPrice,
  auctionRestart,
  settle,
  liquidationTrigger
} from '../src/index.js';

const CASES = 4000;

function randomCase(rng) {
  const spot = Math.exp(rng.normal() * 3);
  const twap = spot * (0.7 + rng.uniform() * 0.6);
  const ewma = spot * (0.6 + rng.uniform() * 0.8);
  const withBounds = rng.uniform() < 0.5;
  const ath = spot * (1 + rng.uniform() * 9);
  const atl = Math.min(spot, twap, ewma) * (0.05 + rng.uniform() * 0.9);
  return {
    quantity: Math.exp(rng.normal() * 4 + 8),
    prices: { spot, twap, ewma },
    years: 0.01 + rng.uniform() * 4,
    rank: 1 + rng.int(3),
    bounds: withBounds ? { ath, atl } : null,
    omegaBps: rng.uniform() < 0.3 ? rng.int(10_001) : 10_000,
    maxBorrowUsd: rng.uniform() < 0.2 ? Math.exp(rng.normal() * 3 + 8) : 0,
    hardLtvCapBps: rng.uniform() < 0.2 ? 1 + rng.int(9000) : 0
  };
}

test('a new loan at the maximum is never liquidatable at origination', () => {
  const rng = createRng('origination');
  for (let i = 0; i < CASES; i++) {
    const c = randomCase(rng);
    const { maxBorrow: debt } = maxBorrow(c);
    const value = liquidationValue(c);
    assert.equal(isLiquidatable({ debt, value, rank: c.rank }), false, JSON.stringify(c));
  }
});

test('present value never exceeds the market value of the tokens', () => {
  const rng = createRng('pv<=spot');
  for (let i = 0; i < CASES; i++) {
    const c = randomCase(rng);
    assert.ok(computeDPV(c).pv <= spotValue(c.quantity, c.prices) * (1 + 1e-12));
    assert.ok(liquidationValue(c) <= spotValue(c.quantity, c.prices) * (1 + 1e-12));
  }
});

test('value falls as unlock moves further away, and rises with price', () => {
  const rng = createRng('monotone');
  for (let i = 0; i < CASES; i++) {
    const c = randomCase(rng);
    const later = liquidationValue({ ...c, years: c.years + 0.1 + rng.uniform() });
    assert.ok(later <= liquidationValue(c) * (1 + 1e-12));
    const up = c.prices.spot * (1 + rng.uniform());
    const higher = liquidationValue({ ...c, prices: { spot: up, twap: up } });
    const base = liquidationValue({ ...c, prices: { spot: c.prices.spot, twap: c.prices.spot } });
    assert.ok(higher >= base * (1 - 1e-12), JSON.stringify(c));
  }
});

test('the closed-form trigger price is exactly where the contract flips to liquidatable', () => {
  const rng = createRng('trigger');
  for (let i = 0; i < CASES; i++) {
    const c = { ...randomCase(rng), bounds: null };
    const debt = maxBorrow(c).maxBorrow;
    if (!(debt > 0)) continue;
    const { triggerPrice } = liquidationTrigger({ debt, quantity: c.quantity, years: c.years, rank: c.rank, borrowRateBps: 0 });
    const at = (p) => isLiquidatable({ debt, value: liquidationValue({ ...c, prices: { spot: p, twap: p } }), rank: c.rank });
    assert.equal(at(triggerPrice * (1 + 1e-9)), false);
    assert.equal(at(triggerPrice * (1 - 1e-9)), true);
  }
});

test('borrow rate never falls as utilisation rises', () => {
  let prev = -1;
  for (let u = 0; u <= 10_000; u++) {
    const r = rateAt(u);
    assert.ok(r >= prev);
    prev = r;
  }
});

test('auction prices only fall, rounds chain downward and never reach zero', () => {
  const rng = createRng('auction');
  for (let i = 0; i < 500; i++) {
    let a = auctionStart({ debt: Math.exp(rng.normal() * 3), spot: rng.uniform() < 0.1 ? null : Math.exp(rng.normal() * 3) });
    for (let round = 0; round < 8; round++) {
      let prev = Infinity;
      for (let h = 0; h <= 72; h++) {
        const p = auctionPrice(a, h / 24);
        assert.ok(p <= prev && p > 0);
        prev = p;
      }
      const next = auctionRestart(a);
      assert.ok(next.startPrice === a.floorPrice && next.floorPrice < next.startPrice && next.floorPrice > 0);
      a = next;
    }
  }
});

test('settlement conserves every dollar', () => {
  const rng = createRng('settle');
  for (let i = 0; i < CASES; i++) {
    const principal = Math.exp(rng.normal() * 3 + 5);
    const debt = principal * (1 + rng.uniform());
    const price = debt * rng.uniform() * 2;
    const s = settle({ price, debt, principal, insuranceBalance: rng.uniform() < 0.5 ? debt * rng.uniform() : 0 });
    const eps = 1e-9 * debt;
    assert.ok(Math.abs(s.toDebt + s.surplus - price) < eps);
    assert.ok(Math.abs(s.toLenders + s.toReserve - s.received) < eps);
    assert.ok(Math.abs(s.claim - s.toLenders - s.lenderLoss) < eps);
    assert.ok(s.lenderLoss >= -eps && s.surplus >= -eps && s.toReserve >= -eps);
    if (price >= debt) assert.ok(s.lenderLoss < eps);
  }
});
