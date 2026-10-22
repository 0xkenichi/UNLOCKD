// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { useMemo } from 'react';
import { outlookFromPv, rankTermsForLtv } from '../../../../packages/risk/src/analytic.js';
import '../../styles/outlook.css';

const VOLS = [0.5, 1, 1.5];
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const usd = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * What would liquidate this loan, before it is taken. Pure maths on values the page already
 * reads: pv and LTV from ValuationEngine.computeDPV, the amount the borrower chose, and the
 * unlock time. Uses the risk engine's closed forms (packages/risk), which are tested against
 * the contracts and against simulation.
 *
 * The chance of liquidation is shown across a range of volatility. When the risk engine has a
 * snapshot for the token (useRiskSnapshot), its measured volatility adds one row and one
 * figure, labelled with the source and the date of the data.
 */
export default function LiquidationOutlook({ pvUsd, ltvBps, debtUsd, unlockTime, borrowRateBps = 1500, snapshot = null }) {
  const view = useMemo(() => {
    const pv = Number(pvUsd);
    const ltv = Number(ltvBps);
    const unlock = Number(unlockTime);
    if (!(pv > 0) || !(ltv > 0) || !(unlock > 0)) return null;
    const years = Math.max(0, (unlock * 1000 - Date.now()) / (365 * 24 * 3600 * 1000));
    const maxDebt = (pv * ltv) / 10_000;
    const debt = Math.min(Number(debtUsd) > 0 ? Number(debtUsd) : maxDebt, maxDebt);
    if (!(debt > 0) || !(years > 0)) return null;
    const terms = rankTermsForLtv(ltv);
    const base = { pv, liqThresholdBps: terms.liqThresholdBps, discountRateBps: terms.discountRateBps, borrowRateBps, years };
    const at = (d, sigma) => outlookFromPv({ ...base, debt: d, sigma });
    const sigma = Number(snapshot?.volatility?.forBorrowers);
    const measured =
      sigma > 0
        ? {
            sigma,
            probability: at(debt, sigma).probability,
            symbol: snapshot.symbol,
            provider: snapshot.source?.provider || 'the risk engine',
            dataFrom: snapshot.dataFrom,
            dataDate: snapshot.dataDate,
            ageDays: Math.floor((Date.now() - Date.parse(`${snapshot.dataDate}T00:00:00Z`)) / 86_400_000),
            suspectPrints: snapshot.dataQuality?.suspectReversals?.length || 0,
            alerts: snapshot.monitor?.status && snapshot.monitor.status !== 'ok' ? snapshot.monitor.alerts || [] : []
          }
        : null;
    // Largest debt that keeps the chance under 10% at the measured volatility, else at 100%.
    const safeSigma = measured ? measured.sigma : 1;
    let lo = 0;
    let hi = maxDebt;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid, safeSigma).probability <= 0.1) lo = mid;
      else hi = mid;
    }
    const rows = VOLS.map((s) => ({ sigma: s, probability: at(debt, s).probability }));
    if (measured) rows.push({ sigma: measured.sigma, probability: measured.probability, measured: true });
    rows.sort((a, b) => a.sigma - b.sigma);
    return {
      debt,
      years,
      exact: terms.exact,
      trigger: at(debt, 0),
      rows,
      measured,
      safeSigma,
      safeDebt: lo
    };
  }, [pvUsd, ltvBps, debtUsd, unlockTime, borrowRateBps, snapshot]);

  if (!view) return null;
  const horizon = view.years >= 1 ? `${view.years.toFixed(1)} years` : `${Math.max(1, Math.round(view.years * 12))} months`;
  const m = view.measured;

  return (
    <section className="holo-card lo" aria-labelledby="lo-title">
      <div className="section-head">
        <div>
          <p className="vx-eyebrow">Before you borrow</p>
          <h3 id="lo-title" className="section-title">
            What would liquidate {usd(view.debt)}
          </h3>
        </div>
      </div>

      <div className="lo-figures">
        <div>
          <div className="stat-label">Price fall that triggers it</div>
          <div className="stat-value">{pct(view.trigger.dropToTrigger)}</div>
          <p className="lo-note">
            from today’s valuation price. The trigger moves up about {pct(view.trigger.triggerRisePerYear)} a year,
            because interest (assumed {borrowRateBps / 100}% — the rate floats) grows faster than the time discount unwinds.
          </p>
          {m && (
            <div className="lo-measured-figure">
              <div className="stat-label">Chance at {m.symbol}’s measured volatility</div>
              <div className="stat-value">{pct(m.probability)}</div>
              <p className="lo-note">
                {pct(m.sigma)} a year, measured from {m.provider} daily prices, {m.dataFrom} to {m.dataDate}
                {m.ageDays > 2 ? ` (${m.ageDays} days old)` : ''}. Past volatility, not a forecast.
                {m.suspectPrints > 0 &&
                  ` The source’s history has ${m.suspectPrints} suspected bad print${m.suspectPrints > 1 ? 's' : ''}, so this may overstate it.`}
              </p>
              {m.alerts.length > 0 && (
                <p className="lo-note lo-alert">Risk monitor: {m.alerts.map((a) => a.message).join(' ')}</p>
              )}
            </div>
          )}
        </div>
        <table className="lo-table">
          <caption className="stat-label">Chance of liquidation before unlock ({horizon})</caption>
          <thead>
            <tr>
              <th scope="col">If the token’s volatility is</th>
              <th scope="col">Chance</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.measured ? 'measured' : r.sigma} className={r.measured ? 'lo-measured' : undefined}>
                <td>
                  {pct(r.sigma)} a year{r.measured && ` — ${m.symbol}, measured to ${m.dataDate}`}
                </td>
                <td className="mono">{pct(r.probability)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="lo-note">
        {m ? `At ${m.symbol}’s measured ${pct(view.safeSigma)} volatility` : 'At 100% volatility'}, borrowing{' '}
        {usd(view.safeDebt)} or less keeps the chance under 10%.
        {!m && ' This token’s volatility has not been measured yet, so the chance is shown across a range.'} A liquidation sells the
        stream by auction; anything above the debt comes back to you, but the stream and its upside do not.
        {!view.exact && ' The LTV here is capped below its rank’s, so the most cautious liquidation threshold is assumed.'}
      </p>
    </section>
  );
}
