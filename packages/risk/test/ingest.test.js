// Ingestion: a recorded CoinGecko response becomes the daily CSV the CLI reads, and one
// refresh step turns it into the snapshot the backend serves. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dailyRowsFromMarketChart,
  missingDays,
  historyCsv,
  parseHistoryCsv,
  addressesFromCoin,
  unlocksFromDates,
  suspectReversals,
  assessToken,
  snapshotsReport
} from '../src/index.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const chart = fixture('coingecko-arbitrum-market_chart.json');
const coin = fixture('coingecko-arbitrum-coin.json');
const FAST = { paths: 600, stressPaths: 200, validationPaths: 1200, horizonsYears: [0.5, 1] };
const token = { coingeckoId: 'arbitrum', rank: 2, rankBasis: 'assumed' };
const source = { provider: 'CoinGecko', endpoint: '/coins/arbitrum/market_chart?vs_currency=usd&days=365&interval=daily', fetchedAt: '2026-10-22T12:06:10.000Z' };
const now = new Date('2026-10-22T12:10:00Z');

test('the recorded market_chart becomes one row per UTC day, partial day dropped', () => {
  const rows = dailyRowsFromMarketChart(chart);
  assert.equal(chart.prices.length, 366); // 365 midnights + the request-time point
  assert.equal(rows.length, 365);
  assert.equal(rows[0].date, '2025-10-23');
  assert.equal(rows.at(-1).date, '2026-10-22');
  assert.equal(rows.at(-1).price, chart.prices[364][1]); // the 00:00 point, not the 12:06 one
  assert.equal(rows.at(-1).volumeUsd, chart.total_volumes[364][1]);
  assert.equal(missingDays(rows), 0);
  assert.ok(rows.every((r) => r.price > 0 && r.volumeUsd > 0));
});

test('duplicates, missing volumes, gaps and bad input', () => {
  const d = (s) => Date.parse(`${s}T00:00:00Z`);
  const rows = dailyRowsFromMarketChart({
    prices: [[d('2026-01-03'), 3], [d('2026-01-01'), 1], [d('2026-01-01'), 1.5], [d('2026-01-04'), 0], [d('2026-01-03') + 3600_000, 9]],
    total_volumes: [[d('2026-01-01'), 100]]
  });
  assert.deepEqual(rows, [
    { date: '2026-01-01', price: 1.5, volumeUsd: 100 },
    { date: '2026-01-03', price: 3, volumeUsd: 0 }
  ]);
  assert.equal(missingDays(rows), 1);
  assert.throws(() => dailyRowsFromMarketChart({}), /prices/);
  assert.throws(() => dailyRowsFromMarketChart({ prices: [[d('2026-01-01'), 1]] }), /at least 2/);
});

test('CSV round-trips through the parser the CLI uses', () => {
  const rows = dailyRowsFromMarketChart(chart);
  const csv = historyCsv(rows);
  assert.match(csv, /^date,price,volume_usd\n2025-10-23,/);
  const back = parseHistoryCsv(csv);
  assert.deepEqual(back.dates, rows.map((r) => r.date));
  assert.deepEqual(back.prices, rows.map((r) => r.price));
  assert.deepEqual(back.volumesUsd, rows.map((r) => r.volumeUsd));
  assert.deepEqual(parseHistoryCsv('price\n1\n0\nx\n2\n'), { dates: [], prices: [1, 2], volumesUsd: [] });
});

test('addresses come from the coin record: EVM lower-cased, Solana mints as given, blanks skipped', () => {
  const list = addressesFromCoin(coin);
  assert.deepEqual(list.map((a) => a.platform), ['arbitrum-one', 'arbitrum-nova', 'ethereum']);
  assert.ok(list.every((a) => a.address === a.address.toLowerCase() && /^0x[0-9a-f]{40}$/.test(a.address)));
  assert.deepEqual(addressesFromCoin({ platforms: { '': '', solana: ' JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN ', base: '0xABCDEF' } }), [
    { platform: 'solana', address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
    { platform: 'base', address: '0xabcdef' }
  ]);
  assert.deepEqual(addressesFromCoin(null), []);
});

test('dated unlocks become days after the last row; past ones are dropped', () => {
  assert.deepEqual(unlocksFromDates([{ date: '2026-11-21', amount: '5' }, { date: '2026-10-01', amount: 9 }], '2026-10-22'), [{ day: 30, amount: 5 }]);
  assert.deepEqual(unlocksFromDates(undefined, '2026-10-22'), []);
});

test('first run calibrates; the snapshot carries what the endpoint and page need', () => {
  const rows = dailyRowsFromMarketChart(chart);
  const { snapshot: s, calibration, reason } = assessToken({ token, coin, rows, source, now, policy: FAST });
  assert.equal(reason, 'first calibration');
  assert.ok(calibration.recommendation);
  assert.equal(s.symbol, 'ARB');
  assert.equal(s.dataFrom, '2025-10-23');
  assert.equal(s.dataDate, '2026-10-22');
  assert.equal(s.observations, 364);
  assert.deepEqual(s.source, source);
  assert.equal(s.addresses.length, 3);
  assert.equal(s.spotUsd, Number(rows.at(-1).price.toPrecision(6)));
  for (const k of ['total', 'ewma', 'd30', 'd90', 'downside', 'forBorrowers']) assert.ok(s.volatility[k] > 0, k);
  assert.equal(s.volatility.forBorrowers, Math.max(s.volatility.total, s.volatility.ewma));
  assert.ok(s.advUsd > 0);
  assert.equal(s.calibration.rank, 2);
  assert.equal(s.calibration.rankBasis, 'assumed');
  assert.equal(s.calibration.dataDate, '2026-10-22');
  assert.ok(Number.isInteger(s.calibration.omegaBps) && s.calibration.omegaBps >= 0 && s.calibration.omegaBps <= 10_000);
  assert.ok(Number.isInteger(s.calibration.maxBorrowUsd));
  assert.equal(typeof s.calibration.validated, 'boolean');
  assert.equal(s.calibration.basis.impactVol, Math.max(calibration.market.volTotal, calibration.market.volEwma));
  assert.equal(s.monitor.status, 'ok'); // monitored against its own calibration, same data
  assert.deepEqual(s.unlocks.events, []);
  assert.match(s.unlocks.note, /not modelled/);
  assert.deepEqual(s.dataQuality, { suspectReversals: [] });
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(s)));
});

test('later runs keep the calibration until the monitor, its age, the rank or --recalibrate says otherwise', () => {
  const rows = dailyRowsFromMarketChart(chart);
  const first = assessToken({ token, coin, rows, source, now, policy: FAST }).snapshot;

  const kept = assessToken({ token, coin, rows, source, now: new Date('2026-10-23T12:00:00Z'), previous: first, policy: FAST });
  assert.equal(kept.reason, null);
  assert.equal(kept.calibration, null);
  assert.deepEqual(kept.snapshot.calibration, first.calibration);

  const calm = { ...first, calibration: { ...first.calibration, basis: { ...first.calibration.basis, impactVol: first.calibration.basis.impactVol / 2 } } };
  const spiked = assessToken({ token, coin, rows, source, now, previous: calm, policy: FAST });
  assert.equal(spiked.reason, 'monitor: act');
  assert.equal(spiked.snapshot.calibration.triggeredBy[0].code, 'vol-spike');
  assert.equal(spiked.snapshot.monitor.status, 'ok');

  assert.match(assessToken({ token, coin, rows, source, now: new Date('2026-12-01T00:00:00Z'), previous: first, policy: FAST }).reason, /older than 30 days/);
  assert.equal(assessToken({ token: { ...token, rank: 3 }, coin, rows, source, now, previous: first, policy: FAST }).reason, 'rank changed 2 → 3');
  assert.equal(assessToken({ token, coin, rows, source, now, previous: first, policy: FAST, force: true }).reason, 'forced');
});

test('the summary report names the source and the data date for each token', () => {
  const rows = dailyRowsFromMarketChart(chart);
  const s = assessToken({ token, coin, rows, source, now, policy: FAST }).snapshot;
  const md = snapshotsReport({ generatedAt: now.toISOString(), source: { provider: 'CoinGecko', api: 'https://api.coingecko.com/api/v3', days: 365 }, tokens: [s], errors: [{ coingeckoId: 'nope', error: 'HTTP 404', keptFrom: null }] });
  assert.match(md, /CoinGecko public API/);
  assert.match(md, /\| ARB \(`arbitrum`\) \| 2025-10-23 → 2026-10-22 \| 364 \|/);
  assert.match(md, /2 \(assumed\)/);
  assert.match(md, /## Not refreshed\n\n- `nope`: HTTP 404/);
});

test('one-day spikes that revert are flagged as suspected bad prints; real trends are not', () => {
  const day = (i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  const series = (prices) => prices.map((price, i) => ({ date: day(i), price, volumeUsd: 1 }));
  assert.deepEqual(suspectReversals(series([1, 1, 0.5, 1, 1])), [{ date: day(2), move: -0.5, revertedInDays: 1 }]);
  assert.deepEqual(suspectReversals(series([1, 1.6, 1.5, 1.05, 1])).map((x) => x.revertedInDays), [2]);
  assert.deepEqual(suspectReversals(series([1, 0.5, 0.5, 0.5, 0.55])), []); // a crash that holds
  assert.deepEqual(suspectReversals(series([1, 0.85, 1, 0.85, 1])), []); // below the threshold
  assert.deepEqual(suspectReversals(dailyRowsFromMarketChart(chart)), []); // the recorded ARB year
});
