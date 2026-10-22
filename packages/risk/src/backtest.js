// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Historical backtest: open a loan on every Nth day of a token's real price history and play
 * it forward on what actually happened next, under either the v1 rules now on testnet or the
 * v2 rules of the yellow paper. Nothing is simulated except the borrower's choices, which are
 * worst case for lenders: borrowers take the maximum, never cure, and walk away whenever the
 * collateral is worth less than the debt.
 *
 * Daily closes stand in for the oracle's time-weighted price. Days are integers on the
 * history's own axis; prices[i] and volumesUsd[i] are day i.
 */

import { DAYS_PER_YEAR, priceImpact } from './market.js';
import { maxBorrow as maxBorrowV1, liquidationValue as liquidationValueV1, isLiquidatable as isLiquidatableV1 } from './onchain.js';
import { V2_DEFAULTS, sigmaV2, tranchesAt, remainingTranches, creditValueOf, maxBorrowV2 } from './v2.js';

export const BACKTEST_DEFAULTS = Object.freeze({
  rate: 0.15, //              fixed APR for both models, so the rules are compared, not rates
  feeBps: 50,
  borrowShare: 1, //          share of the maximum each borrower takes
  graceDays: 3,
  cureDays: 2, //             v2 cure window (borrowers are assumed not to cure)
  paydownAdvShare: 0.02, //   v2: vested tokens sold per day as a share of ADV
  paydownMaxDays: 5, //       v2: if paydowns have not restored health by then, escalate to the sale
  healthMargin: 0.05, //      v2: paydown stops once debt ≤ CV_αℓ / (1 + margin)
  auctionDays: 3, //          sale settles this many days after it starts
  buyerReturn: 0.30, //       auction buyers require 30%/yr to hold locked tokens
  otcDiscount: 0.5, //        assumed OTC discount, for the borrower comparison
  borrower: 'adversarial', // 'adversarial': never cures, walks when underwater. 'rational': on the
  //                          breach alert, repays enough to restore health if the stream is still
  //                          worth at least cureEquity × the debt
  cureEquity: 1.25,
  v1Rank: 2,
  minHistoryDays: 90,
  stepDays: 7
});

const adv30 = (volumes, t) => {
  const xs = volumes.slice(Math.max(0, t - 29), t + 1).filter((v) => v > 0);
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** What an auction buyer pays for the remaining claim on day t: locked tokens discounted at buyerReturn, less impact. */
function buyerValue(tranches, t, price, sigma, advUsd, cfg, v2 = V2_DEFAULTS) {
  let total = 0;
  for (const tr of tranches) {
    const years = Math.max(0, tr.day - t) / DAYS_PER_YEAR;
    const usd = tr.qty * price;
    const c = Math.min(0.95, priceImpact(usd / v2.sellDays, { advUsd, sigmaAnnual: sigma }));
    total += usd * Math.exp(-cfg.buyerReturn * years) * (1 - c);
  }
  return total;
}

const at = (arr, i) => arr[Math.min(arr.length - 1, i)];

/**
 * Play one loan. Returns null if there is not enough history after t0.
 * stream days are absolute (same axis as prices); tm = loan maturity day.
 * `oracle` is the price the protocol sees (defaults to the true price): a stale or manipulated
 * oracle prices and monitors the loan, while every sale happens at the true price.
 */
export function playLoan({ prices, volumesUsd, t0, stream, tm, model, oracle = prices, unlocked = null }, cfg = BACKTEST_DEFAULTS, v2 = V2_DEFAULTS) {
  const lastNeeded = tm + cfg.graceDays + cfg.auctionDays + v2.sellDays;
  if (t0 < cfg.minHistoryDays || lastNeeded >= prices.length) return null;

  const p0 = oracle[t0];
  const sigma = sigmaV2(oracle.slice(0, t0 + 1), v2);
  const adv0 = adv30(volumesUsd, t0);
  // Unlock calendar (cumulative tokens unlocked by each history day), when known.
  const supply = unlockSupply(unlocked);
  const market0 = { price: p0, sigma, advUsd: adv0, ...supply(t0) };
  const qtyTotal = stream.total;
  const spotValue0 = qtyTotal * prices[t0];

  // ── Origination ─────────────────────────────────────────────────────────
  let maxB;
  if (model === 'v2') {
    maxB = maxBorrowV2(stream, t0, tm, cfg.rate, market0, v2).maxBorrow;
  } else {
    const years = (stream.end - t0) / DAYS_PER_YEAR;
    maxB = maxBorrowV1({ quantity: qtyTotal, prices: { spot: p0, twap: p0 }, years, rank: cfg.v1Rank }).maxBorrow;
  }
  const principal = maxB * cfg.borrowShare;
  if (!(principal > 0)) return { model, t0, principal: 0, skipped: true };

  let debtPrincipal = principal;
  let accrued = 0;
  let escrowSold = 0; //       vested tokens already sold in paydowns
  let breachDays = 0;
  let paidDown = 0;
  const out = { model, t0, tm, ltv: principal / spotValue0, principal, sigma, liquidated: false, reason: null, lenderLoss: 0, borrowerValue: 0, paidDown: 0, days: 0 };

  for (let t = t0 + 1; t <= tm + cfg.graceDays; t++) {
    accrued += (debtPrincipal * cfg.rate) / DAYS_PER_YEAR;
    const debt = debtPrincipal + accrued;
    const price = prices[t];
    const advUsd = adv30(volumesUsd, t);
    const vestedTotal = tranchesAt(stream, t, v2).filter((x) => x.vested).reduce((a, x) => a + x.qty, 0);
    const escrowQty = Math.max(0, vestedTotal - escrowSold);

    // Maturity: the borrower repays if the stream (all of it, now vested or not) is worth more than the debt.
    if (t >= tm) {
      const remaining = remainingTranches(stream, t, escrowSold, v2).reduce((a, x) => a + x.qty, 0);
      const worth = remaining * price;
      if (worth > debt) {
        out.reason = 'repaid';
        out.borrowerValue = worth - debt;
        out.days = t - t0;
        out.paidDown = paidDown;
        return finish(out, prices, stream, tm, cfg, v2);
      }
      if (t >= tm + cfg.graceDays) return resolve(out, { t, debt, stream, escrowSold, prices, volumesUsd, sigma, cfg, v2, reason: 'maturity', principalLeft: debtPrincipal });
      continue;
    }

    // Health.
    let breached;
    if (model === 'v2') {
      const cv = creditValueOf(remainingTranches(stream, t, escrowSold, v2), t, v2.alphaLiq, { price: oracle[t], sigma, advUsd: adv0, ...supply(t) }, v2).value;
      breached = debt > cv;
      if (breached && cfg.borrower === 'rational' && breachDays === 0) {
        const worth = remainingTranches(stream, t, escrowSold, v2).reduce((a, x) => a + x.qty, 0) * price;
        if (worth >= cfg.cureEquity * debt) {
          // Cure: the borrower's own cash, interest first, down to the health margin.
          let pay = Math.max(0, debt - cv / (1 + cfg.healthMargin));
          out.curedUsd = (out.curedUsd || 0) + pay;
          out.cures = (out.cures || 0) + 1;
          const toInterest = Math.min(accrued, pay);
          accrued -= toInterest;
          pay -= toInterest;
          debtPrincipal -= Math.min(debtPrincipal, pay);
          continue;
        }
      }
      if (breached) {
        breachDays++;
        if (breachDays > cfg.cureDays) {
          // Paydown from vested tokens within the daily cap, for at most paydownMaxDays.
          if (escrowQty > 0 && breachDays <= cfg.cureDays + cfg.paydownMaxDays) {
            const capTokens = advUsd > 0 ? (cfg.paydownAdvShare * advUsd) / price : 0;
            const sell = Math.min(escrowQty, capTokens);
            if (sell > 0) {
              const impact = priceImpact(sell * price, { advUsd, sigmaAnnual: sigma });
              let proceeds = sell * price * (1 - impact);
              escrowSold += sell;
              // Interest first, then principal.
              const toInterest = Math.min(accrued, proceeds);
              accrued -= toInterest;
              proceeds -= toInterest;
              const toPrincipal = Math.min(debtPrincipal, proceeds);
              debtPrincipal -= toPrincipal;
              paidDown += toInterest + toPrincipal;
              const cvAfter = creditValueOf(remainingTranches(stream, t, escrowSold, v2), t, v2.alphaLiq, { price: oracle[t], sigma, advUsd: adv0, ...supply(t) }, v2).value;
              if (debtPrincipal + accrued <= cvAfter / (1 + cfg.healthMargin)) breachDays = 0;
              continue;
            }
          }
          return resolve(out, { t, debt, stream, escrowSold, prices, volumesUsd, sigma, cfg, v2, reason: 'health', principalLeft: debtPrincipal });
        }
      } else {
        breachDays = 0;
      }
    } else {
      const years = Math.max(0, (stream.end - t) / DAYS_PER_YEAR);
      const value = liquidationValueV1({ quantity: qtyTotal, prices: { spot: oracle[t], twap: oracle[t] }, years, rank: cfg.v1Rank });
      if (isLiquidatableV1({ debt, value, rank: cfg.v1Rank })) {
        return resolve(out, { t, debt, stream, escrowSold, prices, volumesUsd, sigma, cfg, v2, reason: 'health', principalLeft: debtPrincipal });
      }
    }
  }
  return null;
}

/** Market fields for the unlock drift on day t: circulating supply then, and a window lookup. */
function unlockSupply(unlocked) {
  if (!unlocked?.length) return () => ({});
  const n = unlocked.length;
  const cum = (i) => unlocked[Math.max(0, Math.min(n - 1, Math.floor(i)))] || 0;
  const unlockedWithin = (a, b) => Math.max(0, cum(b) - cum(a - 1));
  return (t) => ({ circulating: cum(t), unlockedWithin });
}

/** Sell what is left (auction of the stream, settling auctionDays later) and record the outcome. */
function resolve(out, { t, debt, stream, escrowSold, prices, volumesUsd, sigma, cfg, v2, reason }) {
  const ts = t + cfg.auctionDays;
  const price = at(prices, ts);
  const advUsd = adv30(volumesUsd, ts);
  const proceeds = buyerValue(remainingTranches(stream, ts, escrowSold, v2), ts, price, sigma, advUsd, cfg, v2);
  const debtThen = debt; // interest stops when the sale starts
  out.liquidated = true;
  out.reason = reason;
  out.days = t - out.t0;
  out.lenderLoss = Math.max(0, debtThen - proceeds);
  out.borrowerValue = Math.max(0, proceeds - debtThen);
  return finish(out, prices, stream, out.tm, cfg, v2);
}

/** Borrower comparison with selling OTC at t0, valued at maturity. */
function finish(out, prices, stream, tm, cfg) {
  const p0 = prices[out.t0];
  const pT = prices[tm];
  const soldOtc = out.principal / (p0 * (1 - cfg.otcDiscount));
  const otcValue = Math.max(0, stream.total - soldOtc) * pT;
  out.otcValue = otcValue;
  // Cash the borrower put in to cure counts against them.
  out.borrowerAdvantage = out.borrowerValue - (out.curedUsd || 0) - otcValue;
  out.lenderLossPct = out.principal > 0 ? out.lenderLoss / out.principal : 0;
  out.paidDown = out.paidDown || 0;
  return out;
}

/** Stream shapes, relative to the origination day, with the loan's maturity. */
export const STREAM_SHAPES = Object.freeze({
  'linear-12m': (t0, total) => ({ stream: { type: 'linear', start: t0, end: t0 + 365, total }, tm: t0 + 365 }),
  'cliff-12m': (t0, total) => ({ stream: { type: 'cliff', start: t0, end: t0 + 365, total }, tm: t0 + 365 }),
  'cliff6-linear24': (t0, total) => ({ stream: { type: 'cliff-linear', start: t0, cliff: t0 + 182, end: t0 + 730, total }, tm: t0 + 365 })
});

/** Run every origination day for one token, shape and model. */
export function backtestToken({ prices, volumesUsd, unlocked = null }, { shape = 'linear-12m', model = 'v2', notionalUsd = 100_000 } = {}, cfg = BACKTEST_DEFAULTS, v2 = V2_DEFAULTS) {
  const loans = [];
  for (let t0 = cfg.minHistoryDays; t0 < prices.length; t0 += cfg.stepDays) {
    const total = notionalUsd / prices[t0];
    const { stream, tm } = STREAM_SHAPES[shape](t0, total);
    const r = playLoan({ prices, volumesUsd, t0, stream, tm, model, unlocked }, cfg, v2);
    if (r && !r.skipped) loans.push(r);
  }
  return { loans, summary: summarise(loans) };
}

export function summarise(loans) {
  if (!loans.length) return { n: 0 };
  const n = loans.length;
  const mean = (f) => loans.reduce((a, l) => a + f(l), 0) / n;
  const sorted = (f) => loans.map(f).sort((a, b) => a - b);
  const q = (f, p) => { const s = sorted(f); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const lossPcts = loans.map((l) => l.lenderLossPct);
  return {
    n,
    ltvMean: mean((l) => l.ltv),
    liquidatedShare: loans.filter((l) => l.liquidated).length / n,
    lossShare: loans.filter((l) => l.lenderLoss > 0).length / n,
    lossMeanPct: mean((l) => l.lenderLossPct),
    lossWorstPct: Math.max(...lossPcts),
    lossP99Pct: q((l) => l.lenderLossPct, 0.99),
    borrowerBeatsOtcShare: loans.filter((l) => l.borrowerAdvantage >= 0).length / n,
    borrowerAdvantageMedianUsd: q((l) => l.borrowerAdvantage, 0.5),
    paidDownShare: loans.filter((l) => l.paidDown > 0).length / n
  };
}

/**
 * Align a cumulative unlock schedule [{ date, unlocked }] (sorted, ISO dates) to a price
 * history's dates: entry i is tokens unlocked by history day i. Days before the schedule
 * starts take its first value; days after it ends take its last.
 */
export function alignUnlocks(dates, schedule) {
  if (!schedule?.length) return null;
  const out = new Array(dates.length);
  let j = 0;
  for (let i = 0; i < dates.length; i++) {
    while (j + 1 < schedule.length && schedule[j + 1].date <= dates[i]) j++;
    out[i] = schedule[j].date <= dates[i] ? schedule[j].unlocked : schedule[0].unlocked;
  }
  return out;
}
