// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
import { describeMarket, unlockOverhang } from './market.js';

/*
 * Layer 5 — keep the maths current. Compare a token's market now with the market its
 * parameters were calibrated on, and say what should happen: nothing, recalibrate, or
 * act now with the guardian's levers (lower Ω, or freeze new credit for up to 7 days).
 * Neither lever can touch open loans.
 */

export const DEFAULT_TRIGGERS = Object.freeze({
  volRise: 1.25, //          EWMA vol 25% above the calibration's vol → recalibrate
  volSpike: 1.75, //         75% above → cut Ω now, then recalibrate
  drawdownSinceCalibration: 0.3,
  liquidityFall: 0.5, //     ADV halved → recalibrate (caps and recoveries depend on it)
  overhangWithin90d: 0.05 // ≥ 5% of supply unlocking within 90 days
});

/**
 * @param {object} snapshot  { calibratedAt, impactVol, advUsd, spot, omegaBps }
 * @param {object} history   current { prices, volumesUsd, unlocks, circulating }
 */
export function monitorToken(snapshot, history, triggers = DEFAULT_TRIGGERS) {
  const m = describeMarket(history);
  const volNow = Math.max(m.volEwma, m.volTotal);
  const alerts = [];
  const volRatio = volNow / snapshot.impactVol;
  if (volRatio >= triggers.volSpike) {
    alerts.push({ level: 'act', code: 'vol-spike', message: `Volatility is ${volRatio.toFixed(2)}× the calibrated level.`, action: 'Guardian: lower Ω now (scale by calibrated σ / current σ), then recalibrate.', suggestedOmegaBps: Math.floor((snapshot.omegaBps * snapshot.impactVol) / volNow) });
  } else if (volRatio >= triggers.volRise) {
    alerts.push({ level: 'recalibrate', code: 'vol-rise', message: `Volatility is ${volRatio.toFixed(2)}× the calibrated level.`, action: 'Recalibrate.' });
  }
  const drawdown = 1 - m.spot / snapshot.spot;
  if (drawdown >= triggers.drawdownSinceCalibration) {
    alerts.push({ level: 'recalibrate', code: 'drawdown', message: `Price is ${(drawdown * 100).toFixed(0)}% below the calibration price.`, action: 'Recalibrate; consider a temporary freeze while it runs.' });
  }
  if (snapshot.advUsd > 0 && m.advUsd / snapshot.advUsd <= triggers.liquidityFall) {
    alerts.push({ level: 'recalibrate', code: 'liquidity', message: `Daily volume is ${((m.advUsd / snapshot.advUsd) * 100).toFixed(0)}% of the calibrated level.`, action: 'Recalibrate the per-loan cap and recoveries.' });
  }
  const overhang = unlockOverhang(history.unlocks, history.circulating, 45, 45);
  if (overhang >= triggers.overhangWithin90d) {
    alerts.push({ level: 'recalibrate', code: 'unlock-overhang', message: `${(overhang * 100).toFixed(1)}% of circulating supply unlocks within 90 days.`, action: 'Recalibrate with the unlock shock; consider a lower Ω for streams maturing near the unlock.' });
  }
  const status = alerts.some((a) => a.level === 'act') ? 'act' : alerts.length ? 'recalibrate' : 'ok';
  return { status, alerts, market: m };
}

/**
 * Arguments for ValuationEngine.updateRiskParams (guardian; emits telemetry, changes nothing).
 * Units: prices in 8-decimal fixed point, vols and premiums in bps, liquidity in whole USD.
 */
export function riskParamsCall(token, market, { lambda = 0.94, tokenPremiumBps = 0, liquidityPremiumBps = 0 } = {}) {
  const bps = (x) => Math.round(x * 10_000);
  return {
    function: 'updateRiskParams(address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)',
    args: [
      token,
      BigInt(Math.round(market.spot * 1e8)).toString(),
      bps(lambda),
      bps(market.vol30d),
      bps(market.vol90d),
      bps(market.volTotal), // no options market for most vesting tokens: model-implied total vol
      Math.round(market.advUsd),
      tokenPremiumBps,
      liquidityPremiumBps
    ]
  };
}
