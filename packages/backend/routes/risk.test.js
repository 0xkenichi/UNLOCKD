// GET /api/risk/tokens[/:address] — shape of what the Borrow page reads. The snapshot file is
// built by the risk engine's own producer from a recorded CoinGecko response, so the endpoint
// is tested against what `npm run refresh` actually writes. No network.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';

const require = createRequire(import.meta.url);
const createRiskRouter = require('./risk.js');
const { createRiskSnapshotStore } = require('../lib/RiskSnapshotService.js');

const riskDir = new URL('../../risk/', import.meta.url);
const ARB_ONE = '0x912ce59144191c1204e64559fe8253a0e49e6548';

let dir;
let base;
let server;

function serve(file) {
  const app = express();
  app.use('/api/risk', createRiskRouter(createRiskSnapshotStore({ file })));
  return new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
}

beforeAll(async () => {
  const { dailyRowsFromMarketChart, assessToken } = await import(new URL('src/ingest.js', riskDir).href);
  const read = (name) => JSON.parse(readFileSync(new URL(`test/fixtures/${name}`, riskDir), 'utf8'));
  const { snapshot } = assessToken({
    token: { coingeckoId: 'arbitrum', rank: 2, rankBasis: 'assumed' },
    coin: read('coingecko-arbitrum-coin.json'),
    rows: dailyRowsFromMarketChart(read('coingecko-arbitrum-market_chart.json')),
    source: { provider: 'CoinGecko', endpoint: '/coins/arbitrum/market_chart?vs_currency=usd&days=365&interval=daily', fetchedAt: '2026-10-22T12:06:10.000Z' },
    now: new Date('2026-10-22T12:10:00Z'),
    policy: { paths: 400, stressPaths: 150, validationPaths: 800, horizonsYears: [1] }
  });
  dir = mkdtempSync(join(tmpdir(), 'risk-route-'));
  writeFileSync(join(dir, 'snapshots.json'), JSON.stringify({ generatedAt: '2026-10-22T12:10:00.000Z', source: { provider: 'CoinGecko', api: 'https://api.coingecko.com/api/v3', days: 365 }, tokens: [snapshot], errors: [] }));
  server = await serve(join(dir, 'snapshots.json'));
  base = `http://127.0.0.1:${server.address().port}/api/risk`;
});

afterAll(() => {
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/risk/tokens/:address', () => {
  it('returns the snapshot for any listed address, case-insensitively for EVM', async () => {
    const res = await fetch(`${base}/tokens/${ARB_ONE.toUpperCase().replace('0X', '0x')}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.generatedAt).toBe('2026-10-22T12:10:00.000Z');
    const s = body.snapshot;
    expect(s).toMatchObject({
      symbol: 'ARB',
      coingeckoId: 'arbitrum',
      dataFrom: '2025-10-23',
      dataDate: '2026-10-22',
      observations: 364,
      source: { provider: 'CoinGecko' },
      calibration: { rank: 2, rankBasis: 'assumed', dataDate: '2026-10-22' },
      monitor: { status: 'ok' },
      unlocks: { source: null, events: [] }
    });
    expect(s.addresses).toContainEqual({ platform: 'arbitrum-one', address: ARB_ONE });
    expect(s.spotUsd).toBeGreaterThan(0);
    expect(s.advUsd).toBeGreaterThan(0);
    for (const k of ['total', 'ewma', 'd30', 'd90', 'forBorrowers']) expect(s.volatility[k]).toBeGreaterThan(0);
    expect(Number.isInteger(s.calibration.omegaBps)).toBe(true);
    expect(Number.isInteger(s.calibration.maxBorrowUsd)).toBe(true);
    expect(typeof s.calibration.validated).toBe('boolean');
    expect(Array.isArray(s.monitor.alerts)).toBe(true);

    const eth = await fetch(`${base}/tokens/0xb50721bcf8d664c30412cfbc6cf7a15145234ad1`).then((r) => r.json());
    expect(eth.snapshot.symbol).toBe('ARB');
  });

  it('404s for a token without a snapshot and 400s for something that is not an address', async () => {
    const missing = await fetch(`${base}/tokens/0x${'1'.repeat(40)}`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ ok: false, error: 'No risk snapshot for this token' });
    const bad = await fetch(`${base}/tokens/not-an-address`);
    expect(bad.status).toBe(400);
    expect((await bad.json()).ok).toBe(false);
  });
});

describe('GET /api/risk/tokens', () => {
  it('lists tokens with their data date', async () => {
    const body = await fetch(`${base}/tokens`).then((r) => r.json());
    expect(body.ok).toBe(true);
    expect(body.source.provider).toBe('CoinGecko');
    expect(body.tokens).toEqual([expect.objectContaining({ symbol: 'ARB', coingeckoId: 'arbitrum', dataDate: '2026-10-22', monitor: 'ok' })]);
  });

  it('503s when the refresh has never run', async () => {
    const s = await serve(join(dir, 'missing.json'));
    const url = `http://127.0.0.1:${s.address().port}/api/risk`;
    try {
      expect((await fetch(`${url}/tokens`)).status).toBe(503);
      expect((await fetch(`${url}/tokens/${ARB_ONE}`)).status).toBe(503);
    } finally {
      s.close();
    }
  });
});
