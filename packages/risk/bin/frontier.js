#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * The lending frontier: for a grid of v2 settings, how much is lent against how often loans
 * are liquidated and how much lenders lose, pooled across every token's real history.
 * Writes data/FRONTIER.md and data/frontier.json. Run bin/fetch-binance.js first.
 *
 *   node bin/frontier.js [--buyer 0.6] [--step 14]
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backtestToken, summarise, BACKTEST_DEFAULTS } from '../src/backtest.js';
import { V2_DEFAULTS } from '../src/v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const histDir = join(here, '..', 'data', 'history-binance');

const readCsv = (path) => {
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { prices: rows.map((r) => Number(r[1])), volumesUsd: rows.map((r) => Number(r[2])) };
};
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const pct = (x, d = 1) => `${(100 * x).toFixed(d)}%`;

export const GRID = [
  { label: 'hold, α 0.5% / 5% (paper)', mode: 'hold', alphaOrig: 0.005, alphaLiq: 0.05 },
  { label: 'hold, α 2% / 10%', mode: 'hold', alphaOrig: 0.02, alphaLiq: 0.10 },
  { label: 'hold, α 5% / 20%', mode: 'hold', alphaOrig: 0.05, alphaLiq: 0.20 },
  { label: 'hold, α 10% / 30%', mode: 'hold', alphaOrig: 0.10, alphaLiq: 0.30 },
  { label: 'blend, k 200% / 100%', mode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, kOrig: 2.0, kLiq: 1.0 },
  { label: 'blend, k 150% / 75%', mode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, kOrig: 1.5, kLiq: 0.75 },
  { label: 'blend, k 100% / 50%', mode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, kOrig: 1.0, kLiq: 0.5 },
  { label: 'blend, k 60% / 30%', mode: 'blend', alphaOrig: 0.005, alphaLiq: 0.05, kOrig: 0.6, kLiq: 0.3 }
];
const SHAPES = ['linear-12m', 'cliff-12m', 'cliff6-linear24'];

function main() {
  const cfg = { ...BACKTEST_DEFAULTS, buyerReturn: arg('buyer', 0.6), stepDays: arg('step', 14) };
  const histories = readdirSync(histDir).filter((f) => f.endsWith('.csv')).map((f) => readCsv(join(histDir, f)));
  const rows = [];
  for (const g of GRID) {
    const v2 = { ...V2_DEFAULTS, valuationMode: g.mode, alphaOrig: g.alphaOrig, alphaLiq: g.alphaLiq };
    if (g.kOrig != null) Object.assign(v2, { marketabilityRateOrig: g.kOrig, marketabilityRateLiq: g.kLiq });
    for (const shape of SHAPES) {
      const loans = histories.flatMap((h) => backtestToken(h, { shape, model: 'v2' }, cfg, v2).loans);
      rows.push({ setting: g.label, shape, ...summarise(loans) });
    }
    process.stdout.write('.');
  }
  for (const shape of SHAPES) {
    const loans = histories.flatMap((h) => backtestToken(h, { shape, model: 'v1' }, cfg).loans);
    rows.push({ setting: 'v1 (testnet)', shape, ...summarise(loans) });
  }
  console.log('');
  writeFileSync(join(here, '..', 'data', 'frontier.json'), JSON.stringify({ generated: new Date().toISOString(), cfg, rows }, null, 2));
  const L = ['# Lending frontier', '', `Generated ${new Date().toISOString()} by \`node bin/frontier.js\`. ${histories.length} tokens, real Binance daily history, a loan every ${cfg.stepDays} days, auction buyers requiring ${pct(cfg.buyerReturn, 0)} a year. Worst case for lenders: borrowers take the maximum, never cure, and walk away when underwater. Losses are before any partner backstop or insurance.`, ''];
  for (const shape of SHAPES) {
    L.push(`## ${shape}`, '', '| Setting | Loans | Avg LTV | Liquidated | Loans with a loss | Mean loss | Worst 1% | Worst |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of rows.filter((x) => x.shape === shape)) L.push(`| ${r.setting} | ${r.n} | ${pct(r.ltvMean)} | ${pct(r.liquidatedShare)} | ${pct(r.lossShare)} | ${pct(r.lossMeanPct, 2)} | ${pct(r.lossP99Pct)} | ${pct(r.lossWorstPct)} |`);
    L.push('');
  }
  writeFileSync(join(here, '..', 'data', 'FRONTIER.md'), L.join('\n') + '\n');
  console.log(L.join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
