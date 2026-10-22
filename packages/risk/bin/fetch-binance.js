#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Download each token's full daily history (since listing) from Binance's public klines API
 * (no key) into data/history-binance/<SYMBOL>.csv as date,price,volume_usd — the format
 * `calibrate` and `backtest` read. Close = daily close (00:00 UTC); volume = quote volume in
 * USDT. Raw history is not committed (see .gitignore); rerun this to regenerate it.
 *
 *   node bin/fetch-binance.js                 # every symbol in BACKTEST_SYMBOLS
 *   node bin/fetch-binance.js ARB OP          # just these
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BACKTEST_SYMBOLS = [
  'ARB', 'OP', 'APT', 'SUI', 'SEI', 'TIA', 'STRK', 'JUP', 'PYTH', 'WLD', 'DYDX', 'IMX', 'LDO', 'FET',
  'ENA', 'W', 'ZK', 'ZRO', 'ONDO', 'PENDLE', 'EIGEN', 'JTO', 'MANTA', 'ALT', 'DYM', 'AEVO', 'ETHFI',
  'BLUR', 'STX', 'INJ', 'ETH'
];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'history-binance');
const API = 'https://api.binance.com/api/v3/klines';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchAll(symbol) {
  const rows = [];
  let start = 0;
  for (let page = 0; page < 20; page++) {
    const url = `${API}?symbol=${symbol}USDT&interval=1d&limit=1000&startTime=${start}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    for (const k of batch) rows.push({ openTime: k[0], close: Number(k[4]), quoteVolume: Number(k[7]), closeTime: k[6] });
    if (batch.length < 1000) break;
    start = batch[batch.length - 1][0] + 1;
    await sleep(250);
  }
  // Drop today's partial candle.
  const now = Date.now();
  return rows.filter((r) => r.closeTime < now);
}

async function main() {
  const symbols = process.argv.slice(2).length ? process.argv.slice(2) : BACKTEST_SYMBOLS;
  mkdirSync(outDir, { recursive: true });
  for (const s of symbols) {
    try {
      const rows = await fetchAll(s);
      const csv = ['date,price,volume_usd', ...rows.map((r) => `${new Date(r.openTime).toISOString().slice(0, 10)},${r.close},${r.quoteVolume}`)].join('\n');
      writeFileSync(join(outDir, `${s}.csv`), csv + '\n');
      console.log(`${s}: ${rows.length} days (${rows[0] ? new Date(rows[0].openTime).toISOString().slice(0, 10) : '-'} → ${rows.at(-1) ? new Date(rows.at(-1).openTime).toISOString().slice(0, 10) : '-'})`);
    } catch (e) {
      console.log(`${s}: skipped — ${e.message}`);
    }
    await sleep(300);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
