#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Replay v1 (testnet) and v2 (yellow paper) loans on every token's real daily history and write
 * data/BACKTEST.md and data/backtest.json. Run bin/fetch-binance.js first.
 *
 *   node bin/backtest.js [--step 7] [--share 1]
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { backtestToken, summarise, STREAM_SHAPES, BACKTEST_DEFAULTS } from '../src/backtest.js';
import { V2_DEFAULTS } from '../src/v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const histDir = join(here, '..', 'data', 'history-binance');
const outMd = join(here, '..', 'data', 'BACKTEST.md');
const outJson = join(here, '..', 'data', 'backtest.json');

function readCsv(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n').slice(1);
  const dates = [], prices = [], volumesUsd = [];
  for (const l of lines) {
    const [d, p, v] = l.split(',');
    dates.push(d);
    prices.push(Number(p));
    volumesUsd.push(Number(v));
  }
  return { dates, prices, volumesUsd };
}

const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? '—' : `${(100 * x).toFixed(d)}%`);
const usd = (x) => (x == null ? '—' : `${x < 0 ? '−' : ''}$${Math.round(Math.abs(x)).toLocaleString('en-US')}`);

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : dflt;
}

function main() {
  if (!existsSync(histDir)) throw new Error('No history: run node bin/fetch-binance.js first.');
  const cfg = { ...BACKTEST_DEFAULTS, stepDays: arg('step', BACKTEST_DEFAULTS.stepDays), borrowShare: arg('share', BACKTEST_DEFAULTS.borrowShare), buyerReturn: arg('buyer', BACKTEST_DEFAULTS.buyerReturn) };
  const modeIdx = process.argv.indexOf('--mode');
  const v2 = { ...V2_DEFAULTS, valuationMode: modeIdx > 0 ? process.argv[modeIdx + 1] : V2_DEFAULTS.valuationMode };
  // --set key=value overrides any V2_DEFAULTS number, e.g. --set alphaOrig=0.02 --set marketabilityRateOrig=1.2
  process.argv.forEach((a, i) => {
    if (a === '--set') {
      const [k, val] = process.argv[i + 1].split('=');
      if (!(k in V2_DEFAULTS)) throw new Error(`unknown v2 parameter ${k}`);
      v2[k] = Number(val);
    }
  });
  const shapeArg = process.argv.indexOf('--shapes');
  const onlyShapes = shapeArg > 0 ? process.argv[shapeArg + 1].split(',') : null;
  const onlyV2 = process.argv.includes('--v2-only');
  const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : '';
  const files = readdirSync(histDir).filter((f) => f.endsWith('.csv')).sort();
  const shapes = Object.keys(STREAM_SHAPES).filter((x) => !onlyShapes || onlyShapes.includes(x));
  const results = { generated: new Date().toISOString(), cfg, v2, tokens: {}, pooled: {} };
  const pooled = {};

  for (const f of files) {
    const sym = f.replace('.csv', '');
    const h = readCsv(join(histDir, f));
    results.tokens[sym] = { days: h.prices.length, from: h.dates[0], to: h.dates.at(-1), shapes: {} };
    for (const shape of shapes) {
      results.tokens[sym].shapes[shape] = {};
      for (const model of onlyV2 ? ['v2'] : ['v1', 'v2']) {
        const { loans, summary } = backtestToken(h, { shape, model }, cfg, v2);
        results.tokens[sym].shapes[shape][model] = summary;
        (pooled[`${shape}|${model}`] ||= []).push(...loans);
      }
    }
  }
  for (const [k, loans] of Object.entries(pooled)) results.pooled[k] = summarise(loans);
  const suffix = tag ? `-${tag}` : '';
  writeFileSync(outJson.replace('.json', `${suffix}.json`), JSON.stringify(results, null, 2));

  // ── Report ──────────────────────────────────────────────────────────────
  const L = [];
  L.push(`# Backtest: v1 (testnet) vs v2 (${v2.valuationMode} valuation) on real price history`);
  L.push('');
  L.push(`Auction buyers require ${(100 * cfg.buyerReturn).toFixed(0)}% a year. v2 valuation mode: ${v2.valuationMode}.`);
  L.push('');
  L.push(`Generated ${results.generated} by \`node bin/backtest.js\`. Prices: Binance public daily klines (close, quote volume), ${files.length} tokens, full history since listing. A loan is opened every ${cfg.stepDays} days from day ${cfg.minHistoryDays} of each history and played forward on what actually happened.`);
  L.push('');
  L.push('Worst case for lenders: every borrower takes the maximum, never cures a breach, and walks away whenever the stream is worth less than the debt. Both models use the same fixed 15% APR and the same auction buyer (requires 30% a year for locked tokens, pays square-root impact), so the comparison isolates the rules. No partner backstop is assumed: losses shown are what a backstop and insurance would have to cover.');
  L.push('');
  L.push('## All tokens pooled');
  L.push('');
  L.push('| Stream | Model | Loans | Avg LTV | Liquidated | Loans with a loss | Mean loss | Worst 1% | Worst | Borrower beats OTC |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const shape of shapes) {
    for (const model of ['v1', 'v2']) {
      const s = results.pooled[`${shape}|${model}`];
      L.push(`| ${shape} | ${model} | ${s.n} | ${pct(s.ltvMean)} | ${pct(s.liquidatedShare)} | ${pct(s.lossShare)} | ${pct(s.lossMeanPct, 2)} | ${pct(s.lossP99Pct)} | ${pct(s.lossWorstPct)} | ${pct(s.borrowerBeatsOtcShare)} |`);
    }
  }
  L.push('');
  L.push('Loss figures are a share of the loan principal. "Borrower beats OTC" compares the borrower\'s position at maturity with having sold enough tokens OTC at a 50% discount to raise the same cash (an assumed discount).');
  L.push('');
  for (const shape of shapes) {
    L.push(`## By token: ${shape}`);
    L.push('');
    L.push('| Token | History | Loans | LTV v1 → v2 | Liquidated v1 → v2 | Mean loss v1 → v2 | Worst loss v1 → v2 |');
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const sym of Object.keys(results.tokens)) {
      const t = results.tokens[sym];
      const a = t.shapes[shape].v1, b = t.shapes[shape].v2;
      if (!a.n) continue;
      L.push(`| ${sym} | ${t.from} → ${t.to} | ${a.n} | ${pct(a.ltvMean)} → ${pct(b.ltvMean)} | ${pct(a.liquidatedShare)} → ${pct(b.liquidatedShare)} | ${pct(a.lossMeanPct, 2)} → ${pct(b.lossMeanPct, 2)} | ${pct(a.lossWorstPct)} → ${pct(b.lossWorstPct)} |`);
    }
    L.push('');
  }
  L.push('## What this does not model');
  L.push('');
  L.push('- Unlock schedules of the whole token (the drift term): not yet in the data, so v2 is run with zero unlock drift.');
  L.push('- Intraday moves: daily closes stand in for the oracle price, so a gap inside one day is seen at the close.');
  L.push('- Partner buyback, insurance and tranches: losses are reported before any of them.');
  L.push('- Real borrower behaviour: borrowers here are adversarial (always max out, never cure).');
  writeFileSync(outMd.replace('.md', `${suffix}.md`), L.join('\n') + '\n');
  console.log(L.slice(0, 16).join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
