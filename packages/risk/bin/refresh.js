#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COINGECKO_API,
  coinPath,
  marketChartPath,
  dailyRowsFromMarketChart,
  historyCsv,
  assessToken,
  calibrationReport,
  snapshotsReport
} from '../src/index.js';

/*
 * Daily refresh: fetch each configured token's price and volume history, keep or redo its
 * calibration as the monitor says, and write what the backend serves.
 *
 *   data/history/<id>.csv   date,price,volume_usd — the input `vestra-risk calibrate` reads
 *   data/snapshots.json     one snapshot per token (served by GET /api/risk/tokens/:address)
 *   data/reports/<SYM>.md   full calibration report, rewritten when a token is recalibrated
 *   data/REPORT.md          summary: each token's calibration, data source and date
 *
 * A token whose fetch fails keeps its previous snapshot and is listed under "Not refreshed".
 */

const USAGE = `refresh [--config data/tokens.json] [--out data] [--only id,id] [--recalibrate]

  COINGECKO_API_KEY (optional): a CoinGecko demo key, sent as x-cg-demo-api-key like the backend does.`;

const here = dirname(fileURLToPath(import.meta.url));
const a = { config: join(here, '../data/tokens.json'), out: join(here, '../data') };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (k === 'recalibrate' || k === 'help') a[k] = true;
  else a[k] = argv[++i];
}
if (a.help) {
  console.log(USAGE);
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE_MS = Number(process.env.COINGECKO_PAUSE_MS ?? 2500); // public API: a few calls a minute

async function get(path) {
  const headers = process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {};
  for (let attempt = 0; ; attempt++) {
    await sleep(PAUSE_MS);
    const res = await fetch(COINGECKO_API + path, { headers, signal: AbortSignal.timeout(20_000) });
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 30_000 * (attempt + 1);
      process.stderr.write(`  rate-limited; waiting ${Math.round(wait / 1000)} s\n`);
      await sleep(wait);
      continue;
    }
    throw new Error(`CoinGecko ${path.split('?')[0]}: HTTP ${res.status}`);
  }
}

const config = JSON.parse(readFileSync(a.config, 'utf8'));
const days = config.days || 365;
const out = resolve(a.out);
const snapshotsFile = join(out, 'snapshots.json');
mkdirSync(join(out, 'history'), { recursive: true });
mkdirSync(join(out, 'reports'), { recursive: true });

const previousIndex = existsSync(snapshotsFile) ? JSON.parse(readFileSync(snapshotsFile, 'utf8')) : { tokens: [] };
const previousById = new Map(previousIndex.tokens.map((s) => [s.coingeckoId, s]));
const only = a.only ? new Set(String(a.only).split(',')) : null;

const tokens = [];
const errors = [];
for (const token of config.tokens) {
  const previous = previousById.get(token.coingeckoId) || null;
  if (only && !only.has(token.coingeckoId)) {
    if (previous) tokens.push(previous);
    continue;
  }
  process.stderr.write(`${token.coingeckoId}\n`);
  try {
    const coin = await get(coinPath(token.coingeckoId));
    const chartPath = marketChartPath(token.coingeckoId, days);
    const rows = dailyRowsFromMarketChart(await get(chartPath));
    writeFileSync(join(out, 'history', `${token.coingeckoId}.csv`), historyCsv(rows));
    const source = { provider: 'CoinGecko', endpoint: chartPath, fetchedAt: new Date().toISOString() };
    const r = assessToken({ token, coin, rows, source, previous, force: Boolean(a.recalibrate) });
    if (r.calibration) {
      const s = r.snapshot;
      const suspect = s.dataQuality.suspectReversals;
      const dataLine = [
        `CoinGecko daily price and volume, ${s.dataFrom} to ${s.dataDate} (${s.observations} daily returns)`,
        `rank ${token.rank ?? 2} ${token.rankBasis || 'assumed'}`,
        `unlocks ${s.unlocks.events.length ? 'from ' + s.unlocks.source : 'not modelled'}`,
        ...(suspect.length ? [`**${suspect.length} suspected bad print(s) kept (${suspect.map((x) => x.date).join(', ')}) — volatility, Ω and cap may reflect the source rather than the market**`] : [])
      ];
      writeFileSync(join(out, 'reports', `${s.symbol}.md`), calibrationReport(r.calibration, { source: dataLine.join('; ') }));
    }
    const s = r.snapshot;
    process.stderr.write(`  ${s.symbol}: data to ${s.dataDate}, σ ${(s.volatility.forBorrowers * 100).toFixed(0)}%, Ω ${(s.calibration.omegaBps / 100).toFixed(1)}%, ${r.reason ? `recalibrated (${r.reason})` : 'calibration kept'}, monitor ${s.monitor.status}\n`);
    tokens.push(s);
  } catch (err) {
    process.stderr.write(`  failed: ${err.message}\n`);
    errors.push({ coingeckoId: token.coingeckoId, error: err.message, keptFrom: previous?.dataDate || null });
    if (previous) tokens.push(previous);
  }
}

const index = {
  generatedAt: new Date().toISOString(),
  source: { provider: 'CoinGecko', api: COINGECKO_API, days },
  tokens,
  errors
};
writeFileSync(snapshotsFile, JSON.stringify(index, null, 2) + '\n');
writeFileSync(join(out, 'REPORT.md'), snapshotsReport(index));
process.stderr.write(`${tokens.length} snapshot(s) → ${snapshotsFile}${errors.length ? `; ${errors.length} failed` : ''}\n`);
process.exitCode = errors.length ? 1 : 0;
