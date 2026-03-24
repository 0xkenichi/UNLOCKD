"use strict";
// @ts-nocheck
/**
 * PriceHistoryCache.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Populates and maintains the Redis price candle store that dDPVService reads
 * for adaptive EWMA computation.
 *
 * Without this service, dDPVService.processOracleUpdate() silently degrades:
 *   redisMock.lrange(`prices:{chainId}:{token}`) → []
 *   → computeAdaptiveEWMA([], currentPrice) → { ewmaPrice: currentPrice, lambdaBps: 9400 }
 *   → EWMA is just spot price, lambda is default — no vol-adaptation at all.
 *
 * This service fixes that by:
 *   1. On startup: back-fills 90 days of daily OHLC from CoinGecko / Pyth history
 *   2. Every 5 min: appends the latest price sample to each tracked token's list
 *   3. Keeps lists trimmed to exactly MAX_CANDLES entries (90 days)
 *   4. Publishes a Redis pub/sub event so dDPVService workers can react immediately
 *
 * Redis key format: `prices:{chainId}:{tokenAddress}` → JSON array of PriceSample
 * ─────────────────────────────────────────────────────────────────────────────
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceHistoryCache = exports.PriceHistoryCache = exports.TOKEN_REGISTRY = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_CANDLES = 90; // days of history to keep
const BACKFILL_DAYS = 90;
const REFRESH_INTERVAL_MS = 5 * 60_000; // 5 minutes
const REDIS_CHANNEL = 'vestra:price-updated';
const KEY_TTL_SECS = 100 * 86400; // 100 days — auto-expire stale keys
// ─── Token Registry ───────────────────────────────────────────────────────────
// Add new tokens here as the protocol onboards new vesting collateral.
exports.TOKEN_REGISTRY = [
    {
        address: '0xEth000000000000000000000000000000000000',
        chainId: 11155111,
        symbol: 'ETH',
        coingeckoId: 'ethereum',
        pythFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    },
    {
        address: '0xFet000000000000000000000000000000000000',
        chainId: 192,
        symbol: 'FET',
        coingeckoId: 'fetch-ai',
    },
    // Add project tokens here as they are onboarded for vesting collateral
];
// ─── CoinGecko history fetcher ────────────────────────────────────────────────
async function fetchCoinGeckoHistory(coingeckoId, days) {
    const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart`
        + `?vs_currency=usd&days=${days}&interval=daily`;
    const res = await fetch(url, {
        headers: process.env.COINGECKO_API_KEY
            ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
            : {},
    });
    if (!res.ok)
        throw new Error(`CoinGecko ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.prices.map(([tsMs, price]) => ({
        price,
        timestamp: Math.floor(tsMs / 1000),
        source: 'coingecko',
    }));
}
// ─── Pyth history fetcher ─────────────────────────────────────────────────────
async function fetchPythLatest(pythFeedId) {
    try {
        const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${pythFeedId}`);
        const data = await res.json();
        const p = data.parsed?.[0]?.price;
        if (!p)
            return null;
        return {
            price: Number(p.price) * Math.pow(10, p.expo),
            timestamp: Math.floor(Date.now() / 1000),
            source: 'pyth',
        };
    }
    catch {
        return null;
    }
}
// ─── Main cache service ───────────────────────────────────────────────────────
class PriceHistoryCache {
    redis;
    publisher; // separate connection for pub/sub
    timer;
    connected = false;
    constructor() {
        const url = process.env.REDIS_URL || 'redis://localhost:6379';
        this.redis = new ioredis_1.default(url, { maxRetriesPerRequest: null });
        this.publisher = new ioredis_1.default(url, { maxRetriesPerRequest: null });
        this.redis.on('connect', () => {
            this.connected = true;
            console.log('[PriceCache] Redis connected');
        });
        this.redis.on('error', (err) => {
            this.connected = false;
            console.warn('[PriceCache] Redis error:', err.message);
        });
        this.publisher.on('error', (err) => {
            console.warn('[PriceCache] Redis Publisher error:', err.message);
        });
    }
    /**
     * Start the cache service:
     *  1. Back-fill all tracked tokens
     *  2. Start the 5-minute refresh loop
     */
    async start() {
        console.log('[PriceCache] Starting — back-filling history for all tracked tokens...');
        await Promise.allSettled(exports.TOKEN_REGISTRY.map(token => this.backfill(token)));
        console.log('[PriceCache] Back-fill complete. Starting refresh loop...');
        this.timer = setInterval(async () => {
            await Promise.allSettled(exports.TOKEN_REGISTRY.map(token => this.refreshLatest(token)));
        }, REFRESH_INTERVAL_MS);
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.redis.disconnect();
        this.publisher.disconnect();
    }
    // ─── Back-fill ──────────────────────────────────────────────────────────────
    /**
     * Fetches full history for a token and writes it to Redis.
     * Only runs if the key is missing or has fewer than 30 samples.
     */
    async backfill(token) {
        if (!this.connected) {
            console.warn(`[PriceCache] Skipping backfill for ${token.symbol} (Redis disconnected)`);
            return;
        }
        const key = this.key(token);
        const existing = await this.redis.llen(key);
        if (existing >= 30) {
            console.log(`[PriceCache] ${token.symbol}: cache warm (${existing} samples), skipping backfill`);
            return;
        }
        console.log(`[PriceCache] ${token.symbol}: back-filling ${BACKFILL_DAYS}d history...`);
        let samples = [];
        if (token.coingeckoId) {
            try {
                samples = await fetchCoinGeckoHistory(token.coingeckoId, BACKFILL_DAYS);
            }
            catch (err) {
                console.warn(`[PriceCache] CoinGecko back-fill failed for ${token.symbol}:`, err.message);
            }
        }
        if (samples.length === 0) {
            console.warn(`[PriceCache] No history available for ${token.symbol} — skipping`);
            return;
        }
        // Write as JSON-serialised list, newest last
        const pipeline = this.redis.pipeline();
        pipeline.del(key);
        for (const sample of samples.slice(-MAX_CANDLES)) {
            pipeline.rpush(key, JSON.stringify(sample));
        }
        pipeline.expire(key, KEY_TTL_SECS);
        await pipeline.exec();
        console.log(`[PriceCache] ${token.symbol}: wrote ${Math.min(samples.length, MAX_CANDLES)} samples`);
    }
    // ─── Incremental refresh ─────────────────────────────────────────────────────
    /**
     * Appends the latest price sample and trims to MAX_CANDLES.
     * Publishes a pub/sub event so dDPVService workers can react immediately.
     */
    async refreshLatest(token) {
        if (!this.connected)
            return;
        let sample = null;
        // Prefer Pyth for low-latency
        if (token.pythFeedId) {
            sample = await fetchPythLatest(token.pythFeedId);
        }
        // Fall back to CoinGecko spot price
        if (!sample && token.coingeckoId) {
            try {
                const recent = await fetchCoinGeckoHistory(token.coingeckoId, 1);
                sample = recent[recent.length - 1] ?? null;
            }
            catch {
                /* silent */
            }
        }
        if (!sample) {
            console.warn(`[PriceCache] Could not refresh price for ${token.symbol}`);
            return;
        }
        const key = this.key(token);
        const pipeline = this.redis.pipeline();
        pipeline.rpush(key, JSON.stringify(sample));
        pipeline.ltrim(key, -MAX_CANDLES, -1); // keep newest MAX_CANDLES only
        pipeline.expire(key, KEY_TTL_SECS);
        await pipeline.exec();
        // Notify dDPVService workers
        await this.publisher.publish(REDIS_CHANNEL, JSON.stringify({ token: token.address, chainId: token.chainId, price: sample.price }));
        console.debug(`[PriceCache] ${token.symbol}: refreshed @ $${sample.price.toFixed(4)}`);
    }
    // ─── Read helpers (used by dDPVService) ──────────────────────────────────────
    /**
     * Returns the last N price samples for a token.
     * This is the same key that dDPVService.processOracleUpdate() reads.
     */
    async getHistory(tokenAddress, chainId, limit = MAX_CANDLES) {
        if (!this.connected)
            return [];
        const key = `prices:${chainId}:${tokenAddress}`;
        const raw = await this.redis.lrange(key, -limit, -1);
        return raw.map(r => JSON.parse(r));
    }
    /**
     * Manually add a token to be tracked without restarting the service.
     */
    async trackToken(token) {
        if (!exports.TOKEN_REGISTRY.find(t => t.address === token.address && t.chainId === token.chainId)) {
            exports.TOKEN_REGISTRY.push(token);
        }
        await this.backfill(token);
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    key(token) {
        return `prices:${token.chainId}:${token.address}`;
    }
}
exports.PriceHistoryCache = PriceHistoryCache;
exports.priceHistoryCache = new PriceHistoryCache();
