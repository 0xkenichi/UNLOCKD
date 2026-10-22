#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

/*
 * Run the whole stress grid (src/stress.js) across worker threads, replay every setting on the
 * real histories by month of origination, and judge each setting against acceptance criteria
 * fixed in advance (ACCEPT below). Writes data/STRESS.md and data/stress.json.
 *
 *   node bin/stress.js [--paths 64] [--workers 8]
 *
 * Needs data/history-binance (node bin/fetch-binance.js) for the bootstrap family and the
 * historical cohorts.
 */

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCells, runCell, lossStats, waterfall, SETTINGS, FACTORS, coveringArray } from '../src/stress.js';
import { backtestToken, alignUnlocks, BACKTEST_DEFAULTS, STREAM_SHAPES } from '../src/backtest.js';
import { V2_DEFAULTS } from '../src/v2.js';

const here = dirname(fileURLToPath(import.meta.url));
const histDir = join(here, '..', 'data', 'history-binance');
const unlockDir = join(here, '..', 'data', 'unlocks');

/**
 * Fixed before the first run, then revised once (see REVISIONS) because two of the first
 * criteria turned out to be degenerate. Each setting is judged in two regimes:
 *
 *   unbacked   no project backstop. On realistic paths (30-day blocks of real returns, and the
 *              real histories): mean loss ≤ 0.5% of principal and worst 1% ≤ 10%; and the
 *              worst real calendar month of originations (≥ 5 tokens) loses ≤ 3% on average.
 *   backed     the project commits a first-loss backstop B per loan = the worst 1% realistic
 *              loss. After B: the worst real month loses ≤ 3% on average.
 *   seniors    in either regime, seniors lose nothing even if, at once, every loan in the pool
 *              takes the worst real month AND one token at the 10% concentration cap takes the
 *              worst loss seen anywhere in the stress grid — with junior 15% and insurance 2%
 *              of the pool in front of them.
 */
export const ACCEPT = Object.freeze({
  unbacked: { meanLoss: 0.005, p99: 0.10 },
  cohortWorstMean: 0.03,
  cohortMinTokens: 5,
  maxLiquidatedHistory: 0.25,
  pool: { junior: 0.15, insurance: 0.02, concentration: 0.10 }
});

export const REVISIONS = Object.freeze([
  'Added after the first run: a borrower check. On lender loss alone v1 passed, because it liquidates about 84% of borrowers and the auction recovers the money. That breaks the rule that the protocol must not extort holders, so a setting must also force-liquidate (on health, not a walk-away at maturity) at most 25% of loans on the real histories, with borrowers who never cure, so real rates would be lower. A borrower who lets an underwater stream go at maturity is making their own choice and is not counted.',
  'The first run sized the backstop at the worst 1% of ALL stress paths. Those include overnight 95% gaps, which wipe out any loan above about 5% LTV, so the backstop came out at roughly the whole loan and the senior test passed trivially. The backstop is now sized on realistic paths; the extreme families are charged to junior and insurance through the concentration cap instead.',
  'The first run counted any calendar month with 5 loans as a cohort. Months in 2019 held only one or two tokens, so they measured concentration in one token, not a correlated crash. A cohort now needs at least 5 distinct tokens.'
]);

const readCsv = (path) => {
  const rows = readFileSync(path, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { dates: rows.map((r) => r[0]), prices: rows.map((r) => Number(r[1])), volumesUsd: rows.map((r) => Number(r[2])) };
};
const readSchedule = (sym) => {
  const path = join(unlockDir, `${sym}.csv`);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8').trim().split('\n').slice(1).map((l) => { const [date, u] = l.split(','); return { date, unlocked: Number(u) }; });
};
const loadHistories = () => (existsSync(histDir) ? readdirSync(histDir).filter((f) => f.endsWith('.csv')).sort().map((f) => {
  const sym = f.replace('.csv', '');
  const h = { sym, ...readCsv(join(histDir, f)) };
  return { ...h, unlocked: alignUnlocks(h.dates, readSchedule(sym)) };
}) : []);

// ── Worker ────────────────────────────────────────────────────────────────
function workerMain() {
  const histories = loadHistories();
  parentPort.on('message', (task) => {
    if (task === null) { process.exit(0); }
    if (task.kind === 'cell') parentPort.postMessage({ id: task.cell.id, rows: runCell(task.cell, histories) });
    else {
      const s = SETTINGS.find((x) => x.key === task.setting);
      const cfg = { ...BACKTEST_DEFAULTS, buyerReturn: 0.6, stepDays: 7 };
      const v2 = { ...V2_DEFAULTS, ...(s.v2 || {}) };
      const rows = [];
      // With unlocks: only tokens that have a calendar, priced with the unlock drift.
      for (const h of task.unlocks ? histories.filter((x) => x.unlocked) : histories) {
        for (const l of backtestToken(task.unlocks ? h : { ...h, unlocked: null }, { shape: task.shape, model: s.model }, cfg, v2).loans) rows.push({ month: h.dates[l.t0].slice(0, 7), sym: h.sym, loss: l.lenderLossPct, ltv: l.ltv, liquidated: l.liquidated ? 1 : 0, forced: l.reason === 'health' ? 1 : 0, beatsOtc: l.borrowerAdvantage >= 0 ? 1 : 0 });
      }
      parentPort.postMessage({ id: task.id, history: { setting: task.setting, shape: task.shape, unlocks: !!task.unlocks, rows } });
    }
  });
}

// ── Main ──────────────────────────────────────────────────────────────────
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const pct = (x, d = 1) => (x == null || Number.isNaN(x) ? '—' : `${(100 * x).toFixed(d)}%`);

async function main() {
  const started = Date.now();
  const histories = loadHistories();
  if (!histories.length) throw new Error('No history: run node bin/fetch-binance.js first.');
  const cells = buildCells({ paths: arg('paths', 64) });
  const tasks = [
    ...SETTINGS.flatMap((s) => Object.keys(STREAM_SHAPES).flatMap((shape) => [false, true].map((unlocks) => ({ kind: 'history', setting: s.key, shape, unlocks })))),
    ...cells.map((cell) => ({ kind: 'cell', cell }))
  ].map((t, id) => ({ ...t, id }));
  const nWorkers = arg('workers', Math.max(1, availableParallelism() - 1));
  console.log(`${cells.length} cells (${cells.filter((c) => c.design === 'factorial').length} factorial, ${cells.filter((c) => c.design === 'covering').length} covering, ${cells.filter((c) => c.design === 'timing').length} timing), ${tasks.length} tasks on ${nWorkers} workers`);

  const rows = [];
  const history = [];
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    let live = nWorkers;
    for (let w = 0; w < nWorkers; w++) {
      const worker = new Worker(fileURLToPath(import.meta.url));
      const feed = () => worker.postMessage(next < tasks.length ? tasks[next++] : null);
      worker.on('message', (m) => {
        if (m.rows) rows.push(...m.rows);
        if (m.history) history.push(m.history);
        if (++done % 50 === 0) process.stdout.write(`\r${done}/${tasks.length}`);
        feed();
      });
      worker.on('error', reject);
      worker.on('exit', () => { if (--live === 0) resolve(); });
      feed();
    }
  });
  console.log(`\r${done}/${tasks.length} tasks in ${((Date.now() - started) / 1000).toFixed(0)} s`);

  const cellById = new Map(cells.map((c) => [c.id, c]));
  const shapes = Object.keys(STREAM_SHAPES);
  const sel = (f) => rows.filter((r) => f(cellById.get(r.cell), r));
  const results = { generated: new Date().toISOString(), accept: ACCEPT, cells: cells.length, loans: rows.length, settings: {} };

  for (const s of SETTINGS) {
    results.settings[s.key] = {};
    for (const shape of shapes) {
      const mine = (c, r) => r.setting === s.key && c.shape === shape;
      const all = lossStats(sel(mine));
      const realistic = lossStats(sel((c, r) => mine(c, r) && c.family === 'bootstrap'));
      const hist = history.find((h) => h.setting === s.key && h.shape === shape && !h.unlocks).rows;
      const histStats = lossStats(hist);
      const realisticAll = lossStats([...sel((c, r) => mine(c, r) && c.family === 'bootstrap'), ...hist]);
      const backstop = realisticAll.p99;
      const byMonth = new Map();
      for (const r of hist) (byMonth.get(r.month) || byMonth.set(r.month, []).get(r.month)).push(r);
      const cohort = (b) => {
        let worst = { month: null, loss: 0 };
        for (const [m, rs] of byMonth) {
          if (new Set(rs.map((r) => r.sym)).size < ACCEPT.cohortMinTokens) continue;
          const loss = rs.reduce((a, r) => a + Math.max(0, r.loss - b), 0) / rs.length;
          if (loss > worst.loss || !worst.month) worst = { month: m, loss };
        }
        return worst;
      };
      const raw = cohort(0), after = cohort(backstop);
      const seniorFor = (b, month) => waterfall(month + ACCEPT.pool.concentration * Math.max(0, all.max - b), { insurance: ACCEPT.pool.insurance, junior: ACCEPT.pool.junior });
      const poolUnbacked = raw.loss + ACCEPT.pool.concentration * all.max;
      const poolBacked = after.loss + ACCEPT.pool.concentration * Math.max(0, all.max - backstop);
      const unbacked = {
        realistic: realistic.lossMean <= ACCEPT.unbacked.meanLoss && realistic.p99 <= ACCEPT.unbacked.p99,
        history: histStats.lossMean <= ACCEPT.unbacked.meanLoss && histStats.p99 <= ACCEPT.unbacked.p99,
        cohorts: raw.loss <= ACCEPT.cohortWorstMean,
        seniors: seniorFor(0, raw.loss).senior === 0,
        borrowers: histStats.forced <= ACCEPT.maxLiquidatedHistory
      };
      const backed = { cohorts: after.loss <= ACCEPT.cohortWorstMean, seniors: seniorFor(backstop, after.loss).senior === 0, borrowers: histStats.forced <= ACCEPT.maxLiquidatedHistory };
      const checks = { unbacked, backed };
      const byDesign = Object.fromEntries(['factorial', 'covering', 'timing'].map((d) => [d, lossStats(sel((c, r) => mine(c, r) && c.design === d))]));
      const byFamily = Object.fromEntries(FACTORS.family.map((f) => [f, lossStats(sel((c, r) => mine(c, r) && c.family === f && c.design !== 'timing'))]));
      results.settings[s.key][shape] = { all, realistic, realisticAll, history: histStats, byDesign, byFamily, backstop, worstMonth: raw.month, worstMonthLoss: raw.loss, worstMonthAfter: after.loss, poolUnbacked, poolBacked, checks, passUnbacked: Object.values(unbacked).every(Boolean), passBacked: Object.values(backed).every(Boolean) };
    }
  }

  // Unlock drift on the real histories: the tokens with a calendar, without vs with the drift.
  const withUnlocks = histories.filter((h) => h.unlocked).map((h) => h.sym);
  results.unlockTokens = withUnlocks;
  results.unlocks = {};
  for (const s of SETTINGS) for (const shape of shapes) {
    const w = history.find((h) => h.setting === s.key && h.shape === shape && h.unlocks).rows;
    const wo = history.find((h) => h.setting === s.key && h.shape === shape && !h.unlocks).rows.filter((r) => withUnlocks.includes(r.sym));
    results.unlocks[`${s.key}|${shape}`] = { without: lossStats(wo), with: lossStats(w) };
  }

  // Timing: the worst loss for each gap size at each week of the loan, per setting and shape.
  const timing = {};
  for (const s of SETTINGS) for (const shape of shapes) for (const sev of [0.3, 0.5, 0.8, 0.95]) {
    const rs = sel((c, r) => c.design === 'timing' && r.setting === s.key && c.shape === shape && c.severity === sev);
    const worst = rs.reduce((m, r) => (r.loss > m.loss ? { loss: r.loss, day: cellById.get(r.cell).shockDay } : m), { loss: 0, day: null });
    (timing[`${s.key}|${shape}`] ||= {})[sev] = { worst: worst.loss, worstDay: worst.day, mean: rs.reduce((a, r) => a + r.loss, 0) / (rs.length || 1), lossShare: rs.filter((r) => r.loss > 0).length / (rs.length || 1) };
  }
  results.timing = timing;
  writeFileSync(join(here, '..', 'data', 'stress.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(here, '..', 'data', 'STRESS.md'), report(results, cells, rows.length, histories.length, ((Date.now() - started) / 1000).toFixed(0)));
  console.log(readFileSync(join(here, '..', 'data', 'STRESS.md'), 'utf8').split('\n').slice(0, 60).join('\n'));
}

function report(R, cells, nLoans, nTokens, secs) {
  const shapes = Object.keys(STREAM_SHAPES);
  const L = [];
  const cover = coveringArray(Object.values(FACTORS).map((x) => x.length), 3).length;
  L.push('# Stress test', '');
  L.push(`Generated ${R.generated} by \`node bin/stress.js\` in ${secs} s: ${cells.length} cells, ${nLoans.toLocaleString('en-US')} simulated loans, plus every setting replayed on ${nTokens} real token histories.`, '');
  L.push('## Design', '');
  L.push('Every path is played under every lending setting, so settings are compared on identical paths. Borrowers are adversarial: they never cure and walk away whenever the stream is worth less than the debt. Losses are a share of the loan principal, before any backstop unless stated.', '');
  L.push(`- **Factorial**: every price-path family × stream shape × shock size (${FACTORS.family.length} × ${shapes.length} × ${FACTORS.severity.length}), other factors at baseline (σ 100%, full borrow, position = 0.2 days of volume, buyers want 60%/yr, clean oracle, 15% APR).`);
  L.push(`- **Covering array**: ${cover} cells in which every combination of levels of any three of the nine factors appears at least once (${Object.entries(FACTORS).map(([k, v]) => `${k} ${v.length}`).join(', ')}; a full factorial would be ${Object.values(FACTORS).reduce((a, v) => a * v.length, 1).toLocaleString('en-US')} cells).`);
  L.push('- **Timing**: one overnight gap of 30%, 50%, 80% or 95% on every week of the loan year, and on the cliff and maturity days, for every shape.');
  L.push('- **History**: every setting replayed on real Binance daily history, a loan every 7 days, grouped by calendar month of origination to see correlated crashes (all tokens falling together).', '');
  L.push('Families: `gbm` (nothing happens), `volBurst` (σ ×2.5 after origination), `jumps` (Poisson drops), `gap` (one overnight drop on a random day), `bleed` (slow decline over the year), `vShape` (crash and recovery), `pumpDump` (+150% then a crash), `regime` (σ ×3 and −100%/yr drift from a random day), `bootstrap` (30-day blocks of real returns from the 31 tokens). In every crash family volume falls to 30%.', '');
  L.push('## Acceptance criteria', '');
  L.push(`- **Unbacked**: no project backstop. On realistic paths (bootstrap of real returns, and the real histories) mean loss ≤ ${pct(ACCEPT.unbacked.meanLoss)} and worst 1% ≤ ${pct(ACCEPT.unbacked.p99, 0)}; the worst real calendar month of originations (at least ${ACCEPT.cohortMinTokens} tokens) loses ≤ ${pct(ACCEPT.cohortWorstMean, 0)} on average.`);
  L.push(`- **Backed**: the project commits first-loss B per loan = the worst 1% realistic loss. After B, the worst real month loses ≤ ${pct(ACCEPT.cohortWorstMean, 0)} on average.`);
  L.push(`- **Seniors never lose** (both regimes): even if every loan in the pool takes the worst real month AND one token at the ${pct(ACCEPT.pool.concentration, 0)} concentration cap takes the worst loss seen anywhere in the grid, at once, junior (${pct(ACCEPT.pool.junior, 0)} of the pool) and insurance (${pct(ACCEPT.pool.insurance, 0)}) absorb it all.`);
  L.push('- **Borrowers**: in both regimes, at most 25% of loans are force-liquidated on health on the real histories (walking away at maturity is the borrower\'s choice and is not counted).');
  L.push('- **Invariants**: every simulated loan satisfies the settlement invariants (checked inline; a breach aborts the run). The theorems themselves are in `test/proofs.test.js`.', '');
  L.push('Revised once after the first run, for these reasons:', '');
  for (const r of REVISIONS) L.push(`- ${r}`);
  L.push('');
  L.push('## Verdict', '');
  L.push('| Setting | Shape | Avg LTV | Forced liquidations (history) | Realistic: mean / worst 1% | History: mean / worst 1% | Worst month (≥5 tokens) | Unbacked | Backstop B | Worst month after B | Backed | Pool loss for seniors (unbacked → backed) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of SETTINGS) for (const shape of shapes) {
    const r = R.settings[s.key][shape];
    const v = (b) => (b ? '**PASS**' : 'FAIL');
    L.push(`| ${s.label} | ${shape} | ${pct(r.history.ltv)} | ${pct(r.history.forced)} | ${pct(r.realistic.lossMean, 2)} / ${pct(r.realistic.p99)} | ${pct(r.history.lossMean, 2)} / ${pct(r.history.p99)} | ${r.worstMonth ?? '—'}: ${pct(r.worstMonthLoss, 2)} | ${v(r.passUnbacked)} | ${pct(r.backstop)} | ${pct(r.worstMonthAfter, 2)} | ${v(r.passBacked)} | ${pct(r.poolUnbacked)} → ${pct(r.poolBacked)} |`);
  }
  L.push('', 'Backstop B is first loss per loan the project commits (a buyback, or treasury tokens or stablecoins in escrow), as a share of principal. Pool loss is what junior (15%) and insurance (2%) must absorb in the combined worst case; seniors lose only above 17%.', '');
  L.push('## Every design, every setting', '');
  L.push('| Setting | Shape | Design | Loans | Avg LTV | Liquidated | Forced | Loans with a loss | Mean loss | Worst 5% | Worst 1% | Worst 0.1% | Worst |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const s of SETTINGS) for (const shape of shapes) {
    const r = R.settings[s.key][shape];
    for (const [d, x] of [...Object.entries(r.byDesign), ['history', r.history]]) {
      L.push(`| ${s.label} | ${shape} | ${d} | ${x.n} | ${pct(x.ltv)} | ${pct(x.liquidated)} | ${pct(x.forced)} | ${pct(x.lossShare)} | ${pct(x.lossMean, 2)} | ${pct(x.p95)} | ${pct(x.p99)} | ${pct(x.p999)} | ${pct(x.max)} |`);
    }
  }
  L.push('', '## By price-path family (factorial and covering cells)', '');
  L.push(`| Setting | Shape | ${FACTORS.family.join(' | ')} |`, `| --- | --- | ${FACTORS.family.map(() => '---').join(' | ')} |`);
  for (const s of SETTINGS) for (const shape of shapes) {
    const r = R.settings[s.key][shape];
    L.push(`| ${s.label} | ${shape} | ${FACTORS.family.map((f) => `${pct(r.byFamily[f].lossMean, 2)} / ${pct(r.byFamily[f].max, 0)}`).join(' | ')} |`);
  }
  L.push('', 'Each entry: mean loss / worst loss.', '');
  L.push('## Gap timing: worst loss from one overnight gap on any week of the loan', '');
  L.push('Each cell has ordinary σ 60% noise around the gap, and the LTV is what each setting lends at that calm σ (v2 lends up to about 40% here, far above its 14–19% on real histories), so a loss is the gap plus the noise at the LTV actually lent. Gaps are outside every setting\'s diffusion model: this table is what the backstop, insurance and junior tranche are for.', '');
  L.push('| Setting | Shape | −30% | −50% | −80% | −95% |', '| --- | --- | --- | --- | --- | --- |');
  for (const s of SETTINGS) for (const shape of shapes) {
    const t = R.timing[`${s.key}|${shape}`];
    L.push(`| ${s.label} | ${shape} | ${[0.3, 0.5, 0.8, 0.95].map((v) => `${pct(t[v].worst)}${t[v].worstDay != null && t[v].worst > 0 ? ` (day ${t[v].worstDay})` : ''}`).join(' | ')} |`);
  }
  if (R.unlockTokens?.length) {
    L.push('', '## Unlock calendars on the real histories', '');
    L.push(`The ${R.unlockTokens.length} tokens with a documented unlock schedule (DefiLlama emissions dataset: ${R.unlockTokens.join(', ')}), replayed without and with the unlock drift (price expected to fall by half the share of circulating supply unlocking within 30 days of each delivery).`, '');
    L.push('| Setting | Shape | Avg LTV | Forced liquidations | Mean loss | Worst 1% | Worst |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const s of SETTINGS) for (const shape of shapes) {
      const u = R.unlocks[`${s.key}|${shape}`];
      const ab = (f, d = 1) => `${pct(f(u.without), d)} → ${pct(f(u.with), d)}`;
      L.push(`| ${s.label} | ${shape} | ${ab((x) => x.ltv)} | ${ab((x) => x.forced)} | ${ab((x) => x.lossMean, 2)} | ${ab((x) => x.p99)} | ${ab((x) => x.max)} |`);
    }
  }
  L.push('', '## What this does not cover', '');
  L.push('- Unlock drift in the synthetic families: they have no unlock calendar; the drift is tested on the real histories above.');
  L.push('- Intraday paths: daily closes stand in for the oracle\'s time-weighted price.');
  L.push('- Real borrower behaviour: borrowers here never cure, which overstates liquidations.');
  L.push('- Partner buyback at better than auction prices: the backstop is modelled as cash first loss only.');
  return L.join('\n') + '\n';
}

if (!isMainThread) workerMain();
else if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
