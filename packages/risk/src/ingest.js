// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Real data in. Turns a public price source's responses into the daily history the engine
 * reads (date,price,volume_usd), and the engine's output into the snapshot the backend serves.
 * Pure: the network lives in bin/refresh.js, so these are tested on recorded responses.
 *
 * Source: CoinGecko's public API (no key), the same one packages/backend already uses for
 * price history. `/coins/{id}/market_chart?interval=daily` returns one point at 00:00 UTC per
 * day — price at that instant, volume over the previous 24 hours — plus a last point at the
 * time of the request, which is a partial day and is dropped.
 */

import { buildProfile } from './profile.js';
import { calibrateToken } from './calibrate.js';
import { monitorToken } from './monitor.js';

export const COINGECKO_API = 'https://api.coingecko.com/api/v3';

export const marketChartPath = (id, days) => `/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
export const coinPath = (id) =>
  `/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`;

const DAY_MS = 86_400_000;
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Daily rows from a market_chart response, oldest first. Keeps only points at 00:00 UTC, one
 * per date; a row's volume is the volume reported at the same timestamp (0 when missing).
 * @returns {{ date: string, price: number, volumeUsd: number }[]}
 */
export function dailyRowsFromMarketChart(chart) {
  if (!chart || !Array.isArray(chart.prices)) throw new Error('market_chart response has no "prices" array');
  const volumeAt = new Map((chart.total_volumes || []).map(([t, v]) => [t, v]));
  const byDate = new Map();
  for (const [t, p] of chart.prices) {
    if (t % DAY_MS !== 0 || !(p > 0)) continue; // partial day, or no price
    byDate.set(isoDate(t), { date: isoDate(t), price: p, volumeUsd: Number(volumeAt.get(t)) || 0 });
  }
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (rows.length < 2) throw new Error(`market_chart response has ${rows.length} daily price(s); need at least 2`);
  return rows;
}

/** Calendar days missing between consecutive rows (the engine treats rows as consecutive days). */
export function missingDays(rows) {
  let gaps = 0;
  for (let i = 1; i < rows.length; i++) gaps += Math.round((Date.parse(rows[i].date) - Date.parse(rows[i - 1].date)) / DAY_MS) - 1;
  return gaps;
}

/**
 * Days that look like bad prints rather than trading: a move of at least `minMove` (log) that is
 * at least three-quarters undone within `withinDays`. Flagged, never removed — the engine sees
 * the data as the source gives it, which overstates volatility if the prints are bad.
 */
export function suspectReversals(rows, { minMove = 0.25, withinDays = 2 } = {}) {
  const out = [];
  for (let t = 1; t < rows.length - 1; t++) {
    const move = Math.log(rows[t].price / rows[t - 1].price);
    if (Math.abs(move) < minMove) continue;
    for (let k = 1; k <= withinDays && t + k < rows.length; k++) {
      const back = Math.log(rows[t + k].price / rows[t].price);
      if (Math.sign(back) !== Math.sign(move) && Math.abs(move + back) <= 0.25 * Math.abs(move)) {
        out.push({ date: rows[t].date, move: Number((Math.exp(move) - 1).toFixed(4)), revertedInDays: k });
        break;
      }
    }
  }
  return out;
}

export function historyCsv(rows) {
  return ['date,price,volume_usd', ...rows.map((r) => `${r.date},${r.price},${r.volumeUsd}`)].join('\n') + '\n';
}

/** The CSV `bin/vestra-risk.js` reads. Rows without a positive price are skipped. */
export function parseHistoryCsv(text) {
  const rows = text.trim().split(/\r?\n/);
  const header = rows.shift().toLowerCase().split(',').map((h) => h.trim());
  const di = header.indexOf('date');
  const pi = header.indexOf('price');
  const vi = header.indexOf('volume_usd');
  if (pi < 0) throw new Error('CSV needs a "price" column');
  const dates = [];
  const prices = [];
  const volumesUsd = [];
  for (const row of rows) {
    const cells = row.split(',');
    const p = Number(cells[pi]);
    if (!(p > 0)) continue;
    prices.push(p);
    if (di >= 0) dates.push(cells[di].trim());
    if (vi >= 0) volumesUsd.push(Number(cells[vi]) || 0);
  }
  return { dates, prices, volumesUsd };
}

/** EVM addresses compare lower-cased; others (Solana mints) are case-sensitive and kept as given. */
export const addressKey = (address) => {
  const a = String(address || '').trim();
  return /^0x[0-9a-f]+$/i.test(a) ? a.toLowerCase() : a;
};

/** Contract addresses CoinGecko lists for a coin; the snapshot is served under each. */
export function addressesFromCoin(coin) {
  return Object.entries(coin?.platforms || {})
    .filter(([platform, address]) => platform && typeof address === 'string' && address.trim())
    .map(([platform, address]) => ({ platform, address: addressKey(address) }));
}

const round = (x, d = 6) => (x == null || !Number.isFinite(x) ? null : Number(x.toPrecision(d)));

/** What `monitorToken` needs from a calibration, kept with the snapshot so tomorrow's run can check it. */
export function calibrationBasis(c, profile, { calibratedAt, dataDate }) {
  return { symbol: c.symbol, calibratedAt, dataDate, spot: profile.spot, impactVol: profile.impactVol, advUsd: profile.advUsd, omegaBps: c.recommendation.omegaBps };
}

/**
 * The record the backend serves for one token. Every number comes from the engine; the
 * fields that are assumptions rather than measurements say so.
 */
export function tokenSnapshot({ token, coin, rows, source, market, calibration, monitor, unlocks }) {
  const sigma = Math.max(market.volTotal, market.volEwma);
  return {
    symbol: (coin?.symbol || token.symbol || token.coingeckoId).toUpperCase(),
    name: coin?.name || null,
    coingeckoId: token.coingeckoId,
    addresses: addressesFromCoin(coin),
    source,
    dataFrom: rows[0].date,
    dataDate: rows[rows.length - 1].date,
    observations: market.observations,
    missingDays: missingDays(rows),
    spotUsd: round(market.spot),
    volatility: {
      // Annualised, from daily log returns. `forBorrowers` is the larger of total and EWMA —
      // the σ the calibration uses for a borrower's chance of liquidation.
      total: round(market.volTotal, 4),
      ewma: round(market.volEwma, 4),
      d30: round(market.vol30d, 4),
      d90: round(market.vol90d, 4),
      downside: round(market.volDownside, 4),
      forBorrowers: round(sigma, 4)
    },
    jumpDiffusion: Object.fromEntries(Object.entries(market.jumpDiffusion).map(([k, v]) => [k, round(v, 4)])),
    maxDrawdown: round(market.maxDrawdown, 4),
    advUsd: Math.round(market.advUsd),
    dataQuality: (() => {
      const suspect = suspectReversals(rows);
      return suspect.length
        ? { suspectReversals: suspect, note: `${suspect.length} day(s) where the price moved by at least 0.25 in log terms (+28% or −22%) and reverted within 2 days — possibly bad prints in the source. They are kept, so volatility may be overstated; check a second source before acting on this calibration.` }
        : { suspectReversals: [] };
    })(),
    calibration: { ...calibration, rankBasis: token.rankBasis || 'assumed' },
    monitor: { checkedAt: monitor.checkedAt, status: monitor.status, alerts: monitor.alerts },
    unlocks: unlocks.length
      ? { source: token.unlocksSource || 'token config', events: unlocks, circulating: token.circulating || 0 }
      : { source: null, events: [], note: 'No unlock schedule: no keyless source is available (DefiLlama emissions needs a paid key). Unlock overhang is not modelled for this token.' }
  };
}

/** Unlocks given by date in the token config, as the engine takes them: days after the last row. */
export function unlocksFromDates(unlocks = [], dataDate) {
  return unlocks
    .map((u) => ({ day: Math.round((Date.parse(u.date) - Date.parse(dataDate)) / DAY_MS), amount: Number(u.amount) }))
    .filter((u) => u.day >= 0 && u.amount > 0);
}

/**
 * One token, one day of data: keep yesterday's calibration while the monitor says it still
 * holds, otherwise recalibrate; then monitor today's market against whichever is current.
 * @param {object} a { token, coin, rows, source, previous?, now?, policy?, force?, maxAgeDays? }
 * @returns {{ snapshot, calibration: object|null, reason: string|null }} calibration is the
 *          full calibrateToken result when this run recalibrated, for the report.
 */
export function assessToken({ token, coin, rows, source, previous = null, now = new Date(), policy, force = false, maxAgeDays = 30 }) {
  const dataDate = rows[rows.length - 1].date;
  const unlocks = unlocksFromDates(token.unlocks, dataDate);
  const symbol = (coin?.symbol || token.symbol || token.coingeckoId).toUpperCase();
  const history = { symbol, prices: rows.map((r) => r.price), volumesUsd: rows.map((r) => r.volumeUsd), unlocks, circulating: token.circulating || 0 };
  const rank = token.rank ?? 2;
  const checkedAt = now.toISOString();

  const prev = previous?.calibration;
  let reason = null;
  let triggeredBy = [];
  if (force) reason = 'forced';
  else if (!prev?.basis) reason = 'first calibration';
  else if (prev.rank !== rank) reason = `rank changed ${prev.rank} → ${rank}`;
  else if ((now - Date.parse(prev.basis.calibratedAt)) / DAY_MS > maxAgeDays) reason = `calibration older than ${maxAgeDays} days`;
  else {
    const m = monitorToken(prev.basis, history);
    if (m.status !== 'ok') {
      reason = `monitor: ${m.status}`;
      triggeredBy = m.alerts;
    }
  }

  const profile = buildProfile(history);
  let full = null;
  let calibration = prev;
  if (reason) {
    full = calibrateToken(profile, { rank, policy });
    const r = full.recommendation;
    calibration = {
      calibratedAt: checkedAt,
      dataDate,
      reason,
      triggeredBy,
      rank,
      omegaBps: r.omegaBps,
      newCredit: r.newCredit,
      maxBorrowUsd: r.maxBorrowUsd,
      sigmaEquivalentPct: r.sigmaEquivalentPct,
      validated: full.validated,
      binding: r.binding,
      basis: calibrationBasis(full, profile, { calibratedAt: checkedAt, dataDate })
    };
  }
  const m = monitorToken(calibration.basis, history);
  const snapshot = tokenSnapshot({
    token,
    coin,
    rows,
    source,
    market: profile.market,
    calibration,
    monitor: { checkedAt, status: m.status, alerts: m.alerts },
    unlocks
  });
  return { snapshot, calibration: full, reason };
}
