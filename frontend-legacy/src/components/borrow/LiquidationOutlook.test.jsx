// LiquidationOutlook with and without a risk snapshot. Run with `npm test`.
// The snapshot is built by the risk engine's own producer from a recorded CoinGecko response,
// so the component is tested against the fields the backend actually serves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import LiquidationOutlook from './LiquidationOutlook.jsx';
import { outlookFromPv, rankTermsForLtv } from '../../../../packages/risk/src/analytic.js';
import { dailyRowsFromMarketChart, assessToken } from '../../../../packages/risk/src/ingest.js';
import chart from '../../../../packages/risk/test/fixtures/coingecko-arbitrum-market_chart.json';
import coin from '../../../../packages/risk/test/fixtures/coingecko-arbitrum-coin.json';

const YEAR_MS = 365 * 24 * 3600 * 1000;
const props = { pvUsd: 10_000, ltvBps: 3500, debtUsd: 2_500, unlockTime: Math.floor((Date.now() + YEAR_MS) / 1000) };

const { snapshot } = assessToken({
  token: { coingeckoId: 'arbitrum', rank: 2, rankBasis: 'assumed' },
  coin,
  rows: dailyRowsFromMarketChart(chart),
  source: { provider: 'CoinGecko', endpoint: '/coins/arbitrum/market_chart', fetchedAt: '2026-10-22T12:06:10.000Z' },
  now: new Date('2026-10-22T12:10:00Z'),
  policy: { paths: 300, stressPaths: 100, validationPaths: 600, horizonsYears: [1] }
});

const render = (extra) => renderToStaticMarkup(<LiquidationOutlook {...props} {...extra} />);
const rows = (html) => [...html.matchAll(/<tr( class="lo-measured")?><td>(.*?)<\/td><td class="mono">(\d+%)<\/td><\/tr>/g)].map((m) => ({ measured: Boolean(m[1]), label: m[2], chance: m[3] }));
const expected = (sigma) => {
  const terms = rankTermsForLtv(3500);
  const p = outlookFromPv({ pv: 10_000, debt: 2_500, liqThresholdBps: terms.liqThresholdBps, discountRateBps: terms.discountRateBps, borrowRateBps: 1500, years: 1, sigma }).probability;
  return `${Math.round(p * 100)}%`;
};

test('without a snapshot: the range only, and it says volatility is not measured', () => {
  const html = render();
  assert.deepEqual(rows(html).map((r) => r.label), ['50% a year', '100% a year', '150% a year']);
  assert.ok(rows(html).every((r) => !r.measured));
  assert.match(html, /At 100% volatility, borrowing/);
  assert.match(html, /has not been measured yet/);
  assert.doesNotMatch(html, /measured volatility|CoinGecko/);
  assert.equal(render({ snapshot: { symbol: 'X', volatility: {} } }), html); // no σ in it → same as none
});

test('with a snapshot: one measured row in order, one figure, labelled with source and data date', () => {
  const sigma = snapshot.volatility.forBorrowers;
  const pct = `${Math.round(sigma * 100)}%`;
  const html = render({ snapshot });
  const r = rows(html);
  assert.equal(r.length, 4);
  assert.deepEqual(r.map((x) => x.measured), [false, false, true, false]); // σ ≈ 116% sits between 100% and 150%
  assert.equal(r[2].label, `${pct} a year — ARB, measured to 2026-10-22`);
  assert.equal(r[2].chance, expected(sigma));
  assert.equal(r[0].chance, expected(0.5));
  assert.match(html, new RegExp(`Chance at ARB’s measured volatility</div><div class="stat-value">${expected(sigma)}</div>`));
  assert.match(html, new RegExp(`${pct} a year, measured from CoinGecko daily prices, 2025-10-23 to 2026-10-22`));
  assert.match(html, /Past volatility, not a forecast\./);
  assert.match(html, new RegExp(`At ARB’s measured ${pct} volatility, borrowing`));
  assert.doesNotMatch(html, /has not been measured yet|bad print|Risk monitor/);
});

test('data-quality flags, monitor alerts and old data are shown, not hidden', () => {
  const html = render({
    snapshot: {
      ...snapshot,
      dataDate: '2020-01-01',
      dataQuality: { suspectReversals: [{ date: '2019-12-01', move: -0.4, revertedInDays: 1 }, { date: '2019-12-05', move: -0.4, revertedInDays: 1 }] },
      monitor: { status: 'act', alerts: [{ level: 'act', code: 'vol-spike', message: 'Volatility is 1.90× the calibrated level.' }] }
    }
  });
  assert.match(html, /to 2020-01-01 \(\d+ days old\)/);
  assert.match(html, /2 suspected bad prints, so this may overstate it/);
  assert.match(html, /Risk monitor: Volatility is 1\.90× the calibrated level\./);
});

test('nothing renders without a valuation', () => {
  assert.equal(render({ pvUsd: 0, snapshot }), '');
});
