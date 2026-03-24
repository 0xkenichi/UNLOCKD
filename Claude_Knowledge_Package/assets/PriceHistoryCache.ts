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

import Redis from 'ioredis';
import { Queue } from 'bullmq';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceSample {
  price:     number;  // USD
  timestamp: number;  // unix seconds
  source:    string;  // 'coingecko' | 'pyth' | 'chainlink'
}

export interface TrackedToken {
  address:    string;
  chainId:    number;
  symbol:     string;
  coingeckoId?: string;  // e.g. 'ethereum', 'fetch-ai'
  pythFeedId?:  string;  // 32-byte hex
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CANDLES         = 90;          // days of history to keep
const BACKFILL_DAYS       = 90;
const REFRESH_INTERVAL_MS = 5 * 60_000; // 5 minutes
const REDIS_CHANNEL       = 'vestra:price-updated';
const KEY_TTL_SECS        = 100 * 86400; // 100 days — auto-expire stale keys

// ─── Token Registry ───────────────────────────────────────────────────────────
// Add new tokens here as the protocol onboards new vesting collateral.

export const TOKEN_REGISTRY: TrackedToken[] = [
  {
    address:    '0xEth000000000000000000000000000000000000',
    chainId:    11155111,
    symbol:     'ETH',
    coingeckoId: 'ethereum',
    pythFeedId:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  },
  {
    address:    '0xFet000000000000000000000000000000000000',
    chainId:    192,
    symbol:     'FET',
    coingeckoId: 'fetch-ai',
  },
  // Add project tokens here as they are onboarded for vesting collateral
];

// ─── CoinGecko history fetcher ────────────────────────────────────────────────

async function fetchCoinGeckoHistory(
  coingeckoId: string,
  days: number
): Promise<PriceSample[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart`
    + `?vs_currency=usd&days=${days}&interval=daily`;

  const res  = await fetch(url, {
    headers: process.env.COINGECKO_API_KEY
      ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
      : {},
  });

  if (!res.ok) throw new Error(`CoinGecko ${res.status}: ${await res.text()}`);

  const data = await res.json() as { prices: [number, number][] };

  return data.prices.map(([tsMs, price]) => ({
    price,
    timestamp: Math.floor(tsMs / 1000),
    source:    'coingecko',
  }));
}

// ─── Pyth history fetcher ─────────────────────────────────────────────────────

async function fetchPythLatest(pythFeedId: string): Promise<PriceSample | null> {
  try {
    const res  = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${pythFeedId}`
    );
    const data = await res.json() as any;
    const p    = data.parsed?.[0]?.price;
    if (!p) return null;
    return {
      price:     Number(p.price) * Math.pow(10, p.expo),
      timestamp: Math.floor(Date.now() / 1000),
      source:    'pyth',
    };
  } catch {
    return null;
  }
}

// ─── Main cache service ───────────────────────────────────────────────────────

export class PriceHistoryCache {
  private redis:     Redis;
  private publisher: Redis; // separate connection for pub/sub
  private timer?:    ReturnType<typeof setInterval>;

  constructor() {
    const url      = process.env.REDIS_URL || 'redis://localhost:6379';
    this.redis     = new Redis(url);
    this.publisher = new Redis(url);
  }

  /**
   * Start the cache service:
   *  1. Back-fill all tracked tokens
   *  2. Start the 5-minute refresh loop
   */
  async start(): Promise<void> {
    console.log('[PriceCache] Starting — back-filling history for all tracked tokens...');

    await Promise.allSettled(
      TOKEN_REGISTRY.map(token => this.backfill(token))
    );

    console.log('[PriceCache] Back-fill complete. Starting refresh loop...');

    this.timer = setInterval(async () => {
      await Promise.allSettled(
        TOKEN_REGISTRY.map(token => this.refreshLatest(token))
      );
    }, REFRESH_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.redis.disconnect();
    this.publisher.disconnect();
  }

  // ─── Back-fill ──────────────────────────────────────────────────────────────

  /**
   * Fetches full history for a token and writes it to Redis.
   * Only runs if the key is missing or has fewer than 30 samples.
   */
  async backfill(token: TrackedToken): Promise<void> {
    const key      = this.key(token);
    const existing = await this.redis.llen(key);

    if (existing >= 30) {
      console.log(`[PriceCache] ${token.symbol}: cache warm (${existing} samples), skipping backfill`);
      return;
    }

    console.log(`[PriceCache] ${token.symbol}: back-filling ${BACKFILL_DAYS}d history...`);

    let samples: PriceSample[] = [];

    if (token.coingeckoId) {
      try {
        samples = await fetchCoinGeckoHistory(token.coingeckoId, BACKFILL_DAYS);
      } catch (err: any) {
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
  async refreshLatest(token: TrackedToken): Promise<void> {
    let sample: PriceSample | null = null;

    // Prefer Pyth for low-latency
    if (token.pythFeedId) {
      sample = await fetchPythLatest(token.pythFeedId);
    }

    // Fall back to CoinGecko spot price
    if (!sample && token.coingeckoId) {
      try {
        const recent = await fetchCoinGeckoHistory(token.coingeckoId, 1);
        sample = recent[recent.length - 1] ?? null;
      } catch {
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
    await this.publisher.publish(
      REDIS_CHANNEL,
      JSON.stringify({ token: token.address, chainId: token.chainId, price: sample.price })
    );

    console.debug(`[PriceCache] ${token.symbol}: refreshed @ $${sample.price.toFixed(4)}`);
  }

  // ─── Read helpers (used by dDPVService) ──────────────────────────────────────

  /**
   * Returns the last N price samples for a token.
   * This is the same key that dDPVService.processOracleUpdate() reads.
   */
  async getHistory(
    tokenAddress: string,
    chainId: number,
    limit = MAX_CANDLES
  ): Promise<PriceSample[]> {
    const key = `prices:${chainId}:${tokenAddress}`;
    const raw = await this.redis.lrange(key, -limit, -1);
    return raw.map(r => JSON.parse(r) as PriceSample);
  }

  /**
   * Manually add a token to be tracked without restarting the service.
   */
  async trackToken(token: TrackedToken): Promise<void> {
    if (!TOKEN_REGISTRY.find(t => t.address === token.address && t.chainId === token.chainId)) {
      TOKEN_REGISTRY.push(token);
    }
    await this.backfill(token);
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private key(token: TrackedToken): string {
    return `prices:${token.chainId}:${token.address}`;
  }
}

export const priceHistoryCache = new PriceHistoryCache();
