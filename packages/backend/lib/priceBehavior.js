// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
/**
 * Price-behavior service: spot price, ATH/ATL, drawdown and range metrics.
 * Used by the agent and /api/price-behavior. ATH/ATL can come from oracles
 * (Chainlink Historical, Pyth Benchmarks), indexer, or env/cache (MVP).
 * @see docs/ORACLES_AND_PRICE_BEHAVIOR_AGENT.md
 */

const BPS = 10000;

const defaultLookbackMonths = 12;

/**
 * Get ATH/ATL for a symbol (MVP: env PRICE_BEHAVIOR_<SYMBOL>_ATH and _ATL, or stub).
 * @param {string} symbol - Token symbol (e.g. BIO, SOL)
 * @returns {{ ath: number | null, atl: number | null, source: string }}
 */
function getAthAtlFromEnv(symbol) {
  if (!symbol || typeof symbol !== 'string') return { ath: null, atl: null, source: 'none' };
  const key = symbol.toUpperCase().replace(/\W/g, '');
  const ath = process.env[`PRICE_BEHAVIOR_${key}_ATH`];
  const atl = process.env[`PRICE_BEHAVIOR_${key}_ATL`];
  const athNum = ath != null ? Number(ath) : null;
  const atlNum = atl != null ? Number(atl) : null;
  if (athNum != null && atlNum != null && athNum >= atlNum && atlNum > 0) {
    return { ath: athNum, atl: atlNum, source: 'env' };
  }
  return { ath: athNum, atl: atlNum, source: ath != null || atl != null ? 'env_partial' : 'none' };
}

/**
 * Stub spot price for a symbol (MVP). Replace with Chainlink/Pyth or contract read.
 * @param {string} symbol
 * @param {number} [chainId]
 * @returns {{ price: number | null, source: string }}
 */
function getSpotPriceStub(symbol, chainId) {
  const key = (symbol || '').toUpperCase().replace(/\W/g, '');
  const envPrice = process.env[`PRICE_BEHAVIOR_${key}_PRICE`];
  if (envPrice != null) {
    const p = Number(envPrice);
    if (Number.isFinite(p) && p > 0) return { price: p, source: 'env' };
  }
  return { price: null, source: 'none' };
}

/**
 * Compute drawdown from ATH and range ratio (ATH-ATL)/mid.
 * @param {number} price
 * @param {number} ath
 * @param {number} atl
 * @returns {{ drawdownBps: number, rangeRatioBps: number }}
 */
function computeMetrics(price, ath, atl) {
  let drawdownBps = 0;
  if (ath > 0 && price <= ath) {
    drawdownBps = Math.round(((ath - price) / ath) * BPS);
  }
  const mid = (ath + atl) / 2;
  const rangeRatioBps = mid > 0 ? Math.round(((ath - atl) / mid) * BPS) : 0;
  return { drawdownBps, rangeRatioBps };
}

/**
 * Suggest risk tier / LTV message from drawdown and range.
 * @param {number} drawdownBps
 * @param {number} rangeRatioBps
 * @returns {string}
 */
function suggestTier(drawdownBps, rangeRatioBps) {
  if (drawdownBps >= 5000) return 'Use conservative LTV; collateral is well below all-time high.';
  if (drawdownBps >= 3000) return 'Consider conservative LTV; meaningful drawdown from ATH.';
  if (rangeRatioBps >= 8000) return 'High historical range; volatility adjustment may reduce max borrow.';
  if (drawdownBps >= 1000 || rangeRatioBps >= 5000) return 'Moderate drawdown or range; standard risk tier.';
  return 'Price behavior suggests standard LTV tier.';
}

/**
 * Get price behavior for a token (symbol or address) and optional chain.
 * Used by agent and GET /api/price-behavior.
 * @param {string} tokenOrSymbol - Symbol (e.g. BIO) or token address (EVM)
 * @param {number} [chainId] - EVM chain id (e.g. 8453 for Base)
 * @returns {Promise<{ price: number | null, ath: number | null, atl: number | null, drawdownBps: number, rangeRatioBps: number, source: string, athAtlSource: string, suggestion: string }>}
 */
async function getPriceBehavior(tokenOrSymbol, chainId) {
  const symbol = typeof tokenOrSymbol === 'string' && tokenOrSymbol.length <= 10
    ? tokenOrSymbol
    : null;
  const out = {
    price: null,
    ath: null,
    atl: null,
    drawdownBps: 0,
    rangeRatioBps: 0,
    source: 'none',
    athAtlSource: 'none',
    suggestion: 'Price history not available; use on-chain valuation only.'
  };

  const spot = getSpotPriceStub(symbol || 'UNKNOWN', chainId);
  out.price = spot.price;
  out.source = spot.source;

  const { ath: envAth, atl: envAtl, source: athAtlSource } = getAthAtlFromEnv(symbol || 'UNKNOWN');
  out.ath = envAth;
  out.atl = envAtl;
  out.athAtlSource = athAtlSource;

  // Fallback to Mobula if env is missing
  if (out.ath === null || out.atl === null) {
    const mobulaData = await require('./SovereignDataService').fetchMobulaMarketData(symbol || tokenOrSymbol);
    if (mobulaData) {
      out.ath = mobulaData.ath || out.ath;
      out.atl = mobulaData.atl || out.atl;
      out.price = mobulaData.price || out.price;
      out.athAtlSource = 'Mobula';
    }
  }

  if (out.price != null && out.price > 0 && out.ath != null && out.atl != null && out.ath >= out.atl && out.atl > 0) {
    const { drawdownBps, rangeRatioBps } = computeMetrics(out.price, out.ath, out.atl);
    out.drawdownBps = drawdownBps;
    out.rangeRatioBps = rangeRatioBps;
    out.suggestion = suggestTier(drawdownBps, rangeRatioBps);
  }

  return out;
}

module.exports = {
  getPriceBehavior,
  getAthAtlFromEnv,
  getSpotPriceStub,
  computeMetrics,
  suggestTier,
  BPS,
  defaultLookbackMonths
};
