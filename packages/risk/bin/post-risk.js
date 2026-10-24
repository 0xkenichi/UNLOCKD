#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * The risk poster: compute what RiskOracle.postRisk needs for a token from the data this package
 * already keeps, and optionally send it. This is the yellow paper's measurement layer as code,
 * and it fixes what the risk register called "policy, not code" (M6): the unlock drag posted is
 * the worst 30-day unlock window anywhere inside the maximum loan term, so a loan opened today
 * is priced for the heaviest unlock it can live through.
 *
 *   node bin/post-risk.js ARB                        # print the inputs
 *   node bin/post-risk.js ARB --send --token 0x…     # send postRisk (RPC_URL, PRIVATE_KEY, RISK_ORACLE)
 *   node bin/post-risk.js --all                      # every symbol with history
 *
 * Inputs:
 *   σ      sigmaV2 on the Binance daily history: max(30-day, 90-day, EWMA), annualised, in bps
 *   volume median daily quote volume over the last 30 days, USDC (6 decimals)
 *   drag   1 − 0.5 · (largest share of circulating supply unlocking in any 30-day window within
 *          the next MAX_TERM days), floored at 5%; 100% when no calendar is known
 *
 * The oracle refuses anything outside its bounds (σ ∈ [token floor, 500%], drag ∈ [5%, 100%]).
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { sigmaV2, V2_DEFAULTS } from '../src/v2.js';
import { alignUnlocks } from '../src/backtest.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const MAX_TERM_DAYS = 3 * 365;

export function readHistory(sym) {
  const path = join(dataDir, 'history-binance', `${sym}.csv`);
  if (!existsSync(path)) return null;
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { dates: rows.map((r) => r[0]), prices: rows.map((r) => Number(r[1])), volumesUsd: rows.map((r) => Number(r[2])) };
}

export function readSchedule(sym) {
  const path = join(dataDir, 'unlocks', `${sym}.csv`);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8').trim().split('\n').slice(1).map((l) => { const [date, u] = l.split(','); return { date, unlocked: Number(u) }; });
}

/** Largest share of today's circulating supply that unlocks in any 30-day window within the term. */
export function worstUnlockShare(schedule, today, params = V2_DEFAULTS) {
  if (!schedule?.length) return 0;
  const idx = schedule.findIndex((r) => r.date > today);
  const start = idx < 0 ? schedule.length - 1 : Math.max(0, idx - 1);
  const circulating = schedule[start].unlocked;
  if (!(circulating > 0)) return 0;
  const w = params.unlockWindowDays;
  let worst = 0;
  for (let i = start; i < schedule.length && i - start <= MAX_TERM_DAYS; i++) {
    const j = Math.min(schedule.length - 1, i + w);
    worst = Math.max(worst, (schedule[j].unlocked - schedule[i].unlocked) / circulating);
  }
  return worst;
}

export function riskInputs(sym, params = V2_DEFAULTS) {
  const h = readHistory(sym);
  if (!h) throw new Error(`${sym}: no history (run bin/fetch-binance.js)`);
  const sigma = sigmaV2(h.prices, params);
  const vols = h.volumesUsd.slice(-30).filter((v) => v > 0).sort((a, b) => a - b);
  const adv = vols[Math.floor(vols.length / 2)] || 0;
  const share = worstUnlockShare(readSchedule(sym), h.dates.at(-1), params);
  const drag = Math.max(0.05, 1 - params.unlockImpact * share);
  return {
    symbol: sym,
    asOf: h.dates.at(-1),
    sigma,
    sigmaBps: Math.min(50_000, Math.ceil(sigma * 10_000)),
    advUsd: adv,
    advUsd6: BigInt(Math.round(adv * 1e6)),
    worstUnlockShare: share,
    drag,
    dragBps: Math.max(500, Math.floor(drag * 10_000)),
    hasCalendar: !!readSchedule(sym)
  };
}

async function send(inputs, tokenAddress) {
  const { RPC_URL, PRIVATE_KEY, RISK_ORACLE } = process.env;
  if (!RPC_URL || !PRIVATE_KEY || !RISK_ORACLE) throw new Error('set RPC_URL, PRIVATE_KEY and RISK_ORACLE to send');
  const require = createRequire(import.meta.url);
  let ethers;
  for (const p of ['ethers', join(here, '..', '..', '..', 'frontend-legacy', 'node_modules', 'ethers')]) { try { ethers = require(p); break; } catch {} }
  if (!ethers) throw new Error('ethers 6 not found');
  const oracle = new ethers.Contract(RISK_ORACLE, ['function postRisk(address token, uint32 sigmaBps, uint256 advUsd, uint32 dragBps)'], new ethers.Wallet(PRIVATE_KEY, new ethers.JsonRpcProvider(RPC_URL)));
  const tx = await oracle.postRisk(tokenAddress, inputs.sigmaBps, inputs.advUsd6, inputs.dragBps);
  console.log(`sent ${tx.hash}`);
  await tx.wait();
  console.log('confirmed');
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const sendIt = args.includes('--send');
  const tokenIdx = args.indexOf('--token');
  const symbols = all
    ? (existsSync(join(dataDir, 'history-binance')) ? (await import('node:fs')).readdirSync(join(dataDir, 'history-binance')).filter((f) => f.endsWith('.csv')).map((f) => f.replace('.csv', '')) : [])
    : args.filter((a) => !a.startsWith('--') && a !== (tokenIdx > 0 ? args[tokenIdx + 1] : null));
  if (!symbols.length) { console.log('usage: node bin/post-risk.js <SYMBOL…> | --all [--send --token 0x…]'); return; }
  console.log('symbol  as of       σ       σ bps  volume (USD)     worst 30d unlock  drag    drag bps  calendar');
  for (const sym of symbols) {
    const r = riskInputs(sym);
    console.log(`${sym.padEnd(7)} ${r.asOf}  ${(100 * r.sigma).toFixed(0).padStart(4)}%  ${String(r.sigmaBps).padStart(6)}  ${Math.round(r.advUsd).toLocaleString('en-US').padStart(15)}  ${(100 * r.worstUnlockShare).toFixed(1).padStart(14)}%  ${r.drag.toFixed(3)}  ${String(r.dragBps).padStart(8)}  ${r.hasCalendar ? 'yes' : 'no'}`);
    if (sendIt) {
      if (tokenIdx < 0 || symbols.length !== 1) throw new Error('--send needs exactly one symbol and --token <address>');
      await send(r, args[tokenIdx + 1]);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
