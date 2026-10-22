#!/usr/bin/env node
// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildProfile,
  calibrateToken,
  calibrationReport,
  auditTable,
  monitorToken,
  riskParamsCall,
  FIXTURE_SPECS,
  fixtureHistory,
  parseHistoryCsv
} from '../src/index.js';

const USAGE = `vestra-risk <command> [options]

  audit      [--out DIR]                       Calibrate every synthetic fixture token; write reports and a summary.
  calibrate  --csv FILE --symbol SYM [--rank N] [--circulating N] [--unlocks FILE.json] [--out FILE.md] [--json FILE]
             CSV columns: date,price,volume_usd (daily, oldest first). Unlocks: [{"day": 180, "amount": 1000000}], days from the last row.
  monitor    --csv FILE --snapshot FILE.json [--token 0x…]
             Snapshot = the "snapshot" object written by calibrate --json.
`;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] == null ? true : argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

export function loadHistoryCsv(file, { symbol, circulating = 0, unlocks = [] } = {}) {
  const { prices, volumesUsd } = parseHistoryCsv(readFileSync(file, 'utf8'));
  return { symbol, prices, volumesUsd, unlocks, circulating };
}

function snapshotOf(c, profile) {
  return {
    symbol: c.symbol,
    calibratedAt: new Date().toISOString(),
    spot: profile.spot,
    impactVol: profile.impactVol,
    advUsd: profile.advUsd,
    omegaBps: c.recommendation.omegaBps
  };
}

const a = args(process.argv.slice(2));
const cmd = a._[0];

if (cmd === 'audit') {
  const dir = a.out || 'out';
  mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const [symbol, spec] of Object.entries(FIXTURE_SPECS)) {
    const profile = buildProfile(fixtureHistory(symbol));
    const c = calibrateToken(profile, { rank: spec.rank });
    rows.push(c);
    writeFileSync(join(dir, `${symbol}.md`), calibrationReport(c, { source: `synthetic fixture — ${spec.description}` }));
    process.stderr.write(`${symbol}: Ω ${(c.recommendation.omegaBps / 100).toFixed(1)}%, validated ${c.validated}\n`);
  }
  const table = auditTable(rows);
  writeFileSync(join(dir, 'AUDIT.md'), `# Calibration audit (synthetic fixtures)\n\n${table}\n`);
  console.log(table);
} else if (cmd === 'calibrate') {
  if (!a.csv || !a.symbol) throw new Error(USAGE);
  const history = loadHistoryCsv(a.csv, {
    symbol: a.symbol,
    circulating: Number(a.circulating) || 0,
    unlocks: a.unlocks ? JSON.parse(readFileSync(a.unlocks, 'utf8')) : []
  });
  const profile = buildProfile(history);
  const c = calibrateToken(profile, { rank: Number(a.rank) || 2 });
  const md = calibrationReport(c, { source: a.csv });
  if (a.out) writeFileSync(a.out, md);
  else console.log(md);
  if (a.json) writeFileSync(a.json, JSON.stringify({ calibration: c, snapshot: snapshotOf(c, profile) }, null, 2));
} else if (cmd === 'monitor') {
  if (!a.csv || !a.snapshot) throw new Error(USAGE);
  const snap = JSON.parse(readFileSync(a.snapshot, 'utf8'));
  const snapshot = snap.snapshot || snap;
  const history = loadHistoryCsv(a.csv, { symbol: snapshot.symbol });
  const result = monitorToken(snapshot, history);
  console.log(JSON.stringify({ status: result.status, alerts: result.alerts, telemetry: a.token ? riskParamsCall(a.token, result.market) : undefined }, null, 2));
  process.exitCode = result.status === 'ok' ? 0 : result.status === 'recalibrate' ? 10 : 20;
} else {
  console.log(USAGE);
}
