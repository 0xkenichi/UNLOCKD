// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const DEFAULT_HERMES_URL = 'https://hermes.pyth.network';
const DEFAULT_FEED_TTL_MS = 30_000;
const DEFAULT_SYMBOL_TTL_MS = 10 * 60_000;

const DEFAULT_MINT_FEEDS = {
  // wSOL mint -> SOL/USD feed id
  So11111111111111111111111111111111111111112: {
    symbol: 'SOL',
    feedId: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
  }
};

const feedCache = new Map();
const symbolCache = new Map();
const dynamicFeedMap = new Map();

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[pyth] failed to parse SOLANA_PYTH_FEEDS JSON', error?.message || error);
    return null;
  }
};

const buildFeedMap = () => {
  const override = safeJsonParse(process.env.SOLANA_PYTH_FEEDS);
  if (!override || typeof override !== 'object') {
    return { ...DEFAULT_MINT_FEEDS, ...Object.fromEntries(dynamicFeedMap) };
  }
  return { ...DEFAULT_MINT_FEEDS, ...override, ...Object.fromEntries(dynamicFeedMap) };
};

const customFetch = async (url) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Pyth fetch timed out');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchHermesPrice = async (feedId, retries = 3) => {
  if (!feedId) return null;
  const cached = feedCache.get(feedId);
  if (cached && Date.now() - cached.fetchedAt < DEFAULT_FEED_TTL_MS) {
    return cached.value;
  }
  const baseUrl = process.env.SOLANA_PYTH_HERMES_URL || DEFAULT_HERMES_URL;
  const url = `${baseUrl}/v2/updates/price/latest?ids[]=${feedId}&parsed=true`;

  for (let i = 0; i <= retries; i++) {
    try {
      const response = await customFetch(url);
      if (response.status === 429 && i < retries) {
        const waitTime = Math.pow(2, i) * 1000;
        console.warn(`[pyth] rate limited (429). Retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      if (!response.ok) {
        throw new Error(`Hermes error ${response.status}`);
      }
      const data = await response.json();
      const parsed = Array.isArray(data?.parsed) ? data.parsed[0] : null;
      const price = parsed?.price || null;
      const value = price
        ? {
          price: price.price,
          expo: price.expo,
          publishTime: price.publish_time
        }
        : null;
      feedCache.set(feedId, { value, fetchedAt: Date.now() });
      return value;
    } catch (error) {
      if (i === retries) {
        console.warn(`[pyth] price fetch failed for feed ${feedId} after ${retries} retries:`, error.message);
        throw error;
      }
      const waitTime = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  return null;
};

const normalizeSymbol = (symbol) => {
  if (!symbol) return '';
  return symbol.replace(/\0/g, '').trim().toUpperCase();
};

const resolveFeedIdForSymbol = async (symbol) => {
  const normalized = normalizeSymbol(symbol);
  if (!normalized) return null;
  const cached = symbolCache.get(normalized);
  if (cached && Date.now() - cached.fetchedAt < DEFAULT_SYMBOL_TTL_MS) {
    return cached.value;
  }
  const baseUrl = process.env.SOLANA_PYTH_HERMES_URL || DEFAULT_HERMES_URL;
  const queries = [`${normalized}/USD`, normalized];
  for (const query of queries) {
    const url = `${baseUrl}/v2/price_feeds?asset_type=crypto&query=${encodeURIComponent(
      query
    )}`;
    try {
      const response = await customFetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      if (!Array.isArray(data)) continue;
      const match = data.find((item) => {
        const attributes = item?.attributes || {};
        const base = normalizeSymbol(attributes.base || '');
        const quote = normalizeSymbol(attributes.quote_currency || '');
        return base === normalized && quote === 'USD';
      });
      if (match?.id) {
        symbolCache.set(normalized, { value: match.id, fetchedAt: Date.now() });
        return match.id;
      }
    } catch (error) {
      console.warn('[pyth] symbol lookup failed', error?.message || error);
    }
  }
  symbolCache.set(normalized, { value: null, fetchedAt: Date.now() });
  return null;
};

const getPriceForMint = async (mint, symbol) => {
  const feedMap = buildFeedMap();
  let entry = feedMap[mint];
  if (!entry?.feedId && symbol) {
    const resolved = await resolveFeedIdForSymbol(symbol);
    if (resolved) {
      entry = { symbol: normalizeSymbol(symbol), feedId: resolved };
      dynamicFeedMap.set(mint, entry);
    }
  }
  if (!entry?.feedId) {
    return null;
  }
  try {
    return await fetchHermesPrice(entry.feedId);
  } catch (error) {
    console.warn('[pyth] price fetch failed', error?.message || error);
    return null;
  }
};

const getPriceForSymbol = async (symbol) => {
  if (!symbol) return null;
  try {
    const feedId = await resolveFeedIdForSymbol(symbol);
    if (!feedId) {
      console.warn(`[pyth] could not resolve feedId for symbol: ${symbol}`);
      return null;
    }
    return await fetchHermesPrice(feedId);
  } catch (error) {
    console.error(`[pyth] getPriceForSymbol failed for ${symbol}:`, error.message);
    return null;
  }
};

const getFeedMetadata = (mint) => {
  const feedMap = buildFeedMap();
  return feedMap[mint] || null;
};

module.exports = {
  getPriceForMint,
  getPriceForSymbol,
  getFeedMetadata,
  resolveFeedIdForSymbol
};
