// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).

const pct = (x, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const usd = (x) => (x ? `$${Math.round(x).toLocaleString('en-US')}` : '—');

/** Markdown report for one calibration. */
export function calibrationReport(c, { generatedAt = new Date().toISOString(), source = 'synthetic fixture' } = {}) {
  const r = c.recommendation;
  const m = c.market;
  const lines = [];
  lines.push(`# ${c.symbol} — risk calibration`, '');
  lines.push(`Generated ${generatedAt}. Data: ${source}. Rank ${c.rank}. Every figure is reproducible from the seed in the policy.`, '');
  lines.push('## Recommendation', '');
  if (!r.newCredit) {
    lines.push(`**No new credit.** No Ω above ${pct(c.policy.minOmegaBps / 1e4)} meets the policy. Guardian: \`updateOmega(token, 0)\`.`, '');
  } else {
    lines.push(`| Lever | Value | Call |`, `|---|---|---|`);
    lines.push(`| Ω | ${pct(r.omegaBps / 1e4)} | guardian \`updateOmega(token, ${r.omegaBps})\` |`);
    lines.push(`| Per-loan value cap | ${usd(r.maxBorrowUsd)} | governor \`setTokenMaxBorrowUsd(token, ${r.maxBorrowUsd}e6)\` |`);
    lines.push('');
    lines.push(`Out-of-sample validation: **${c.validated ? 'passed' : 'FAILED — do not apply'}**.`, '');
    if (r.binding.length) {
      lines.push(`Binding limit: ${r.binding.map((b) => `${b.constraint} (Ω ≤ ${pct(b.omegaBps / 1e4)})`).join('; ')}.`, '');
    } else {
      lines.push('No limit binds at Ω = 100%: the token could carry more credit than its rank allows.', '');
    }
    lines.push(`Were σ per token on chain, this haircut corresponds to σ ≈ ${r.sigmaEquivalentPct}% (the global value is applied to every token today).`, '');
  }

  lines.push('## Market (from the token’s own history)', '');
  lines.push('| Measure | Value |', '|---|---|');
  lines.push(`| Spot | ${m.spot.toPrecision(5)} |`);
  lines.push(`| Volatility 30d / 90d / EWMA | ${pct(m.vol30d, 0)} / ${pct(m.vol90d, 0)} / ${pct(m.volEwma, 0)} |`);
  lines.push(`| Jump-diffusion fit | σ ${pct(m.jumpDiffusion.sigma, 0)}, ${m.jumpDiffusion.lambda.toFixed(1)} jumps/yr, mean ${pct(m.jumpDiffusion.jumpMean, 0)} |`);
  lines.push(`| Total volatility | ${pct(m.volTotal, 0)} |`);
  lines.push(`| Worst 3-day move (1st percentile) | ${pct(Math.exp(m.tail3d1pct) - 1, 0)} |`);
  lines.push(`| Max drawdown in history | ${pct(m.maxDrawdown, 0)} |`);
  lines.push(`| Average daily volume (30d) | ${usd(m.advUsd)} |`);
  lines.push('');

  if (c.validation.length) {
    lines.push('## Lenders, at the recommended Ω (out-of-sample)', '');
    lines.push('| Model | Horizon | Expected loss / yr | Worst-1% loss | Liquidated | Lender return / yr | Pass |', '|---|---|---|---|---|---|---|');
    for (const v of c.validation) {
      lines.push(`| ${v.model} | ${v.years}y | ${pct(v.expectedLossPerYear, 2)} | ${pct(v.cvar99)} | ${pct(v.pLiquidation, 0)} | ${pct(v.lenderNetReturnPerYear)} | ${v.passed ? 'yes' : '**no**'} |`);
    }
    lines.push('');
  }

  lines.push('## Stress', '');
  lines.push('Enforced stresses are scaled to this token’s own history; the uniform library applies the same shocks to every token, for comparison.', '');
  lines.push('| Scenario | Expected loss | Worst-1% loss | Limit |', '|---|---|---|---|');
  for (const s of c.stress) {
    const name = s.scenario.startsWith('uniform') ? `Uniform: ${s.label}` : s.label;
    lines.push(`| ${name} | ${pct(s.expectedLoss)} | ${pct(s.cvar99)} | ${s.enforced ? `≤ ${pct(s.limit, 0)}` : 'reported'} |`);
  }
  const gap = c.stress.find((s) => s.scenario === 'uniform gap-1d');
  if (gap) lines.push('', `An overnight gap is not stopped by any LTV a borrower would accept; the insurance reserve must hold about ${pct(gap.expectedLoss, 0)} of exposure to this token to absorb one.`);
  lines.push('');

  lines.push('## Borrowers', '');
  lines.push('| Horizon | Liquidated at max borrow | Price drop that triggers it | Borrow ≤ this share of max for ≤ 10% / ≤ 25% liquidation risk |', '|---|---|---|---|');
  for (const b of c.borrower) {
    const s = b.safeFractionOfMax;
    lines.push(`| ${b.years}y | ${pct(b.pLiquidationAtMax, 0)} | ${pct(b.dropToTrigger, 0)} | ${pct(s['0.1'], 0)} / ${pct(s['0.25'], 0)} |`);
  }
  lines.push('');
  const costs = c.validation.filter((v) => v.borrowerCostOfLiquidation != null);
  if (costs.length) {
    const worst = Math.max(...costs.map((v) => v.borrowerCostOfLiquidation));
    lines.push(`A liquidation costs the borrower up to ${pct(worst, 0)} of the stream’s market value (what the auction buyer’s discount and price impact take, net of the surplus returned).`, '');
  }
  lines.push('## Assumptions', '');
  lines.push('Floating APR held at the rate model’s kink (15%). Auction buyers require 30%/yr to hold locked tokens and price in the square-root impact of selling them. Borrowers repay at maturity only when the stream is worth more than the debt (loans are non-recourse). A keeper starts liquidations on the day they become possible. Price paths are martingales: no drift up or down is assumed.', '');
  return lines.join('\n');
}

/** One-line-per-token table for the audit command. */
export function auditTable(rows) {
  const lines = ['| Token | Rank | Ω | Validated | Binding | Liquidated at max, 1y | Overnight −80% gap loss | Per-loan cap |', '|---|---|---|---|---|---|---|---|'];
  for (const c of rows) {
    const b1 = c.borrower.find((b) => b.years === 1) || c.borrower[c.borrower.length - 1];
    const gap = c.stress.find((s) => s.scenario === 'uniform gap-1d');
    lines.push(
      `| ${c.symbol} | ${c.rank} | ${pct(c.recommendation.omegaBps / 1e4, 0)} | ${c.validated == null ? '—' : c.validated ? 'yes' : 'NO'} | ${c.recommendation.binding.map((x) => x.constraint).join(', ') || 'none'} | ${pct(b1.pLiquidationAtMax, 0)} | ${pct(gap?.expectedLoss, 0)} | ${usd(c.recommendation.maxBorrowUsd)} |`
    );
  }
  return lines.join('\n');
}

/** Summary of a refresh: each token's calibration with its data source and date. */
export function snapshotsReport(index) {
  const lines = [];
  lines.push('# Per-token risk snapshots', '');
  lines.push(`Generated ${index.generatedAt} by \`npm run refresh\`. Price and volume: ${index.source.provider} public API (\`${index.source.api}\`), daily closes at 00:00 UTC; the partial current day is dropped.`, '');
  lines.push('| Token | Data | Daily returns | Spot | σ total / EWMA | ADV (30d) | Rank | Ω | Per-loan cap | Validated | Calibrated | Monitor |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of index.tokens) {
    const c = s.calibration;
    const alerts = s.monitor.alerts.map((a) => a.code).join(', ');
    lines.push(
      `| ${s.symbol} (\`${s.coingeckoId}\`) | ${s.dataFrom} → ${s.dataDate} | ${s.observations}${s.missingDays ? ` (${s.missingDays} missing)` : ''} | $${s.spotUsd} | ${pct(s.volatility.total, 0)} / ${pct(s.volatility.ewma, 0)} | ${usd(s.advUsd)} | ${c.rank} (${c.rankBasis}) | ${c.newCredit ? pct(c.omegaBps / 1e4) : '0 — no new credit'} | ${usd(c.maxBorrowUsd)} | ${c.validated == null ? '—' : c.validated ? 'yes' : '**NO**'} | ${c.calibratedAt.slice(0, 10)} on data to ${c.dataDate} | ${s.monitor.status}${alerts ? `: ${alerts}` : ''} |`
    );
  }
  lines.push('');
  for (const s of index.tokens) {
    const suspect = s.dataQuality?.suspectReversals || [];
    if (suspect.length) lines.push(`- **${s.symbol} — data quality**: ${suspect.length} suspected bad print(s) kept in the data (${suspect.map((x) => `${x.date} ${pct(x.move, 0)}`).join(', ')}). Its volatility, and so its Ω and cap, may reflect the source rather than the market; check a second source before acting.`);
    lines.push(`- **${s.symbol}**: ${s.addresses.map((a) => `${a.platform} \`${a.address}\``).join(', ') || 'no contract address listed by the source'}. Unlocks: ${s.unlocks.events.length ? `${s.unlocks.events.length} event(s) from ${s.unlocks.source}` : 'not modelled.'}${s.calibration.binding.length ? ` Binding: ${s.calibration.binding.map((b) => b.constraint).join('; ')}.` : ''}`);
  }
  lines.push('');
  if (index.errors?.length) {
    lines.push('## Not refreshed', '');
    for (const e of index.errors) lines.push(`- \`${e.coingeckoId}\`: ${e.error}${e.keptFrom ? ` — serving the snapshot with data to ${e.keptFrom}` : ''}`);
    lines.push('');
  }
  lines.push('## What is measured and what is assumed', '');
  lines.push('- Measured, from each token’s own history: spot, volatility (30d, 90d, EWMA, jump-diffusion total), drawdown, 30-day average daily volume. σ total is the jump-diffusion fit’s total volatility; the Borrow page uses the larger of total and EWMA.');
  lines.push('- Computed by the engine under `DEFAULT_POLICY` and `DEFAULT_ASSUMPTIONS` (see README): Ω, the per-loan cap, validation, monitor alerts. Per-token reports with stresses and borrower outcomes are in `reports/`.');
  lines.push('- Assumed: rank, where the column says “assumed” — the protocol has not assigned these tokens a rank, so rank II is used. Ω and the cap depend on it.');
  lines.push('- Data quality: a move of at least 0.25 in log terms (+28% or −22%) that is three-quarters undone within 2 days is flagged as a suspected bad print. Flagged days are kept, never smoothed: the engine errs toward more volatility, not less.');
  lines.push('- Not modelled: unlock schedules (no keyless source; DefiLlama’s emissions endpoint returns HTTP 402 without a paid key). Add dated unlocks to `tokens.json` to include them.');
  lines.push('- Contract addresses are those CoinGecko lists for the coin. Testnet mock tokens are not mapped to these; the Borrow page shows a measured figure only when the stream’s token address is one listed here.');
  lines.push('');
  return lines.join('\n');
}
