// Copyright (c) 2026 Vestra Protocol. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL-1.1).
const { fetch } = require('undici');

const DEFILLAMA_API_URL = 'https://api.llama.fi';
const DEFILLAMA_PRO_API_URL = 'https://pro-api.llama.fi';

class MarketDataService {
  constructor() {
    this.apiKey = process.env.DEFILLAMA_API_KEY || null;
    this.cache = new Map();
    this.cacheTTL = 3600000; // 1 hour
  }

  getApiUrl(path) {
    if (this.apiKey) {
      return `${DEFILLAMA_PRO_API_URL}${path}`;
    }
    return `${DEFILLAMA_API_URL}${path}`;
  }

  async fetchWithCache(path) {
    const cached = this.cache.get(path);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const url = this.getApiUrl(path);
    const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};

    try {
      const resp = await fetch(url, { headers });
      if (!resp.ok) throw new Error(`DefiLlama API error: ${resp.statusText}`);
      const data = await resp.json();
      this.cache.set(path, { data, timestamp: Date.now() });
      return data;
    } catch (err) {
      console.error(`[MarketDataService] Error fetching ${path}:`, err.message);
      return cached ? cached.data : null;
    }
  }

  /**
   * Get historical TVL of DeFi on all chains
   */
  async getGlobalTVL() {
    return this.fetchWithCache('/v2/historicalChainTvl');
  }

  /**
   * Get historical TVL of a protocol and breakdowns by token and chain
   */
  async getProtocolTVL(protocolSlug) {
    return this.fetchWithCache(`/protocol/${protocolSlug}`);
  }

  /**
   * List all protocols on defillama
   */
  async getProtocols() {
    return this.fetchWithCache('/protocols');
  }

  /**
   * Get current TVL of all chains
   */
  async getChains() {
    return this.fetchWithCache('/v2/chains');
  }

  /**
   * PRO ONLY: Get protocol inflows/outflows
   */
  async getInflows(protocolSlug, timestamp) {
    if (!this.apiKey) return null;
    return this.fetchWithCache(`/api/inflows/${protocolSlug}/${timestamp}`);
  }

  /**
   * PRO ONLY: Get protocol emissions/unlocks
   */
  async getUnlocks(protocolSlug) {
    if (!this.apiKey) return null;
    return this.fetchWithCache(`/api/emission/${protocolSlug}`);
  }

  /**
   * Get current prices for a list of tokens
   * coins: list of tokens like 'ethereum:0x...', 'solana:...'
   */
  async getPrices(coins) {
    const coinsStr = Array.isArray(coins) ? coins.join(',') : coins;
    const url = `https://coins.llama.fi/prices/current/${coinsStr}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (err) {
      return null;
    }
  }

  /**
   * Get price for a single symbol
   * Fallback to USDC=1.0 for common stablecoins in demo/missing data scenarios
   */
  async getPrice(symbol) {
    if (!symbol) return 0;
    const s = symbol.toUpperCase();
    if (s === 'USDC' || s === 'USDT' || s === 'DAI' || s === 'USDCX') return 1.0;
    
    try {
      const prices = await this.getPrices(`coingecko:${symbol.toLowerCase()}`);
      if (prices && prices.coins && Object.keys(prices.coins).length > 0) {
          return Object.values(prices.coins)[0].price;
      }
      return 0;
    } catch (err) {
      return 0;
    }
  }

  /**
   * Compute Risk Adjusted APY for a pool
   * This is a proprietary Vestra calculation using DefiLlama yields
   */
  async getRiskAdjustedAPY(poolId) {
    // This would typically use /yields/pools (Pro) and benchmark against Vestra's risk engine
    return 0.05; // Placeholder
  }
}

module.exports = new MarketDataService();
