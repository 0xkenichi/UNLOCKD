// Layer 1: the mirror reproduces the contracts' arithmetic, checked against values worked by hand from the Solidity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  protocolDefaults,
  effectiveVolatility,
  computeDPV,
  liquidationValue,
  maxBorrow,
  rateAt,
  supplyRateBps,
  auctionStart,
  auctionPrice,
  auctionRestart,
  settle,
  netOfReserve,
  indexAfter,
  isLiquidatable,
  healthFactorBps,
  YEAR_SECONDS
} from '../src/index.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const flat = (p) => ({ spot: p, twap: p, ewma: p });

test('pv for the whitepaper example: Q = 100k, $1, 1 year, rank II', () => {
  // ValuationEngine defaults: r = 5% (rank II), σ = 50%  →  100 000 · e^−0.05 · 0.75
  const { pv, ltvBps } = computeDPV({ quantity: 100_000, prices: flat(1), years: 1, rank: 2 });
  close(pv, 100_000 * Math.exp(-0.05) * 0.75, 1e-9);
  close(pv, 71342.2068, 1e-4);
  assert.equal(ltvBps, 3500);
  // The landing page's specimen uses σ = 60%, stated on the page.
  const p = protocolDefaults();
  p.valuation.volatility = 60;
  close(computeDPV({ quantity: 100_000, prices: flat(1), years: 1, rank: 2 }, p).pv, 66586.0597, 1e-4); // $66,586.06 on the page
});

test('σ and drawdown penalty use the contract’s integer steps', () => {
  // ATH 2, ATL 0.5, price 1:
  //   drawdown 5000 bps → penalty 5000·50/100 = 2500 → capped at 2000
  //   range (2 − 0.5)/(2 + 0.5) = 6000 bps → σ += 6000·2000/(10 000·100) = 12 → 62
  const r = effectiveVolatility(1, { ath: 2, atl: 0.5 });
  assert.deepEqual(r, { effVol: 62, penaltyBps: 2000 });
  // Floor division: 1 bp of drawdown → 0 bps of penalty (1·50/100 = 0)
  assert.equal(effectiveVolatility(0.9999, { ath: 1, atl: 1 }).penaltyBps, 0);
  // σ is capped at 100
  const p = protocolDefaults().valuation;
  assert.equal(effectiveVolatility(1, { ath: 1000, atl: 0.001 }, { ...p, volatility: 95 }).effVol, 100);
});

test('origination uses min(spot, TWAP, EWMA); health checks ignore the EWMA', () => {
  const args = { quantity: 1000, prices: { spot: 10, twap: 9, ewma: 8 }, years: 0.5, rank: 1 };
  const origin = computeDPV(args);
  const health = liquidationValue(args);
  close(origin.detail.price, 8);
  close(health / origin.pv, 9 / 8, 1e-12);
});

test('Ω, the per-loan cap and the hard LTV cap only ever reduce credit', () => {
  const base = { quantity: 1000, prices: flat(10), years: 1, rank: 2 };
  const full = computeDPV(base);
  close(computeDPV({ ...base, omegaBps: 5000 }).pv, full.pv / 2, 1e-9);
  assert.equal(computeDPV({ ...base, maxBorrowUsd: 100 }).pv, 100);
  assert.equal(computeDPV({ ...base, hardLtvCapBps: 2000 }).ltvBps, 2000);
  assert.equal(computeDPV({ ...base, hardLtvCapBps: 9000 }).ltvBps, 3500);
});

test('pre-TGE: synthetic price less the 90% haircut, and a per-loan cap is mandatory', () => {
  assert.throws(() => computeDPV({ quantity: 1000, prices: { synthetic: 2 }, years: 1, rank: 3 }), /pre-TGE cap required/);
  const r = computeDPV({ quantity: 1000, prices: { synthetic: 2 }, years: 1, rank: 3, maxBorrowUsd: 1e9 });
  close(r.detail.price, 0.2, 1e-12);
});

test('borrow is refused when the LTV reaches the liquidation threshold', () => {
  const p = protocolDefaults();
  p.valuation.rankBaseLtvBps[2] = 5000; // equal to the rank II threshold
  assert.throws(() => maxBorrow({ quantity: 1, prices: flat(1), years: 1, rank: 2 }, p), /liquidation threshold/);
});

test('health factor and liquidation agree with LoanManager', () => {
  // value 1000, rank II threshold 50%: liquidatable once debt > 500
  assert.equal(isLiquidatable({ debt: 500, value: 1000, rank: 2 }), false);
  assert.equal(isLiquidatable({ debt: 500.0001, value: 1000, rank: 2 }), true);
  assert.equal(isLiquidatable({ debt: 1, value: 1000, rank: 2, pastGrace: true }), true);
  close(healthFactorBps(500, 1000, 2), 10_000);
});

test('rate model: kinked, continuous at the kink, with the contract’s floor divisions', () => {
  assert.equal(rateAt(0), 500);
  assert.equal(rateAt(4000), 1000);
  assert.equal(rateAt(8000), 1500);
  assert.equal(rateAt(8001), 1500 + Math.floor((1 * 6000) / 2000));
  assert.equal(rateAt(9000), 4500);
  assert.equal(rateAt(10_000), 7500);
  assert.equal(rateAt(1), 500 + Math.floor(1000 / 8000)); // = 500
  close(supplyRateBps(8000), (1500 * 8000 * 9000) / 1e8, 1e-9);
});

test('borrow index: one accrual step is simple interest; many steps compound towards e^rt', () => {
  close(indexAfter(1, 1000, YEAR_SECONDS), 1.1, 1e-12);
  let idx = 1;
  for (let i = 0; i < 365; i++) idx = indexAfter(idx, 1000, YEAR_SECONDS / 365);
  close(idx, Math.pow(1 + 0.1 / 365, 365), 1e-12);
  assert.ok(idx < Math.exp(0.1) && idx > 1.105);
});

test('auction: start at 120% of max(spot, debt), linear to 10% over 3 days, restarts from the floor', () => {
  const a = auctionStart({ debt: 100, spot: 150 });
  close(a.startPrice, 180);
  close(a.floorPrice, 18);
  close(auctionPrice(a, 0), 180);
  close(auctionPrice(a, 1.5), 99);
  close(auctionPrice(a, 3), 18);
  close(auctionPrice(a, 10), 18);
  const b = auctionRestart(a);
  close(b.startPrice, 18);
  close(b.floorPrice, 1.8);
  // No price: start at 4× debt
  close(auctionStart({ debt: 100, spot: null }).startPrice, 400);
});

test('settlement waterfall: proceeds pay the debt, insurance covers a shortfall, surplus goes to the borrower', () => {
  // debt 110 = principal 100 + interest 10; lenders' claim = 100 + 10·0.9 = 109
  close(netOfReserve(110, 100), 109);
  const surplus = settle({ price: 150, debt: 110, principal: 100 });
  assert.deepEqual(
    Object.fromEntries(Object.entries(surplus).map(([k, v]) => [k, +v.toFixed(9)])),
    { claim: 109, toDebt: 110, surplus: 40, covered: 0, received: 110, toLenders: 109, toReserve: 1, lenderLoss: 0 }
  );
  const short = settle({ price: 60, debt: 110, principal: 100, insuranceBalance: 20 });
  close(short.covered, 20);
  close(short.toLenders, 80);
  close(short.lenderLoss, 29);
  const uncovered = settle({ price: 60, debt: 110, principal: 100 });
  close(uncovered.lenderLoss, 49);
});
