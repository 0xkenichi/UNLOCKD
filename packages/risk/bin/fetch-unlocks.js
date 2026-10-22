#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Download each token's documented unlock schedule from DefiLlama's public emissions dataset
 * (no key) into data/unlocks/<SYMBOL>.csv as date,unlocked — the cumulative number of tokens
 * unlocked by that day across every allocation (team, investors, airdrop, treasury...). This
 * is the schedule that was published in advance, which is what the protocol would know when
 * pricing a loan. Raw files are not committed; rerun this to regenerate them.
 *
 * Each symbol is mapped to a DefiLlama slug, and the file's own CoinGecko id must match the one
 * expected here before it is used, so a wrong slug is skipped rather than silently misread.
 *
 *   node bin/fetch-unlocks.js            # every mapped symbol
 *   node bin/fetch-unlocks.js ARB OP     # just these
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE = 'https://defillama-datasets.llama.fi/emissions';

/** symbol → [DefiLlama slug, expected CoinGecko id]. Tokens without a documented schedule are absent. */
export const UNLOCK_SLUGS = Object.freeze({
  ARB: ['arbitrum-foundation', 'arbitrum'],
  OP: ['optimism-foundation', 'optimism'],
  APT: ['aptos', 'aptos'],
  SUI: ['sui-foundation', 'sui'],
  SEI: ['sei', 'sei-network'],
  TIA: ['celestia', 'celestia'],
  STRK: ['starknet-bridge', 'starknet'],
  JUP: ['jupiter', 'jupiter-exchange-solana'],
  PYTH: ['pyth', 'pyth-network'],
  WLD: ['worldcoin', 'worldcoin-wld'],
  DYDX: ['dydx', 'dydx-chain'],
  IMX: ['immutablex', 'immutable-x'],
  LDO: ['lido', 'lido-dao'],
  ENA: ['ethena', 'ethena'],
  W: ['portal', 'wormhole'],
  ZK: ['zksync-era', 'zksync'],
  ZRO: ['layerzero', 'layerzero'],
  ONDO: ['ondo-finance', 'ondo-finance'],
  PENDLE: ['pendle', 'pendle'],
  EIGEN: ['eigencloud', 'eigenlayer'],
  JTO: ['jito', 'jito-governance-token'],
  MANTA: ['manta-pacific', 'manta-network'],
  ALT: ['altlayer', 'altlayer'],
  DYM: ['dymension', 'dymension'],
  ETHFI: ['ether.fi', 'ether-fi'],
  BLUR: ['blur', 'blur'],
  INJ: ['injective-orderbook', 'injective-protocol']
});

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data', 'unlocks');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cumulative unlocked tokens per UTC day, summed over allocations. */
export function cumulativeUnlocks(doc) {
  const byDay = new Map();
  for (const alloc of doc?.documentedData?.data ?? []) {
    for (const p of alloc.data ?? []) {
      const day = new Date(p.timestamp * 1000).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + (Number(p.unlocked) || 0));
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, unlocked]) => ({ date, unlocked }));
}

async function fetchJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(2000 * i);
    }
  }
}

async function main() {
  const symbols = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(UNLOCK_SLUGS);
  mkdirSync(outDir, { recursive: true });
  for (const sym of symbols) {
    const entry = UNLOCK_SLUGS[sym];
    if (!entry) { console.log(`${sym}: no schedule mapped`); continue; }
    const [slug, gecko] = entry;
    try {
      const doc = await fetchJson(`${BASE}/${encodeURIComponent(slug)}`);
      if (doc.gecko_id !== gecko) { console.log(`${sym}: skipped — ${slug} is ${doc.gecko_id}, expected ${gecko}`); continue; }
      const rows = cumulativeUnlocks(doc);
      if (!rows.length) { console.log(`${sym}: skipped — no documented schedule`); continue; }
      writeFileSync(join(outDir, `${sym}.csv`), ['date,unlocked', ...rows.map((r) => `${r.date},${r.unlocked}`)].join('\n') + '\n');
      const max = rows.at(-1).unlocked;
      console.log(`${sym}: ${rows.length} days ${rows[0].date} → ${rows.at(-1).date}, ${(max / 1e6).toFixed(0)}M tokens by the end`);
    } catch (e) {
      console.log(`${sym}: skipped — ${e.message}`);
    }
    await sleep(300);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
